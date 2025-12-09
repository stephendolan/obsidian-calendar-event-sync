import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalendarService, CalendarEvent } from "../src/calendar";
import { PluginSettings, DEFAULT_SETTINGS } from "../src/settings";
import * as ical from "node-ical";
import { RRule } from "rrule";

function createSettings(
	overrides: Partial<PluginSettings> = {}
): PluginSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function createRecurringEvent(
	rruleString: string,
	overrides: Partial<ical.VEvent> = {}
): ical.VEvent {
	const now = new Date();
	const start = new Date(now.getTime());
	start.setHours(10, 0, 0, 0);
	const end = new Date(start.getTime() + 60 * 60 * 1000);

	return {
		type: "VEVENT",
		summary: "Recurring Meeting",
		start: start as ical.DateWithTimeZone,
		end: end as ical.DateWithTimeZone,
		status: "CONFIRMED",
		rrule: {
			toString: () => rruleString,
		} as any,
		...overrides,
	} as ical.VEvent;
}

describe("Recurring Events", () => {
	describe("CalendarService.processEvents with recurring events", () => {
		it("expands daily recurring events", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const dailyEvent = createRecurringEvent("FREQ=DAILY;COUNT=5");

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": dailyEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result.length).toBeGreaterThan(1);
			result.forEach((event: CalendarEvent) => {
				expect(event.summary).toBe("Recurring Meeting");
			});
		});

		it("expands weekly recurring events", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const weeklyEvent = createRecurringEvent("FREQ=WEEKLY;COUNT=4");

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": weeklyEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result.length).toBeGreaterThanOrEqual(1);
		});

		it("excludes events with exdates", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const now = new Date();
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
			tomorrow.setHours(10, 0, 0, 0);
			const tomorrowDateStr = tomorrow.toISOString().split("T")[0];

			const eventWithExdate = createRecurringEvent("FREQ=DAILY;COUNT=5", {
				exdate: tomorrow as ical.DateWithTimeZone,
			});

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": eventWithExdate,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			const hasExcludedDate = result.some((event: CalendarEvent) => {
				const eventDate = event.start.toISOString().split("T")[0];
				return eventDate === tomorrowDateStr;
			});

			expect(hasExcludedDate).toBe(false);
		});

		it("handles multiple exdates", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const now = new Date();
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
			tomorrow.setHours(10, 0, 0, 0);
			const dayAfter = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
			dayAfter.setHours(10, 0, 0, 0);

			const tomorrowDateStr = tomorrow.toISOString().split("T")[0];
			const dayAfterDateStr = dayAfter.toISOString().split("T")[0];

			const excludedDates = [tomorrow, dayAfter];
			const eventWithExdates = createRecurringEvent("FREQ=DAILY;COUNT=7", {
				exdate: excludedDates as ical.DateWithTimeZone[],
			});

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": eventWithExdates,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			const dates = result.map((event: CalendarEvent) =>
				event.start.toISOString().split("T")[0]
			);

			expect(dates).not.toContain(tomorrowDateStr);
			expect(dates).not.toContain(dayAfterDateStr);
		});

		it("skips events the user has declined", () => {
			const settings = createSettings({
				calendarOwnerEmail: "me@example.com",
			});
			const service = new CalendarService(settings);

			const declinedEvent = createRecurringEvent("FREQ=DAILY;COUNT=3", {
				attendee: [
					{
						params: { CN: "me@example.com", PARTSTAT: "DECLINED" },
						val: "mailto:me@example.com",
					},
				] as any,
			});

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": declinedEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(0);
		});

		it("skips cancelled events", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const cancelledEvent = createRecurringEvent("FREQ=DAILY;COUNT=3", {
				status: "CANCELLED",
			});

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": cancelledEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(0);
		});

		it("skips ignored events", () => {
			const settings = createSettings({
				ignoredEventTitles: ["Recurring Meeting"],
			});
			const service = new CalendarService(settings);

			const ignoredEvent = createRecurringEvent("FREQ=DAILY;COUNT=3");

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": ignoredEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(0);
		});

		it("does not expand recurrence modification events directly", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const modificationEvent: ical.VEvent = {
				type: "VEVENT",
				summary: "Modified Instance",
				start: new Date("2024-01-16T14:00:00Z") as ical.DateWithTimeZone,
				end: new Date("2024-01-16T15:00:00Z") as ical.DateWithTimeZone,
				status: "CONFIRMED",
				recurrenceid: new Date(
					"2024-01-16T10:00:00Z"
				) as ical.DateWithTimeZone,
			} as ical.VEvent;

			const mockCalendarResponse: ical.CalendarResponse = {
				"mod-1": modificationEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(0);
		});

		it("handles recurring events with modifications", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const now = new Date();
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
			tomorrow.setHours(10, 0, 0, 0);
			const tomorrowKey = tomorrow.toISOString();

			const baseEvent = createRecurringEvent("FREQ=DAILY;COUNT=5", {
				recurrences: {
					[tomorrowKey]: {
						type: "VEVENT",
						summary: "Modified Tomorrow",
						start: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),
						end: new Date(tomorrow.getTime() + 5 * 60 * 60 * 1000),
						status: "CONFIRMED",
						recurrenceid: tomorrow,
					} as ical.VEvent,
				},
			});

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": baseEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			const modifiedInstance = result.find(
				(e: CalendarEvent) => e.summary === "Modified Tomorrow"
			);
			expect(modifiedInstance).toBeDefined();
		});
	});

	describe("occurrence date generation", () => {
		it("generates occurrences within the 30-day future window", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const farFutureEvent = createRecurringEvent("FREQ=DAILY;COUNT=100");

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": farFutureEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			const now = new Date();
			const thirtyDaysFromNow = new Date(
				now.getTime() + 30 * 24 * 60 * 60 * 1000
			);

			expect(result.length).toBeGreaterThan(0);
			expect(result.length).toBeLessThanOrEqual(31);
			result.forEach((event: CalendarEvent) => {
				expect(event.start.getTime()).toBeLessThanOrEqual(
					thirtyDaysFromNow.getTime()
				);
			});
		});
	});

	describe("non-recurring events", () => {
		it("includes non-recurring events in results", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const singleEvent: ical.VEvent = {
				type: "VEVENT",
				summary: "One-time Meeting",
				start: new Date() as ical.DateWithTimeZone,
				end: new Date(
					Date.now() + 60 * 60 * 1000
				) as ical.DateWithTimeZone,
				status: "CONFIRMED",
			} as ical.VEvent;

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": singleEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(1);
			expect(result[0].summary).toBe("One-time Meeting");
		});

		it("excludes old non-recurring events", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const oldEvent: ical.VEvent = {
				type: "VEVENT",
				summary: "Old Meeting",
				start: new Date("2020-01-15T10:00:00Z") as ical.DateWithTimeZone,
				end: new Date("2020-01-15T11:00:00Z") as ical.DateWithTimeZone,
				status: "CONFIRMED",
			} as ical.VEvent;

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": oldEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(0);
		});

		it("skips non-VEVENT items in calendar response", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const vcalendarItem = {
				type: "VCALENDAR",
				prodid: "-//Test//Test//EN",
			};

			const vtodoItem = {
				type: "VTODO",
				summary: "A todo item",
			};

			const mockCalendarResponse: ical.CalendarResponse = {
				calendar: vcalendarItem as any,
				todo: vtodoItem as any,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result).toHaveLength(0);
		});
	});

	describe("event sorting", () => {
		it("sorts events by start time ascending", () => {
			const settings = createSettings();
			const service = new CalendarService(settings);

			const laterEvent: ical.VEvent = {
				type: "VEVENT",
				summary: "Later Meeting",
				start: new Date(
					Date.now() + 3 * 60 * 60 * 1000
				) as ical.DateWithTimeZone,
				end: new Date(
					Date.now() + 4 * 60 * 60 * 1000
				) as ical.DateWithTimeZone,
				status: "CONFIRMED",
			} as ical.VEvent;

			const earlierEvent: ical.VEvent = {
				type: "VEVENT",
				summary: "Earlier Meeting",
				start: new Date(
					Date.now() + 1 * 60 * 60 * 1000
				) as ical.DateWithTimeZone,
				end: new Date(
					Date.now() + 2 * 60 * 60 * 1000
				) as ical.DateWithTimeZone,
				status: "CONFIRMED",
			} as ical.VEvent;

			const mockCalendarResponse: ical.CalendarResponse = {
				"event-1": laterEvent,
				"event-2": earlierEvent,
			};

			const processEvents = (service as any).processEvents.bind(service);
			const result = processEvents(mockCalendarResponse);

			expect(result[0].summary).toBe("Earlier Meeting");
			expect(result[1].summary).toBe("Later Meeting");
		});
	});
});

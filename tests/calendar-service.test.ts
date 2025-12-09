import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalendarEvent, CalendarService } from "../src/calendar";
import { PluginSettings, DEFAULT_SETTINGS } from "../src/settings";
import * as ical from "node-ical";

function createMockEvent(overrides: Partial<ical.VEvent> = {}): ical.VEvent {
	const now = new Date();
	const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

	return {
		type: "VEVENT",
		summary: "Test Meeting",
		start: now,
		end: oneHourLater,
		status: "CONFIRMED",
		...overrides,
	} as ical.VEvent;
}

function createSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function createCalendarEvent(
	eventOverrides: Partial<ical.VEvent> = {},
	settingsOverrides: Partial<PluginSettings> = {}
): CalendarEvent {
	return new CalendarEvent(
		createMockEvent(eventOverrides),
		createSettings(settingsOverrides)
	);
}

describe("CalendarService", () => {
	describe("findClosestEvent", () => {
		it("returns currently occurring event first", () => {
			const now = new Date("2024-01-15T10:30:00Z");
			const settings = createSettings();
			const service = new CalendarService(settings);

			const currentEvent = createCalendarEvent({
				summary: "Current Meeting",
				start: new Date("2024-01-15T10:00:00Z") as ical.DateWithTimeZone,
				end: new Date("2024-01-15T11:00:00Z") as ical.DateWithTimeZone,
			});

			const upcomingEvent = createCalendarEvent({
				summary: "Upcoming Meeting",
				start: new Date("2024-01-15T12:00:00Z") as ical.DateWithTimeZone,
				end: new Date("2024-01-15T13:00:00Z") as ical.DateWithTimeZone,
			});

			const result = service.findClosestEvent(
				[currentEvent, upcomingEvent],
				now
			);
			expect(result?.summary).toBe("Current Meeting");
		});

		it("returns soonest upcoming event when no current event", () => {
			const now = new Date("2024-01-15T10:00:00Z");
			const settings = createSettings({ eventFutureHourLimit: 4 });
			const service = new CalendarService(settings);

			const laterEvent = createCalendarEvent(
				{
					summary: "Later Meeting",
					start: new Date("2024-01-15T13:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T14:00:00Z") as ical.DateWithTimeZone,
				},
				{ eventFutureHourLimit: 4 }
			);

			const soonerEvent = createCalendarEvent(
				{
					summary: "Sooner Meeting",
					start: new Date("2024-01-15T11:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T12:00:00Z") as ical.DateWithTimeZone,
				},
				{ eventFutureHourLimit: 4 }
			);

			const result = service.findClosestEvent(
				[laterEvent, soonerEvent],
				now
			);
			expect(result?.summary).toBe("Sooner Meeting");
		});

		it("returns most recently ended event when no current or upcoming", () => {
			const now = new Date("2024-01-15T14:00:00Z");
			const settings = createSettings({ eventRecentHourLimit: 4 });
			const service = new CalendarService(settings);

			const olderEvent = createCalendarEvent(
				{
					summary: "Older Meeting",
					start: new Date("2024-01-15T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T11:00:00Z") as ical.DateWithTimeZone,
				},
				{ eventRecentHourLimit: 4 }
			);

			const recentEvent = createCalendarEvent(
				{
					summary: "Recent Meeting",
					start: new Date("2024-01-15T12:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T13:00:00Z") as ical.DateWithTimeZone,
				},
				{ eventRecentHourLimit: 4 }
			);

			const result = service.findClosestEvent(
				[olderEvent, recentEvent],
				now
			);
			expect(result?.summary).toBe("Recent Meeting");
		});

		it("returns null when no relevant events", () => {
			const now = new Date("2024-01-15T10:00:00Z");
			const settings = createSettings({
				eventFutureHourLimit: 1,
				eventRecentHourLimit: 1,
			});
			const service = new CalendarService(settings);

			const farFutureEvent = createCalendarEvent(
				{
					summary: "Far Future",
					start: new Date("2024-01-15T20:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T21:00:00Z") as ical.DateWithTimeZone,
				},
				{ eventFutureHourLimit: 1, eventRecentHourLimit: 1 }
			);

			const result = service.findClosestEvent([farFutureEvent], now);
			expect(result).toBeNull();
		});

		it("excludes ignored events", () => {
			const now = new Date("2024-01-15T10:30:00Z");
			const settings = createSettings({ ignoredEventTitles: ["Lunch"] });
			const service = new CalendarService(settings);

			const ignoredEvent = createCalendarEvent(
				{
					summary: "Lunch",
					start: new Date("2024-01-15T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T11:00:00Z") as ical.DateWithTimeZone,
				},
				{ ignoredEventTitles: ["Lunch"] }
			);

			const result = service.findClosestEvent([ignoredEvent], now);
			expect(result).toBeNull();
		});

		it("excludes declined events", () => {
			const now = new Date("2024-01-15T10:30:00Z");
			const settings = createSettings({
				calendarOwnerEmail: "me@example.com",
			});
			const service = new CalendarService(settings);

			const declinedEvent = createCalendarEvent(
				{
					summary: "Declined Meeting",
					start: new Date("2024-01-15T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-15T11:00:00Z") as ical.DateWithTimeZone,
					attendee: [
						{
							params: { CN: "me@example.com", PARTSTAT: "DECLINED" },
							val: "mailto:me@example.com",
						},
					] as any,
				},
				{ calendarOwnerEmail: "me@example.com" }
			);

			const result = service.findClosestEvent([declinedEvent], now);
			expect(result).toBeNull();
		});
	});

	describe("getSelectableEvents", () => {
		it("returns events within selectable date range", () => {
			const now = new Date("2024-01-15T12:00:00Z");
			const settings = createSettings({
				selectablePastDays: 1,
				selectableFutureDays: 3,
			});
			const service = new CalendarService(settings);

			const withinRange = createCalendarEvent(
				{
					summary: "Within Range",
					start: new Date("2024-01-16T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-16T11:00:00Z") as ical.DateWithTimeZone,
				},
				{ selectablePastDays: 1, selectableFutureDays: 3 }
			);

			const tooFuture = createCalendarEvent(
				{
					summary: "Too Future",
					start: new Date("2024-01-25T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-25T11:00:00Z") as ical.DateWithTimeZone,
				},
				{ selectablePastDays: 1, selectableFutureDays: 3 }
			);

			const tooPast = createCalendarEvent(
				{
					summary: "Too Past",
					start: new Date("2024-01-10T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-10T11:00:00Z") as ical.DateWithTimeZone,
				},
				{ selectablePastDays: 1, selectableFutureDays: 3 }
			);

			const result = service.getSelectableEvents(
				[withinRange, tooFuture, tooPast],
				now
			);

			expect(result).toHaveLength(1);
			expect(result[0].summary).toBe("Within Range");
		});

		it("excludes ignored events", () => {
			const now = new Date("2024-01-15T12:00:00Z");
			const settings = createSettings({
				selectablePastDays: 1,
				selectableFutureDays: 3,
				ignoredEventTitles: ["Lunch"],
			});
			const service = new CalendarService(settings);

			const normalEvent = createCalendarEvent(
				{
					summary: "Normal Event",
					start: new Date("2024-01-16T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-16T11:00:00Z") as ical.DateWithTimeZone,
				},
				{
					selectablePastDays: 1,
					selectableFutureDays: 3,
					ignoredEventTitles: ["Lunch"],
				}
			);

			const ignoredEvent = createCalendarEvent(
				{
					summary: "Lunch",
					start: new Date("2024-01-16T12:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-16T13:00:00Z") as ical.DateWithTimeZone,
				},
				{
					selectablePastDays: 1,
					selectableFutureDays: 3,
					ignoredEventTitles: ["Lunch"],
				}
			);

			const result = service.getSelectableEvents(
				[normalEvent, ignoredEvent],
				now
			);

			expect(result).toHaveLength(1);
			expect(result[0].summary).toBe("Normal Event");
		});

		it("includes events from yesterday within past days limit", () => {
			const now = new Date("2024-01-15T12:00:00Z");
			const settings = createSettings({
				selectablePastDays: 2,
				selectableFutureDays: 1,
			});
			const service = new CalendarService(settings);

			const yesterdayEvent = createCalendarEvent(
				{
					summary: "Yesterday Event",
					start: new Date("2024-01-14T10:00:00Z") as ical.DateWithTimeZone,
					end: new Date("2024-01-14T11:00:00Z") as ical.DateWithTimeZone,
				},
				{ selectablePastDays: 2, selectableFutureDays: 1 }
			);

			const result = service.getSelectableEvents([yesterdayEvent], now);

			expect(result).toHaveLength(1);
			expect(result[0].summary).toBe("Yesterday Event");
		});
	});

	describe("fetchEvents", () => {
		it("throws error when no ICS URL configured", async () => {
			const settings = createSettings({ calendarICSUrl: undefined });
			const service = new CalendarService(settings);

			await expect(service.fetchEvents()).rejects.toThrow(
				"No ICS URL provided"
			);
		});

		it("throws error when ICS URL is empty string", async () => {
			const settings = createSettings({ calendarICSUrl: "" });
			const service = new CalendarService(settings);

			await expect(service.fetchEvents()).rejects.toThrow(
				"No ICS URL provided"
			);
		});
	});
});

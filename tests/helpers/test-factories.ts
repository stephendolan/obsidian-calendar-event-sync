import * as ical from "node-ical";
import { PluginSettings, DEFAULT_SETTINGS } from "../../src/settings";
import { CalendarEvent } from "../../src/calendar";

export function createMockEvent(
	overrides: Partial<ical.VEvent> = {}
): ical.VEvent {
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

export function createSettings(
	overrides: Partial<PluginSettings> = {}
): PluginSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

export function createCalendarEvent(
	eventOverrides: Partial<ical.VEvent> = {},
	settingsOverrides: Partial<PluginSettings> = {}
): CalendarEvent {
	return new CalendarEvent(
		createMockEvent(eventOverrides),
		createSettings(settingsOverrides)
	);
}

export function createRecurringEvent(
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

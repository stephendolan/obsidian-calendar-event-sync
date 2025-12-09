import { describe, it, expect, beforeEach } from "vitest";
import { CalendarEvent } from "../src/calendar";
import * as ical from "node-ical";
import { createMockEvent, createSettings } from "./helpers/test-factories";

describe("CalendarEvent", () => {
	describe("basic properties", () => {
		it("returns the event summary", () => {
			const event = new CalendarEvent(
				createMockEvent({ summary: "My Meeting" }),
				createSettings()
			);
			expect(event.summary).toBe("My Meeting");
		});

		it("returns the start date", () => {
			const startDate = new Date("2024-01-15T10:00:00Z");
			const event = new CalendarEvent(
				createMockEvent({ start: startDate as ical.DateWithTimeZone }),
				createSettings()
			);
			expect(event.start).toEqual(startDate);
		});

		it("returns the end date", () => {
			const endDate = new Date("2024-01-15T11:00:00Z");
			const event = new CalendarEvent(
				createMockEvent({ end: endDate as ical.DateWithTimeZone }),
				createSettings()
			);
			expect(event.end).toEqual(endDate);
		});
	});

	describe("attendees", () => {
		it("returns default attendee when no attendees present", () => {
			const event = new CalendarEvent(createMockEvent(), createSettings());
			const attendees = event.attendees;

			expect(attendees).toHaveLength(1);
			expect(attendees[0].params.CN).toContain("Not visible");
		});

		it("returns attendees from attendee property", () => {
			const mockAttendees = [
				{ params: { CN: "Alice" }, val: "mailto:alice@example.com" },
				{ params: { CN: "Bob" }, val: "mailto:bob@example.com" },
			];
			const event = new CalendarEvent(
				createMockEvent({ attendee: mockAttendees as any }),
				createSettings()
			);

			expect(event.attendees).toHaveLength(2);
			expect(event.attendees[0].params.CN).toBe("Alice");
			expect(event.attendees[1].params.CN).toBe("Bob");
		});

		it("wraps single attendee in array", () => {
			const singleAttendee = {
				params: { CN: "Solo" },
				val: "mailto:solo@example.com",
			};
			const event = new CalendarEvent(
				createMockEvent({ attendee: singleAttendee as any }),
				createSettings()
			);

			expect(event.attendees).toHaveLength(1);
			expect(event.attendees[0].params.CN).toBe("Solo");
		});
	});

	describe("isAttending", () => {
		it("returns true when no owner email configured", () => {
			const event = new CalendarEvent(
				createMockEvent(),
				createSettings({ calendarOwnerEmail: undefined })
			);
			expect(event.isAttending()).toBe(true);
		});

		it("returns true when owner is attending", () => {
			const attendees = [
				{
					params: { CN: "owner@example.com", PARTSTAT: "ACCEPTED" },
					val: "mailto:owner@example.com",
				},
			];
			const event = new CalendarEvent(
				createMockEvent({ attendee: attendees as any }),
				createSettings({ calendarOwnerEmail: "owner@example.com" })
			);
			expect(event.isAttending()).toBe(true);
		});

		it("returns false when owner has declined", () => {
			const attendees = [
				{
					params: { CN: "owner@example.com", PARTSTAT: "DECLINED" },
					val: "mailto:owner@example.com",
				},
			];
			const event = new CalendarEvent(
				createMockEvent({ attendee: attendees as any }),
				createSettings({ calendarOwnerEmail: "owner@example.com" })
			);
			expect(event.isAttending()).toBe(false);
		});

		it("returns false when owner not in attendee list", () => {
			const attendees = [
				{
					params: { CN: "other@example.com", PARTSTAT: "ACCEPTED" },
					val: "mailto:other@example.com",
				},
			];
			const event = new CalendarEvent(
				createMockEvent({ attendee: attendees as any }),
				createSettings({ calendarOwnerEmail: "owner@example.com" })
			);
			expect(event.isAttending()).toBe(false);
		});
	});

	describe("isIgnored", () => {
		it("returns false when event not in ignored list", () => {
			const event = new CalendarEvent(
				createMockEvent({ summary: "Important Meeting" }),
				createSettings({ ignoredEventTitles: ["Lunch", "Break"] })
			);
			expect(event.isIgnored()).toBe(false);
		});

		it("returns true when event is in ignored list", () => {
			const event = new CalendarEvent(
				createMockEvent({ summary: "Lunch" }),
				createSettings({ ignoredEventTitles: ["Lunch", "Break"] })
			);
			expect(event.isIgnored()).toBe(true);
		});

		it("returns false when ignored list is empty", () => {
			const event = new CalendarEvent(
				createMockEvent({ summary: "Any Event" }),
				createSettings({ ignoredEventTitles: [] })
			);
			expect(event.isIgnored()).toBe(false);
		});
	});

	describe("isCancelled", () => {
		it("returns true when status is CANCELLED", () => {
			const event = new CalendarEvent(
				createMockEvent({ status: "CANCELLED" }),
				createSettings()
			);
			expect(event.isCancelled()).toBe(true);
		});

		it("returns false when status is CONFIRMED", () => {
			const event = new CalendarEvent(
				createMockEvent({ status: "CONFIRMED" }),
				createSettings()
			);
			expect(event.isCancelled()).toBe(false);
		});
	});

	describe("isActivelyOccurring", () => {
		it("returns true when now is between start and end", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z");
			const now = new Date("2024-01-15T10:30:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			expect(event.isActivelyOccurring(now)).toBe(true);
		});

		it("returns false when now is before start", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z");
			const now = new Date("2024-01-15T09:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			expect(event.isActivelyOccurring(now)).toBe(false);
		});

		it("returns false when now is after end", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z");
			const now = new Date("2024-01-15T12:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			expect(event.isActivelyOccurring(now)).toBe(false);
		});

		it("returns true at exact start time", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			expect(event.isActivelyOccurring(start)).toBe(true);
		});
	});

	describe("isUpcoming", () => {
		it("returns true for event starting within future hour limit", () => {
			const now = new Date("2024-01-15T10:00:00Z");
			const start = new Date("2024-01-15T12:00:00Z"); // 2 hours from now
			const end = new Date("2024-01-15T13:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings({ eventFutureHourLimit: 4 })
			);

			expect(event.isUpcoming(now)).toBe(true);
		});

		it("returns false for event starting beyond future hour limit", () => {
			const now = new Date("2024-01-15T10:00:00Z");
			const start = new Date("2024-01-15T16:00:00Z"); // 6 hours from now
			const end = new Date("2024-01-15T17:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings({ eventFutureHourLimit: 4 })
			);

			expect(event.isUpcoming(now)).toBe(false);
		});

		it("returns false for event that has already started", () => {
			const now = new Date("2024-01-15T10:30:00Z");
			const start = new Date("2024-01-15T10:00:00Z"); // 30 minutes ago
			const end = new Date("2024-01-15T11:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings({ eventFutureHourLimit: 4 })
			);

			expect(event.isUpcoming(now)).toBe(false);
		});
	});

	describe("isRecent", () => {
		it("returns true for event that ended within recent hour limit", () => {
			const now = new Date("2024-01-15T12:00:00Z");
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z"); // 1 hour ago

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings({ eventRecentHourLimit: 2 })
			);

			expect(event.isRecent(now)).toBe(true);
		});

		it("returns false for event that ended beyond recent hour limit", () => {
			const now = new Date("2024-01-15T15:00:00Z");
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z"); // 4 hours ago

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings({ eventRecentHourLimit: 2 })
			);

			expect(event.isRecent(now)).toBe(false);
		});

		it("returns false for event that hasn't ended yet", () => {
			const now = new Date("2024-01-15T10:30:00Z");
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T11:00:00Z"); // 30 minutes in future

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings({ eventRecentHourLimit: 2 })
			);

			expect(event.isRecent(now)).toBe(false);
		});
	});

	describe("generateTitle", () => {
		it("formats title with date and normalized summary", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const event = new CalendarEvent(
				createMockEvent({
					summary: "Team Meeting",
					start: start as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			expect(event.generateTitle()).toBe("📆 2024-01-15, Team Meeting");
		});

		it("replaces slashes and colons in summary", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const event = new CalendarEvent(
				createMockEvent({
					summary: "Meeting: Project/Feature Review",
					start: start as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			expect(event.generateTitle()).toBe(
				"📆 2024-01-15, Meeting  Project Feature Review"
			);
		});
	});

	describe("generateDisplayName", () => {
		it("includes date, time, duration, and title", () => {
			const start = new Date("2024-01-15T14:00:00Z");
			const end = new Date("2024-01-15T15:30:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					summary: "Standup",
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			const displayName = event.generateDisplayName();
			expect(displayName).toContain("Standup");
			expect(displayName).toContain("1h 30m");
		});
	});

	describe("generateAttendeesListMarkdown", () => {
		it("generates markdown list of attendees", () => {
			const attendees = [
				{ params: { CN: "Alice" }, val: "mailto:alice@example.com" },
				{ params: { CN: "Bob" }, val: "mailto:bob@example.com" },
			];
			const event = new CalendarEvent(
				createMockEvent({ attendee: attendees as any }),
				createSettings()
			);

			const markdown = event.generateAttendeesListMarkdown();
			expect(markdown).toBe("## Attendees:\n- Alice\n- Bob\n");
		});

		it("extracts email when CN is not available", () => {
			const attendees = [
				{ params: {}, val: "mailto:alice@example.com" },
			];
			const event = new CalendarEvent(
				createMockEvent({ attendee: attendees as any }),
				createSettings()
			);

			const markdown = event.generateAttendeesListMarkdown();
			expect(markdown).toBe("## Attendees:\n- alice@example.com\n");
		});
	});

	describe("duration calculation", () => {
		it("calculates hours and minutes correctly", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T12:30:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			const displayName = event.generateDisplayName();
			expect(displayName).toContain("2h 30m");
		});

		it("shows only hours when no minutes", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T12:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			const displayName = event.generateDisplayName();
			expect(displayName).toContain("2h");
			expect(displayName).not.toContain("0m");
		});

		it("shows only minutes when less than an hour", () => {
			const start = new Date("2024-01-15T10:00:00Z");
			const end = new Date("2024-01-15T10:45:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: start as ical.DateWithTimeZone,
					end: end as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			const displayName = event.generateDisplayName();
			expect(displayName).toContain("45m");
		});

		it("shows 0m for zero-length events", () => {
			const time = new Date("2024-01-15T10:00:00Z");

			const event = new CalendarEvent(
				createMockEvent({
					start: time as ical.DateWithTimeZone,
					end: time as ical.DateWithTimeZone,
				}),
				createSettings()
			);

			const displayName = event.generateDisplayName();
			expect(displayName).toContain("0m");
		});
	});
});

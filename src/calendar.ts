import * as ical from "node-ical";
import { RRule, RRuleSet } from "rrule";
import { PluginSettings } from "./settings";
import { request } from "obsidian";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export class CalendarEvent {
	constructor(private event: ical.VEvent, private settings: PluginSettings) {}

	get summary(): string {
		return this.event.summary;
	}

	get start(): Date {
		return this.event.start;
	}

	get end(): Date {
		return this.event.end;
	}

	get attendees(): any[] {
		const DEFAULT_ATTENDEE = {
			params: {
				CN: "Not visible for this event from ICS. Check your URL options.",
			},
			val: "no-attendees",
		};

		const possibleAttendeeProperties = [
			this.event.attendee,
			(this.event as any).attendees,
			(this.event as any).ATTENDEE,
			(this.event as any).attendeeList,
		];

		const attendees = possibleAttendeeProperties.find(
			(prop) => prop !== undefined
		);

		if (!attendees) {
			return [DEFAULT_ATTENDEE];
		}

		return Array.isArray(attendees) ? attendees : [attendees];
	}

	isAttending(): boolean {
		const calendarOwnerEmail = this.settings.calendarOwnerEmail;
		if (!calendarOwnerEmail) return true;

		return this.attendees.some(
			(attendee: any) =>
				attendee.params.CN === calendarOwnerEmail &&
				attendee.params.PARTSTAT !== "DECLINED"
		);
	}

	isIgnored(): boolean {
		return (
			this.settings.ignoredEventTitles?.includes(this.summary) || false
		);
	}

	isCancelled(): boolean {
		return this.event.status === "CANCELLED";
	}

	isActivelyOccurring(now: Date): boolean {
		return now >= this.start && now <= this.end;
	}

	isUpcoming(now: Date): boolean {
		const futureStartLimit = new Date(
			now.getTime() + this.settings.eventFutureHourLimit * MS_PER_HOUR
		);
		return now < this.start && this.start <= futureStartLimit;
	}

	isRecent(now: Date): boolean {
		const pastEndLimit = new Date(
			now.getTime() - this.settings.eventRecentHourLimit * MS_PER_HOUR
		);
		return pastEndLimit <= this.end && this.end < now;
	}

	private getLocalStart(): Date {
		return new Date(
			this.start.toLocaleString("en-US", {
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			})
		);
	}

	generateTitle(): string {
		const localStart = this.getLocalStart();
		const year = localStart.getFullYear();
		const month = String(localStart.getMonth() + 1).padStart(2, "0");
		const day = String(localStart.getDate()).padStart(2, "0");
		const formattedDate = `${year}-${month}-${day}`;
		return `📆 ${formattedDate}, ${this.normalizeEventTitle(this.summary)}`;
	}

	generateDisplayName(): string {
		const localStart = this.getLocalStart();

		const formattedDate = localStart.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
		const startTime = localStart.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		});
		const duration = this.calculateDuration();
		return `${formattedDate} | ${startTime} | ${duration} | ${this.normalizeEventTitle(
			this.summary
		)}`;
	}

	generateAttendeesListMarkdown(): string {
		let attendeesList = "## Attendees:\n";
		this.attendees.forEach((attendee: any) => {
			const attendeeName =
				attendee.params?.CN ||
				this.extractEmailFromVal(
					attendee.val || attendee.value || attendee
				);
			attendeesList += `- ${attendeeName}\n`;
		});
		return attendeesList;
	}

	private calculateDuration(): string {
		const startMs = this.start.getTime();
		const endMs = this.end.getTime();
		const durationMs = endMs - startMs;

		const hours = Math.floor(durationMs / 3600000);
		const minutes = Math.floor((durationMs % 3600000) / 60000);
		return (
			`${hours ? `${hours}h` : ""}${
				minutes ? ` ${minutes}m` : ""
			}`.trim() || "0m"
		);
	}

	private normalizeEventTitle(eventSummary: string): string {
		return eventSummary.replace(/[/:]/g, " ");
	}

	private extractEmailFromVal(val: string): string {
		if (!val) return "Unknown";
		const match =
			val.match(/mailto:(.*)/i) || val.match(/^([^@]+@[^\s]+)$/i);
		return match ? match[1] : val;
	}
}

export class CalendarService {
	constructor(private settings: PluginSettings) {}

	async fetchEvents(): Promise<CalendarEvent[]> {
		const icsUrl = this.settings.calendarICSUrl;
		if (!icsUrl) throw new Error("No ICS URL provided in settings.");

		let response: string;
		try {
			response = await request({ url: icsUrl, method: "GET" });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Failed to fetch calendar: ${message}`);
		}

		let events: ical.CalendarResponse;
		try {
			events = ical.sync.parseICS(response);
		} catch (error) {
			throw new Error(
				"Failed to parse calendar data. The ICS file may be malformed."
			);
		}

		return this.processEvents(events);
	}

	findClosestEvent(events: CalendarEvent[], now: Date): CalendarEvent | null {
		const relevantEvents = events.filter(
			(event) => event.isAttending() && !event.isIgnored()
		);

		const currentEvent = relevantEvents.find((event) =>
			event.isActivelyOccurring(now)
		);
		if (currentEvent) return currentEvent;

		const upcomingEvent = relevantEvents
			.filter((event) => event.isUpcoming(now))
			.sort((a, b) => a.start.getTime() - b.start.getTime())[0];
		if (upcomingEvent) return upcomingEvent;

		const recentEvent = relevantEvents
			.filter((event) => event.isRecent(now))
			.sort((a, b) => b.end.getTime() - a.end.getTime())[0];
		return recentEvent || null;
	}

	getSelectableEvents(events: CalendarEvent[], now: Date): CalendarEvent[] {
		const pastLimit = new Date(
			now.getTime() - this.settings.selectablePastDays * MS_PER_DAY
		);
		const futureLimit = new Date(
			now.getTime() + this.settings.selectableFutureDays * MS_PER_DAY
		);

		return events.filter(
			(event) =>
				event.isAttending() &&
				!event.isIgnored() &&
				event.start >= pastLimit &&
				event.start <= futureLimit
		);
	}

	private processEvents(events: ical.CalendarResponse): CalendarEvent[] {
		const now = new Date();
		const minimumProcessingDate = new Date(now);
		minimumProcessingDate.setMonth(minimumProcessingDate.getMonth() - 2);

		const processedEvents: CalendarEvent[] = [];

		Object.values(events).forEach((event) => {
			if (event.type !== "VEVENT" || event.recurrenceid) return;
			const vevent = event as ical.VEvent;

			if (vevent.rrule) {
				const instances = this.expandRecurringEvent(
					vevent,
					minimumProcessingDate,
					now
				);
				processedEvents.push(...instances);
			} else if (vevent.start >= minimumProcessingDate) {
				processedEvents.push(new CalendarEvent(vevent, this.settings));
			}
		});

		return processedEvents.sort(
			(a, b) => a.start.getTime() - b.start.getTime()
		);
	}

	private expandRecurringEvent(
		baseEvent: ical.VEvent,
		minimumProcessingDate: Date,
		now: Date
	): CalendarEvent[] {
		if (!baseEvent.rrule) return [];

		const occurrences = this.generateOccurrenceDates(
			baseEvent,
			minimumProcessingDate,
			now
		);

		return occurrences
			.map((date) => this.createOccurrence(baseEvent, date))
			.filter(
				(event) =>
					event.isAttending() &&
					!event.isIgnored() &&
					!event.isCancelled()
			);
	}

	private generateOccurrenceDates(
		baseEvent: ical.VEvent,
		minimumProcessingDate: Date,
		now: Date
	): Date[] {
		if (!baseEvent.rrule) return [];

		try {
			const rruleSet = new RRuleSet();
			const options = RRule.parseString(baseEvent.rrule.toString());
			options.dtstart = baseEvent.start;

			const mainRule = new RRule(options);
			rruleSet.rrule(mainRule);

			if (baseEvent.exdate) {
				const exdates = Array.isArray(baseEvent.exdate)
					? baseEvent.exdate
					: [baseEvent.exdate];

				exdates.forEach((exdate) => {
					rruleSet.exdate(new Date(exdate));
				});
			}

			const futureLimit = new Date(now.getTime() + 30 * MS_PER_DAY);
			return rruleSet.between(minimumProcessingDate, futureLimit, true);
		} catch (error) {
			console.warn(
				`Invalid recurrence rule for event "${baseEvent.summary}":`,
				error
			);
			return [];
		}
	}

	private createOccurrence(
		baseEvent: ical.VEvent,
		date: Date
	): CalendarEvent {
		const dateKey = date.toISOString().split("T")[0];
		const recurrences: Record<string, ical.VEvent> =
			(baseEvent as any).recurrences || {};

		const modification = Object.values(recurrences).find((rec) => {
			const recDate = new Date(rec.recurrenceid);
			return recDate.toISOString().split("T")[0] === dateKey;
		});

		if (modification) {
			return new CalendarEvent(modification, this.settings);
		}

		const eventDuration =
			baseEvent.end.getTime() - baseEvent.start.getTime();

		const newStart = new Date(date.getTime());
		const newEnd = new Date(date.getTime() + eventDuration);

		const occurrenceEvent: ical.VEvent = {
			...baseEvent,
			start: newStart as ical.DateWithTimeZone,
			end: newEnd as ical.DateWithTimeZone,
		};

		return new CalendarEvent(occurrenceEvent, this.settings);
	}
}

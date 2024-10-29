import * as ical from "node-ical";
import { RRule, RRuleSet } from "rrule";
import { PluginSettings } from "./settings";
import { request } from "obsidian";

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
			now.getTime() + this.settings.eventFutureHourLimit * 60 * 60 * 1000
		);
		return now < this.start && this.start <= futureStartLimit;
	}

	isRecent(now: Date): boolean {
		const pastEndLimit = new Date(
			now.getTime() - this.settings.eventRecentHourLimit * 60 * 60 * 1000
		);
		return pastEndLimit <= this.end && this.end < now;
	}

	generateTitle(): string {
		return this.normalizeEventTitle(this.summary);
	}

	generateDisplayName(): string {
		const localStart = new Date(
			this.start.toLocaleString("en-US", {
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			})
		);

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
		return `${formattedDate} | ${startTime} | ${duration} | ${this.generateTitle()}`;
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

		const response = await request({ url: icsUrl, method: "GET" });
		const events = ical.sync.parseICS(response);
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
			now.getTime() -
				this.settings.selectablePastDays * 24 * 60 * 60 * 1000
		);
		const futureLimit = new Date(
			now.getTime() +
				this.settings.selectableFutureDays * 24 * 60 * 60 * 1000
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
			if (event.type !== "VEVENT") return;

			const eventInstances = this.getEventInstances(
				event,
				minimumProcessingDate,
				now
			);
			processedEvents.push(...eventInstances);
		});

		return processedEvents.sort(
			(a, b) => a.start.getTime() - b.start.getTime()
		);
	}

	private getEventInstances(
		event: ical.VEvent,
		minimumProcessingDate: Date,
		now: Date
	): CalendarEvent[] {
		if (event.rrule) {
			return this.getRecurringEventInstances(
				event,
				minimumProcessingDate,
				now
			);
		} else if (event.start >= minimumProcessingDate) {
			return [new CalendarEvent(event, this.settings)];
		}
		return [];
	}

	private getRecurringEventInstances(
		event: ical.VEvent,
		minimumProcessingDate: Date,
		now: Date
	): CalendarEvent[] {
		if (!event.rrule) return [];

		const rruleSet = new RRuleSet();
		const mainRule = RRule.fromString(event.rrule.toString());
		rruleSet.rrule(mainRule);

		const exdates = new Set<string>();
		if (event.exdate) {
			const exdateArray = Array.isArray(event.exdate)
				? event.exdate
				: [event.exdate];
			exdateArray.forEach((exdate) => {
				const exdateStr = new Date(exdate).toISOString();
				exdates.add(exdateStr);
				rruleSet.exdate(new Date(exdate));
			});
		}

		const occurrences = rruleSet.between(
			minimumProcessingDate,
			new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
			true
		);

		return occurrences
			.map((date) => {
				const dateStr = date.toISOString();
				if (exdates.has(dateStr)) {
					return null;
				}
				return this.createEventInstance(event, date);
			})
			.filter(
				(event): event is CalendarEvent =>
					event !== null && this.isValidEventInstance(event)
			);
	}

	private createEventInstance(
		originalEvent: ical.VEvent,
		date: Date
	): CalendarEvent {
		const clonedEvent = { ...originalEvent };
		const eventDuration =
			originalEvent.end.getTime() - originalEvent.start.getTime();

		clonedEvent.start = new Date(
			date.getTime()
		) as unknown as ical.DateWithTimeZone;
		clonedEvent.end = new Date(
			date.getTime() + eventDuration
		) as unknown as ical.DateWithTimeZone;

		return new CalendarEvent(clonedEvent as ical.VEvent, this.settings);
	}

	private isValidEventInstance(event: CalendarEvent): boolean {
		return (
			event.isAttending() && !event.isIgnored() && !event.isCancelled()
		);
	}
}

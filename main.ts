import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	request,
	Modal,
	TFile,
} from "obsidian";

import * as ical from "node-ical";
import { RRule, datetime } from "rrule";

interface PluginSettings {
	calendarICSUrl?: string;
	calendarOwnerEmail?: string;
	ignoredEventTitles?: string[];
	eventFutureHourLimit: number;
	eventRecentHourLimit: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
	calendarICSUrl: undefined,
	calendarOwnerEmail: undefined,
	ignoredEventTitles: [],
	eventFutureHourLimit: 4,
	eventRecentHourLimit: 2,
};

const DEBUGGING = false;

class CalendarEvent {
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
		let attendees = this.event.attendee;
		if (!attendees) return [];
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
		const formattedDate = this.start.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
		const startTime = this.start.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		});
		const duration = this.calculateDuration();
		return `${formattedDate} | ${startTime} | ${duration} | ${this.generateTitle()}`;
	}

	private calculateDuration(): string {
		const durationMs = this.end.getTime() - this.start.getTime();
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

	generateAttendeesListMarkdown(): string {
		let attendeesList = "## Attendees:\n";
		this.attendees.forEach((attendee: any) => {
			const attendeeName =
				attendee.params.CN || this.extractEmailFromVal(attendee.val);
			attendeesList += `- ${attendeeName}\n`;
		});
		return attendeesList;
	}

	private extractEmailFromVal(val: string): string {
		// The val property is in the format "mailto:email@example.com"
		const match = val.match(/mailto:(.*)/);
		return match ? match[1] : "Unknown";
	}
}

class CalendarService {
	constructor(private settings: PluginSettings) {}

	async fetchEvents(): Promise<CalendarEvent[]> {
		const icsUrl = this.settings.calendarICSUrl;
		if (!icsUrl) throw new Error("No ICS URL provided in settings.");

		const response = await request({ url: icsUrl, method: "GET" });
		const events = ical.sync.parseICS(response);
		return this.processEvents(events);
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

		const rruleSet = RRule.fromString(event.rrule.toString());
		const occurrences = rruleSet.between(
			datetime(
				minimumProcessingDate.getUTCFullYear(),
				minimumProcessingDate.getUTCMonth() + 1,
				minimumProcessingDate.getUTCDate()
			),
			datetime(
				now.getUTCFullYear(),
				now.getUTCMonth() + 1,
				now.getUTCDate() + 30
			),
			true // Include the start date in the results
		);

		return occurrences.map((date) => {
			const clonedEvent = { ...event };
			const eventDuration = event.end.getTime() - event.start.getTime();

			clonedEvent.start = new Date(
				date.getTime()
			) as unknown as ical.DateWithTimeZone;
			clonedEvent.end = new Date(
				date.getTime() + eventDuration
			) as unknown as ical.DateWithTimeZone;

			return new CalendarEvent(clonedEvent as ical.VEvent, this.settings);
		});
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
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

		return events.filter(
			(event) =>
				event.isAttending() &&
				!event.isIgnored() &&
				event.start >= oneDayAgo &&
				event.start <= oneWeekAhead
		);
	}
}

export default class CalendarEventSyncPlugin extends Plugin {
	settings: PluginSettings;
	calendarService: CalendarService;

	async onload() {
		await this.loadSettings();
		this.calendarService = new CalendarService(this.settings);

		this.addCommand({
			id: "sync-with-closest-event",
			name: "Sync with closest event",
			callback: () => this.updateNoteFromCalendarEvent(),
		});

		this.addCommand({
			id: "sync-with-selected-event",
			name: "Select event to sync",
			callback: () => this.listCalendarEvents(),
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	async updateNoteFromCalendarEvent() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			this.displayNotice(
				"No active note found. Please open a note first.",
				5000
			);
			return;
		}

		try {
			const events = await this.calendarService.fetchEvents();
			const relevantEvent = this.calendarService.findClosestEvent(
				events,
				this.now()
			);

			if (relevantEvent) {
				await this.syncNoteWithEvent(activeFile, relevantEvent);
				this.displayNotice("Event synced with note.", 5000);
			} else {
				this.displayNotice(
					"No relevant events found to sync with.",
					5000
				);
			}
		} catch (error) {
			this.handleError(error);
		}
	}

	async listCalendarEvents() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			this.displayNotice(
				"No active note found. Please open a note first.",
				5000
			);
			return;
		}

		try {
			const events = await this.calendarService.fetchEvents();
			const selectableEvents = this.calendarService.getSelectableEvents(
				events,
				this.now()
			);

			if (selectableEvents.length === 0) {
				this.displayNotice(
					"No events found for the specified time range.",
					5000
				);
				return;
			}

			const eventChoices = selectableEvents.map((event) => ({
				label: event.generateDisplayName(),
				value: event,
			}));

			new EventChoiceModal(this.app, eventChoices, (selectedEvent) =>
				this.syncNoteWithEvent(activeFile, selectedEvent)
			).open();
		} catch (error) {
			this.handleError(error);
		}
	}

	private async syncNoteWithEvent(file: TFile, event: CalendarEvent) {
		await this.addAttendeesToFile(
			file,
			event.generateAttendeesListMarkdown()
		);

		await this.renameFile(file, event.generateTitle());
	}

	private async addAttendeesToFile(file: TFile, attendeesList: string) {
		await this.app.vault.process(file, (content) => {
			if (content.includes(attendeesList)) return content;
			return `${attendeesList}\n${content}`;
		});
	}

	private async renameFile(file: TFile, newTitle: string) {
		const filePathParts = file.path.split("/");
		filePathParts[filePathParts.length - 1] = `${newTitle}.md`;
		const newFilePath = filePathParts.join("/");
		await this.app.vault.rename(file, newFilePath);
	}

	private displayNotice(message: string, timeout: number) {
		new Notice(message, timeout);
	}

	private handleError(error: any) {
		console.error("Calendar Event Sync Error:", error);
		if (error.message.includes("404")) {
			this.displayNotice(
				"Couldn't sync with calendar events. Make sure your ICS URL is correct in the plugin settings.",
				0
			);
		} else {
			this.displayNotice(
				`Couldn't sync with calendar event: ${error.message}`,
				0
			);
		}
	}

	private now(): Date {
		const currentDate = new Date();
		if (DEBUGGING) {
			return new Date(
				currentDate.getFullYear(),
				currentDate.getMonth(),
				currentDate.getDate(),
				14,
				15,
				0,
				0
			);
		}
		return currentDate;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: CalendarEventSyncPlugin;

	constructor(app: App, plugin: CalendarEventSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Calendar ICS URL")
			.setDesc("The secret URL where we can find your calendar events.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your ICS URL")
					.setValue(this.plugin.settings.calendarICSUrl || "")
					.onChange(async (value) => {
						this.plugin.settings.calendarICSUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Optional").setHeading();

		new Setting(containerEl)
			.setName("Calendar owner email")
			.setDesc(
				"The email address of the calendar owner. This is used to filter out events that you've declined."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your email address")
					.setValue(this.plugin.settings.calendarOwnerEmail || "")
					.onChange(async (value) => {
						this.plugin.settings.calendarOwnerEmail = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Future event hour limit")
			.setDesc(
				"The number of hours in the future to consider an event as 'upcoming'."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your preferred hour limit")
					.setValue(
						this.plugin.settings.eventFutureHourLimit.toString()
					)
					.onChange(async (value) => {
						this.plugin.settings.eventFutureHourLimit =
							Number(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Recent event hour limit")
			.setDesc(
				"The number of hours in the past to consider an event as 'recent'."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your preferred hour limit")
					.setValue(String(this.plugin.settings.eventRecentHourLimit))
					.onChange(async (value) => {
						this.plugin.settings.eventRecentHourLimit =
							Number(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Ignored event titles")
			.setDesc(
				"Events with these titles will be ignored when syncing with notes. Put each event name on a new line."
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("Enter event titles to ignore")
					.setValue(
						this.plugin.settings.ignoredEventTitles?.join("\n") ||
							""
					)
					.onChange(async (value) => {
						this.plugin.settings.ignoredEventTitles = value
							.split("\n")
							.filter((title) => title !== "");
						await this.plugin.saveSettings();
					})
			);
	}
}

class EventChoiceModal extends Modal {
	eventChoices: { label: string; value: CalendarEvent }[];
	onChoose: (selectedEvent: CalendarEvent) => void;

	constructor(
		app: App,
		eventChoices: { label: string; value: CalendarEvent }[],
		onChoose: (selectedEvent: CalendarEvent) => void
	) {
		super(app);
		this.eventChoices = this.sortEventChoices(eventChoices);
		this.onChoose = onChoose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Select an Event" });

		const eventList = contentEl.createEl("div", { cls: "event-list" });

		this.eventChoices.forEach((choice) => {
			const eventEl = eventList.createEl("div", { cls: "event-choice" });

			const displayName = choice.value.generateDisplayName();
			const [date, time, duration, title] = displayName.split(" | ");

			const eventInfo = eventEl.createEl("div", { cls: "event-info" });
			eventInfo.createEl("div", { cls: "event-title", text: title });

			const eventDetails = eventInfo.createEl("div", {
				cls: "event-details",
			});
			eventDetails.createEl("span", { cls: "event-date", text: date });
			eventDetails.createEl("span", { cls: "event-time", text: time });
			eventDetails.createEl("span", {
				cls: "event-duration",
				text: duration,
			});

			const selectButton = eventEl.createEl("button", { text: "Select" });

			selectButton.addEventListener("click", () => {
				this.onChoose(choice.value);
				this.close();
			});
		});
	}

	private sortEventChoices(
		choices: { label: string; value: CalendarEvent }[]
	): { label: string; value: CalendarEvent }[] {
		return choices.sort((a, b) => {
			const [dateA, timeA] = a.label.split(" | ");
			const [dateB, timeB] = b.label.split(" | ");

			const dateCompareA = new Date(dateA);
			const dateCompareB = new Date(dateB);
			const dateCompare = dateCompareA.getTime() - dateCompareB.getTime();
			if (dateCompare !== 0) return dateCompare;

			return this.compareTime(timeA, timeB);
		});
	}

	private compareTime(timeA: string, timeB: string): number {
		const [hoursA, minutesA] = this.convertTo24Hour(timeA);
		const [hoursB, minutesB] = this.convertTo24Hour(timeB);

		if (hoursA !== hoursB) return hoursA - hoursB;
		return minutesA - minutesB;
	}

	private convertTo24Hour(time: string): [number, number] {
		const [timeStr, period] = time.split(" ");
		let [hours, minutes] = timeStr.split(":").map(Number);

		if (period === "PM" && hours !== 12) {
			hours += 12;
		} else if (period === "AM" && hours === 12) {
			hours = 0;
		}

		return [hours, minutes];
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

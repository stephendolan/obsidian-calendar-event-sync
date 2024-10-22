import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	request,
	Modal,
} from "obsidian";

import * as ical from "node-ical";

interface PluginSettings {
	calendarICSUrl?: string;
	calendarOwnerEmail?: string;
	ignoredEventTitles?: string[];
	eventFutureHourLimit: number;
	eventRecentHourLimit: number;
}

type EventPickerOption = {
	label: string;
	value: ical.VEvent;
};

const DEFAULT_SETTINGS: PluginSettings = {
	calendarICSUrl: undefined,
	calendarOwnerEmail: undefined,
	ignoredEventTitles: [],
	eventFutureHourLimit: 4,
	eventRecentHourLimit: 2,
};

const DEBUGGING = false;

export default class CalendarEventSyncPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

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
		if (!this.app.workspace.getActiveFile()) {
			this.displayNotice(
				"No active note found. Please open a note first.",
				5000
			);
			return;
		}

		const icsUrl = this.settings.calendarICSUrl;
		if (!icsUrl) throw new Error("No ICS URL provided in settings.");

		try {
			const response = await request({
				url: icsUrl,
				method: "GET",
			});

			const events = ical.sync.parseICS(response);

			const relevantEvent = this.findClosestEvent(events);

			if (relevantEvent) {
				await this.syncNoteWithEvent(relevantEvent);
				this.displayNotice("Event synced with note.", 5000);
			} else {
				this.displayNotice(
					"No relevant events found to sync with.",
					5000
				);
			}
		} catch (error) {
			if (/404/.test(error)) {
				this.displayNotice(
					"Couldn't sync with calendar events. Make sure your ICS URL is correct in the plugin settings.",
					0
				);
			} else {
				this.displayNotice(
					`Couldn't sync with calendar event: ${error}`,
					0
				);
			}
		}
	}

	displayNotice(message: string, timeout: number) {
		new Notice(message, timeout);
	}

	now() {
		// Create a new Date object for the current date
		const currentDate = new Date();

		if (DEBUGGING) {
			// Create a new Date object set to 2:15pm
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

		return new Date(currentDate.getTime());
	}

	closestRecurringEventInstance(event: ical.VEvent) {
		if (!event.rrule) return null;

		const now = this.now();
		const startOfDay = new Date(now);
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date(now);
		endOfDay.setHours(23, 59, 59, 999);

		// Check if today's date is included in the event's exdate
		if (
			event.exdate &&
			event.exdate.hasOwnProperty(startOfDay.toISOString().split("T")[0])
		) {
			return null;
		}

		const occurrences = event.rrule.between(startOfDay, endOfDay, true);

		return occurrences[0];
	}

	isActivelyOccurringEvent(event: ical.VEvent) {
		const now = this.now();
		let start = event.start;
		let end = event.end;

		const recurringEventInstance =
			this.closestRecurringEventInstance(event);

		if (recurringEventInstance) {
			start.setFullYear(
				recurringEventInstance.getFullYear(),
				recurringEventInstance.getMonth(),
				recurringEventInstance.getDate()
			);
			end.setFullYear(
				recurringEventInstance.getFullYear(),
				recurringEventInstance.getMonth(),
				recurringEventInstance.getDate()
			);
		}

		return now >= start && now <= end;
	}

	isUpcomingEvent(event: ical.VEvent) {
		const now = this.now();
		let start = new Date(event.start);
		let end = new Date(event.end);

		const futureStartLimit = new Date(
			now.getTime() + this.settings.eventFutureHourLimit * 60 * 60 * 1000
		);

		const recurringEventInstance =
			this.closestRecurringEventInstance(event);

		if (recurringEventInstance) {
			start.setFullYear(
				recurringEventInstance.getFullYear(),
				recurringEventInstance.getMonth(),
				recurringEventInstance.getDate()
			);
			end.setFullYear(
				recurringEventInstance.getFullYear(),
				recurringEventInstance.getMonth(),
				recurringEventInstance.getDate()
			);
		}

		return now < start && start <= futureStartLimit;
	}

	isRecentEvent(event: ical.VEvent) {
		const now = this.now();
		let start = event.start;
		let end = event.end;

		const pastEndLimit = new Date(
			now.getTime() - this.settings.eventRecentHourLimit * 60 * 60 * 1000
		);

		const recurringEventInstance =
			this.closestRecurringEventInstance(event);

		if (recurringEventInstance) {
			start.setFullYear(
				recurringEventInstance.getFullYear(),
				recurringEventInstance.getMonth(),
				recurringEventInstance.getDate()
			);
			end.setFullYear(
				recurringEventInstance.getFullYear(),
				recurringEventInstance.getMonth(),
				recurringEventInstance.getDate()
			);
		}

		return pastEndLimit <= end && end < now;
	}

	isAttendingEvent(event: ical.VEvent): boolean {
		const calendarOwnerEmail = this.settings.calendarOwnerEmail;

		// If the user hasn't set their email, assume they're attending all events
		if (!calendarOwnerEmail) return true;

		let attendees = event.attendee;
		if (!attendees) return true;

		if (!Array.isArray(attendees)) {
			attendees = [attendees];
		}

		return attendees.some((attendee: any) => {
			return (
				attendee.params.CN === calendarOwnerEmail &&
				attendee.params.PARTSTAT !== "DECLINED"
			);
		});
	}

	filteredAndSortedEvents(events: ical.CalendarResponse): ical.VEvent[] {
		const minimumProcessingDate = new Date();
		minimumProcessingDate.setMonth(minimumProcessingDate.getMonth() - 2);

		const filteredEvents = Object.values(events).filter(
			(event): event is ical.VEvent => {
				if (event.type !== "VEVENT") return false;
				const eventStart =
					event.start instanceof Date
						? event.start
						: new Date(event.start);
				return !!event.rrule || eventStart >= minimumProcessingDate;
			}
		);

		const sortedEvents = filteredEvents.sort((a, b) => {
			const aStart =
				a.start instanceof Date ? a.start : new Date(a.start);
			const bStart =
				b.start instanceof Date ? b.start : new Date(b.start);
			return aStart.getTime() - bStart.getTime();
		});

		return sortedEvents;
	}

	findClosestEvent(events: ical.CalendarResponse) {
		let currentEvent = null;
		let upcomingEvent = null;
		let previousEvent = null;

		let filteredEvents = this.filteredAndSortedEvents(events);

		for (let event of filteredEvents) {
			if (!this.isAttendingEvent(event)) {
				continue;
			}

			if (this.settings.ignoredEventTitles?.includes(event.summary)) {
				continue;
			}

			if (this.isActivelyOccurringEvent(event)) {
				currentEvent = event;
				break;
			} else if (this.isUpcomingEvent(event)) {
				if (!upcomingEvent || event.start < upcomingEvent.start) {
					upcomingEvent = event;
				}
			} else if (this.isRecentEvent(event)) {
				if (!previousEvent || event.end > previousEvent.end) {
					previousEvent = event;
				}
			}
		}

		return currentEvent || upcomingEvent || previousEvent;
	}

	generateAttendeesListMarkdown(event: ical.VEvent) {
		let attendeesList = "## Attendees:\n";

		let attendees = event.attendee;
		if (!attendees) return attendeesList;

		if (!Array.isArray(attendees)) {
			attendees = [attendees];
		}

		attendees.forEach((attendee: any) => {
			attendeesList += `- ${attendee.params.CN}\n`;
		});

		return attendeesList;
	}

	async addAttendeesToActiveFile(attendeesList: string) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		await this.app.vault.process(activeFile, (fileContent) => {
			if (fileContent.includes(attendeesList)) return fileContent;

			return `${attendeesList}\n${fileContent}`;
		});
	}

	async renameActiveFile(newTitle: string) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const filePathParts = activeFile.path.split("/");
		filePathParts[filePathParts.length - 1] = `${newTitle}.md`;
		const newFilePath = filePathParts.join("/");
		await this.app.vault.rename(activeFile, newFilePath);
	}

	// Remove any slashes (/) or colons (:) from the event summary.
	// Obsidian has some rules about what's allowed.
	normalizeEventTitle(eventSummary: string) {
		return eventSummary.replace(/[/:]/g, " ");
	}

	// Format event start dates to YYYY-MM-DD
	formattedEventStartDate(event: ical.VEvent): string {
		const date = event.start;
		const options: Intl.DateTimeFormatOptions = {
			weekday: "short",
			month: "short",
			day: "numeric",
		};
		return date.toLocaleDateString("en-US", options);
	}

	generateTitleFromEvent(event: ical.VEvent) {
		const eventSummary = event.summary;
		const formattedDate = this.formattedEventStartDate(event);
		const startTime = event.start.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		});
		const duration = this.calculateEventDuration(event);
		return `${formattedDate} | ${startTime} | ${duration} | ${this.normalizeEventTitle(
			eventSummary
		)}`;
	}

	calculateEventDuration(event: ical.VEvent): string {
		const durationMs = event.end.getTime() - event.start.getTime();
		const hours = Math.floor(durationMs / 3600000);
		const minutes = Math.floor((durationMs % 3600000) / 60000);

		return (
			`${hours ? `${hours}h` : ""}${
				minutes ? ` ${minutes}m` : ""
			}`.trim() || "0m"
		);
	}

	async syncNoteWithEvent(event: ical.VEvent) {
		await this.addAttendeesToActiveFile(
			this.generateAttendeesListMarkdown(event)
		);
		await this.renameActiveFile(this.generateTitleFromEvent(event));
	}

	async listCalendarEvents() {
		if (!this.app.workspace.getActiveFile()) {
			this.displayNotice(
				"No active note found. Please open a note first.",
				5000
			);
			return;
		}

		const icsUrl = this.settings.calendarICSUrl;
		if (!icsUrl) throw new Error("No ICS URL provided in settings.");

		try {
			const response = await request({
				url: icsUrl,
				method: "GET",
			});

			const events = ical.sync.parseICS(response);

			const selectableEvents = this.eventsEligibleForSelection(events);

			if (selectableEvents.length === 0) {
				this.displayNotice(
					"No events found for the specified time range.",
					5000
				);
				return;
			}

			const eventChoices: EventPickerOption[] = selectableEvents
				.map((event) => ({
					label: this.generateTitleFromEvent(event),
					value: event,
				}))
				.sort((a, b) => a.label.localeCompare(b.label));

			this.showEventChoiceModal(eventChoices);
		} catch (error) {
			this.displayNotice(`Couldn't fetch calendar events: ${error}`, 0);
		}
	}

	eventsEligibleForSelection(events: ical.CalendarResponse) {
		const now = this.now();
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

		return this.filteredAndSortedEvents(events).filter((event) => {
			if (
				!this.isAttendingEvent(event) ||
				this.settings.ignoredEventTitles?.includes(event.summary)
			) {
				return false;
			}

			let eventDate: Date;

			if (event.rrule) {
				const recurringInstance =
					this.closestRecurringEventInstance(event);

				if (recurringInstance) {
					eventDate = recurringInstance;
					event.start.setFullYear(
						recurringInstance.getFullYear(),
						recurringInstance.getMonth(),
						recurringInstance.getDate()
					);
					event.end.setFullYear(
						recurringInstance.getFullYear(),
						recurringInstance.getMonth(),
						recurringInstance.getDate()
					);
				} else {
					eventDate = new Date(event.start);
				}
			} else {
				eventDate = new Date(event.start);
			}

			return eventDate >= oneDayAgo && eventDate <= oneWeekAhead;
		});
	}

	showEventChoiceModal(eventChoices: EventPickerOption[]) {
		new EventChoiceModal(
			this.app,
			eventChoices,
			(selectedEvent: ical.VEvent) => {
				this.syncNoteWithEvent(selectedEvent);
			}
		).open();
	}

	onunload() {}

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
	eventChoices: EventPickerOption[];
	onChoose: (selectedEvent: ical.VEvent) => void;

	constructor(
		app: App,
		eventChoices: EventPickerOption[],
		onChoose: (selectedEvent: ical.VEvent) => void
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

			const [date, time, duration, title] = choice.label.split(" | ");

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

	sortEventChoices(choices: EventPickerOption[]): EventPickerOption[] {
		return choices.sort((a, b) => {
			const [dateA, timeA] = a.label.split(" | ");
			const [dateB, timeB] = b.label.split(" | ");

			// Compare dates
			const dateCompareA = new Date(dateA);
			const dateCompareB = new Date(dateB);
			const dateCompare = dateCompareA.getTime() - dateCompareB.getTime();
			if (dateCompare !== 0) return dateCompare;

			// If dates are the same, compare times
			return this.compareTime(timeA, timeB);
		});
	}

	compareTime(timeA: string, timeB: string): number {
		const [hoursA, minutesA] = this.convertTo24Hour(timeA);
		const [hoursB, minutesB] = this.convertTo24Hour(timeB);

		if (hoursA !== hoursB) return hoursA - hoursB;
		return minutesA - minutesB;
	}

	convertTo24Hour(time: string): [number, number] {
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

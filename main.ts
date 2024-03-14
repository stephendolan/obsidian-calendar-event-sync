import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	request,
} from "obsidian";

import * as ical from "node-ical";

interface MyPluginSettings {
	calendarICSUrl: string;
	eventFutureHourLimit: number;
	eventRecentHourLimit: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	calendarICSUrl: "default",
	eventFutureHourLimit: 4,
	eventRecentHourLimit: 2,
};

const DEBUGGING = false;

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "update-note-title-from-calendar",
			name: "Sync with Event",
			callback: () => this.updateNoteFromCalendarEvent(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	async updateNoteFromCalendarEvent() {
		const icsUrl = this.settings.calendarICSUrl;

		try {
			const response = await request({
				url: icsUrl,
				method: "GET",
			});

			const events = ical.sync.parseICS(response);

			const relevantEvent = this.findRelevantEvent(events);

			if (relevantEvent) {
				await this.syncNoteWithEvent(relevantEvent);
			} else {
				new Notice("No relevant events found to sync with.", 0);
			}
		} catch (error) {
			if (/404/.test(error)) {
				new Notice(
					"Couldn't sync with calendar events. Make sure your ICS URL is correct in the plugin settings.",
					0
				);
			} else {
				new Notice(`Couldn't sync with calendar event: ${error}`, 0);
			}
		}
	}

	now() {
		// Create a new Date object for the current date
		let now = new Date();

		if (DEBUGGING) {
			// Set the time to 2:15pm
			now.setHours(14, 15, 0, 0);
		}

		return now;
	}

	recurringEventHappeningToday(event: ical.VEvent) {
		if (!event.rrule) return null;

		const now = this.now();
		const startOfDay = new Date(now.setHours(0, 0, 0, 0));
		const endOfDay = new Date(now.setHours(23, 59, 59, 999));
		const occurrences = event.rrule.between(startOfDay, endOfDay, true);

		return occurrences[0];
	}

	eventIsHappeningNow(event: ical.VEvent) {
		const now = this.now();
		let start = event.start;
		let end = event.end;

		const recurringEventInstance = this.recurringEventHappeningToday(event);

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

	eventIsUpcoming(event: ical.VEvent) {
		const now = this.now();
		let start = event.start;
		let end = event.end;

		const futureStartLimit = new Date(
			now.getTime() + this.settings.eventFutureHourLimit * 60 * 60 * 1000
		);

		const recurringEventInstance = this.recurringEventHappeningToday(event);

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

	eventIsRecent(event: ical.VEvent) {
		const now = this.now();
		let start = event.start;
		let end = event.end;

		const pastEndLimit = new Date(
			now.getTime() - this.settings.eventRecentHourLimit * 60 * 60 * 1000
		);

		const recurringEventInstance = this.recurringEventHappeningToday(event);

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

	findRelevantEvent(events: ical.CalendarResponse) {
		let currentEvent = null;
		let upcomingEvent = null;
		let previousEvent = null;

		for (let eventId in events) {
			if (!events.hasOwnProperty(eventId)) continue;

			const event = events[eventId];

			if (event.type !== "VEVENT") continue;

			// No placeholder events
			if (event.summary === "Busy") continue;

			if (this.eventIsHappeningNow(event)) {
				currentEvent = event;
				break;
			} else if (this.eventIsUpcoming(event)) {
				if (!upcomingEvent || event.start < upcomingEvent.start) {
					upcomingEvent = event;
				}
			} else if (this.eventIsRecent(event)) {
				if (!previousEvent || event.end > previousEvent.end) {
					previousEvent = event;
				}
			}
		}

		return currentEvent || upcomingEvent || previousEvent;
	}

	generateAttendeesList(event: ical.VEvent) {
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

		const fileContent = await this.app.vault.read(activeFile);
		const newContent = `${attendeesList}\n${fileContent}`;
		await this.app.vault.modify(activeFile, newContent);
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

	generateTitleFromEvent(event: ical.VEvent) {
		const eventSummary = event.summary;
		const eventStart = event.start;
		const formattedDate = eventStart.toISOString().split("T")[0]; // YYYY-MM-DD format
		return `📆 ${formattedDate}, ${this.normalizeEventTitle(eventSummary)}`;
	}

	async syncNoteWithEvent(event: ical.VEvent) {
		await this.addAttendeesToActiveFile(this.generateAttendeesList(event));
		await this.renameActiveFile(this.generateTitleFromEvent(event));
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
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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
					.setValue(this.plugin.settings.calendarICSUrl)
					.onChange(async (value) => {
						this.plugin.settings.calendarICSUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Future Event Hour Limit")
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
			.setName("Recent Event Hour Limit")
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
	}
}

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
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	calendarICSUrl: "default",
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "update-note-title-from-calendar",
			name: "Sync with Event",
			callback: () => this.updateNote(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	async updateNote() {
		const icsUrl = this.settings.calendarICSUrl;

		try {
			const response = await request({
				url: icsUrl,
				method: "GET",
			});

			const events = ical.sync.parseICS(response);

			const currentEvent = this.findRelevantEvent(events);

			if (currentEvent) {
				await this.syncNoteWithEvent(currentEvent);
			} else {
				new Notice("No current or upcoming events found.", 0);
			}
		} catch (error) {
			new Notice(`Couldn't sync with calendar event: ${error}`, 0);
		}
	}

	eventIsHappeningNow(event: ical.VEvent) {
		const now = new Date();
		const eventStart = event.start;
		const eventEnd = event.end;
		return now >= eventStart && now <= eventEnd;
	}

	eventIsUpcoming(eventStart: Date) {
		const now = new Date();
		const upcomingEventHourLimit = 4;

		const futureStartLimit = new Date(
			now.getTime() + upcomingEventHourLimit * 60 * 60 * 1000
		);

		return now < eventStart && eventStart <= futureStartLimit;
	}

	findRelevantEvent(events: ical.CalendarResponse) {
		let relevantEvent = null;

		for (let eventId in events) {
			if (!events.hasOwnProperty(eventId)) continue;

			const event = events[eventId];
			if (event.type != "VEVENT") continue;

			// No placeholder events
			if (event.summary === "Busy") continue;

			if (this.eventIsHappeningNow(event)) {
				return event;
			} else if (this.eventIsUpcoming(event.start)) {
				if (!relevantEvent || event.start < relevantEvent.start) {
					relevantEvent = event;
				}
			}
		}

		return relevantEvent;
	}

	async syncNoteWithEvent(event: ical.VEvent) {
		const eventSummary = event.summary;
		const eventStart = event.start;
		const formattedDate = eventStart.toISOString().split("T")[0]; // YYYY-MM-DD format
		let newTitle = `📆 ${formattedDate}, ${eventSummary}`;

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			const filePathParts = activeFile.path.split("/");
			filePathParts[filePathParts.length - 1] = `${newTitle}.md`;

			const newFilePath = filePathParts.join("/");
			await this.app.vault.rename(activeFile, newFilePath);

			let attendees = event.attendee;
			if (attendees) {
				let attendeesList = "## Attendees:\n";

				if (!Array.isArray(attendees)) {
					attendees = [attendees];
				}

				attendees.forEach((attendee: any) => {
					attendeesList += `- ${attendee.params.CN}\n`;
				});

				const fileContent = await this.app.vault.read(activeFile);
				const newContent = `${attendeesList}\n${fileContent}`;
				this.app.vault.modify(activeFile, newContent);
			}
		}
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

class SampleSettingTab extends PluginSettingTab {
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
	}
}

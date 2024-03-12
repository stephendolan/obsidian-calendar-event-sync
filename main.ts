import { App, Plugin, PluginSettingTab, Setting, request } from "obsidian";

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
			const currentEvent = this.findCurrentOrUpcomingEvent(events);

			if (currentEvent) {
				await this.syncNoteWithEvent(currentEvent);
			} else {
				console.log("No current event found.");
			}
		} catch (error) {
			console.error("Failed to fetch or parse ICS file:", error);
		}
	}

	findCurrentOrUpcomingEvent(events: any) {
		const now = new Date();
		let upcomingEvent = null;
		for (let k in events) {
			if (events.hasOwnProperty(k)) {
				const event = events[k];
				if (events[k].type == "VEVENT") {
					const eventStart = event.start;
					const eventEnd = event.end;
					if (now >= eventStart && now <= eventEnd) {
						return event; // return current event immediately
					} else if (now < eventStart) {
						// if no current event is found, store the first upcoming event
						if (
							!upcomingEvent ||
							eventStart < upcomingEvent.start
						) {
							upcomingEvent = event;
						}
					}
				}
			}
		}
		return upcomingEvent; // return the next event if no current event is found
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
			console.log(attendees);
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
						console.log("Settings updated:", this.plugin.settings);
						await this.plugin.saveSettings();
						console.log("Settings saved:", this.plugin.settings);
					})
			);
	}
}

import { Notice, Plugin, TFile } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from "./settings";
import { EventChoiceModal } from "./interface";
import { CalendarEvent, CalendarService } from "./calendar";

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
			new Notice("No active note found. Please open a note first.", 5000);
			return;
		}

		try {
			const events = await this.calendarService.fetchEvents();
			const relevantEvent = this.calendarService.findClosestEvent(
				events,
				new Date()
			);

			if (relevantEvent) {
				await this.syncNoteWithEvent(activeFile, relevantEvent);
				new Notice("Event synced with note.", 5000);
			} else {
				new Notice("No relevant events found to sync with.", 5000);
			}
		} catch (error) {
			this.handleError(error);
		}
	}

	async listCalendarEvents() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found. Please open a note first.", 5000);
			return;
		}

		try {
			const events = await this.calendarService.fetchEvents();
			const selectableEvents = this.calendarService.getSelectableEvents(
				events,
				new Date()
			);

			if (selectableEvents.length === 0) {
				new Notice(
					"No events found for the specified time range.",
					5000
				);
				return;
			}

			new EventChoiceModal(
				this.app,
				selectableEvents,
				(selectedEvent) =>
					this.syncNoteWithEvent(activeFile, selectedEvent)
			).open();
		} catch (error) {
			this.handleError(error);
		}
	}

	private async syncNoteWithEvent(file: TFile, event: CalendarEvent) {
		const attendeesRegex = /## Attendees:\n(?:- [^\n]*\n)*/;
		const attendeesList = event.generateAttendeesListMarkdown();

		await this.app.vault.process(file, (content) => {
			if (content.match(attendeesRegex)) {
				return content.replace(attendeesRegex, attendeesList);
			}
			return `${attendeesList}\n${content}`;
		});

		const newPath = file.path.replace(
			/[^/]+$/,
			`${event.generateTitle()}.md`
		);
		await this.app.vault.rename(file, newPath);
	}

	private handleError(error: any) {
		console.error("Calendar Event Sync Error:", error);
		const message = error.message?.includes("404")
			? "Couldn't sync with calendar events. Make sure your ICS URL is correct in the plugin settings."
			: `Couldn't sync with calendar event: ${error.message}`;
		new Notice(message, 0);
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

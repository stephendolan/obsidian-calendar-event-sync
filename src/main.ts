import { Plugin, TFile } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from "./settings";
import { UIManager } from "./interface";
import { CalendarEvent, CalendarService } from "./calendar";

const DEBUGGING = false;

export default class CalendarEventSyncPlugin extends Plugin {
	settings: PluginSettings;
	calendarService: CalendarService;
	uiManager: UIManager;

	async onload() {
		await this.loadSettings();
		this.calendarService = new CalendarService(this.settings);
		this.uiManager = new UIManager(this.app);

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
			this.uiManager.displayNotice(
				"No active note found. Please open a note first.",
				5000
			);
			return;
		}

		try {
			// Fetch events from all configured URLs
			await this.calendarService.fetchCalendars(this.settings.calendarUrls);
			
			// Get interleaved events from all calendars
			const events = this.calendarService.getInterleaveedEvents();
			const relevantEvent = this.calendarService.findClosestEvent(
				events,
				this.now()
			);

			if (relevantEvent) {
				await this.syncNoteWithEvent(activeFile, relevantEvent);
				this.uiManager.displayNotice("Event synced with note.", 5000);
			} else {
				this.uiManager.displayNotice(
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
			this.uiManager.displayNotice(
				"No active note found. Please open a note first.",
				5000
			);
			return;
		}

		try {
			// Fetch events from all configured URLs
			await this.calendarService.fetchCalendars(this.settings.calendarUrls);
			
			// Get interleaved events from all calendars
			const events = this.calendarService.getInterleaveedEvents();
			const selectableEvents = this.calendarService.getSelectableEvents(
				events,
				this.now()
			);

			if (selectableEvents.length === 0) {
				this.uiManager.displayNotice(
					"No events found for the specified time range.",
					5000
				);
				return;
			}

			const eventChoices = selectableEvents.map((event) => ({
				label: event.generateDisplayName(),
				value: event,
			}));

			await this.uiManager.showEventSelectionModal(
				eventChoices,
				(selectedEvent) =>
					this.syncNoteWithEvent(activeFile, selectedEvent)
			);
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
			const attendeesRegex = /## Attendees:\n(?:- [^\n]*\n)*/;

			if (content.match(attendeesRegex)) {
				// Replace existing attendees section with new one
				return content.replace(attendeesRegex, attendeesList);
			}

			// If no existing attendees section, add to top of file
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
		this.uiManager.displayNotice(message, timeout);
	}

	private handleError(error: any) {
		console.error("Calendar Event Sync Error:", error);
		if (error.message.includes("404")) {
			this.uiManager.displayNotice(
				"Couldn't sync with calendar events. Make sure your ICS URL is correct in the plugin settings.",
				0
			);
		} else {
			this.uiManager.displayNotice(
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

import { App, PluginSettingTab, Setting } from "obsidian";
import CalendarEventSyncPlugin from "./main";

export interface PluginSettings {
	calendarICSUrl?: string;
	calendarOwnerEmail?: string;
	ignoredEventTitles?: string[];
	eventFutureHourLimit: number;
	eventRecentHourLimit: number;
	selectablePastDays: number;
	selectableFutureDays: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	ignoredEventTitles: [],
	eventFutureHourLimit: 4,
	eventRecentHourLimit: 2,
	selectablePastDays: 1,
	selectableFutureDays: 3,
};

export class SettingTab extends PluginSettingTab {
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
			.setName("Ignored event titles")
			.setDesc(
				"Events with these titles will be ignored when syncing with notes. Put each event name on a new line."
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("Enter event titles to ignore")
					.setValue(this.plugin.settings.ignoredEventTitles?.join("\n") || "")
					.onChange(async (value) => {
						this.plugin.settings.ignoredEventTitles = value
							.split("\n")
							.filter((title) => title !== "");
						await this.plugin.saveSettings();
					})
			);

		this.addNumberSetting(
			"Quick sync - Past limit (hours)",
			"The number of hours in the past to consider an event as 'recent'.",
			"eventRecentHourLimit"
		);

		this.addNumberSetting(
			"Quick sync - Future limit (hours)",
			"The number of hours in the future to consider an event as 'upcoming'.",
			"eventFutureHourLimit"
		);

		this.addNumberSetting(
			"Select modal - Past limit (days)",
			"How many days in the past to show events in the selection modal.",
			"selectablePastDays"
		);

		this.addNumberSetting(
			"Select modal - Future limit (days)",
			"How many days in the future to show events in the selection modal.",
			"selectableFutureDays"
		);
	}

	private addNumberSetting(
		name: string,
		desc: string,
		key:
			| "eventFutureHourLimit"
			| "eventRecentHourLimit"
			| "selectablePastDays"
			| "selectableFutureDays"
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings[key]))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						this.plugin.settings[key] = parsed || DEFAULT_SETTINGS[key];
						await this.plugin.saveSettings();
					})
			);
	}
}

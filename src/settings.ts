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
	calendarICSUrl: undefined,
	calendarOwnerEmail: undefined,
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

		new Setting(containerEl)
			.setName("Quick sync - Past limit (hours)")
			.setDesc(
				"The number of hours in the past to consider an event as 'recent'."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your preferred hour limit")
					.setValue(String(this.plugin.settings.eventRecentHourLimit))
					.onChange(async (value) => {
						this.plugin.settings.eventRecentHourLimit =
							parseInt(value, 10) || DEFAULT_SETTINGS.eventRecentHourLimit;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Quick sync - Future limit (hours)")
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
							parseInt(value, 10) || DEFAULT_SETTINGS.eventFutureHourLimit;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Select modal - Past limit (days)")
			.setDesc(
				"How many days in the past to show events in the selection modal."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter number of days")
					.setValue(String(this.plugin.settings.selectablePastDays))
					.onChange(async (value) => {
						this.plugin.settings.selectablePastDays =
							parseInt(value, 10) || DEFAULT_SETTINGS.selectablePastDays;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Select modal - Future limit (days)")
			.setDesc(
				"How many days in the future to show events in the selection modal."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter number of days")
					.setValue(String(this.plugin.settings.selectableFutureDays))
					.onChange(async (value) => {
						this.plugin.settings.selectableFutureDays =
							parseInt(value, 10) || DEFAULT_SETTINGS.selectableFutureDays;
						await this.plugin.saveSettings();
					})
			);
	}
}

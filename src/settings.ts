import { App, PluginSettingTab, Setting } from "obsidian";
import CalendarEventSyncPlugin from "./main";

export interface PluginSettings {
	calendarUrls: string[];
	calendarOwnerEmails: string[];
	ignoredEventTitles: string[];
	eventFutureHourLimit: number;
	eventRecentHourLimit: number;
	selectablePastDays: number;
	selectableFutureDays: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	calendarUrls: [],
	calendarOwnerEmails: [],
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

		// Calendar URLs section
		containerEl.createEl('h2', { text: 'Calendar URLs' });
		
		// Existing calendar URLs
		if (this.plugin.settings.calendarUrls.length === 0) {
			const noUrlsEl = containerEl.createEl('div', { 
				cls: 'setting-item-description',
				text: 'No calendar URLs configured. Add at least one ICS URL to sync events.'
			});
			noUrlsEl.style.color = 'var(--text-muted)';
			noUrlsEl.style.padding = '10px';
			noUrlsEl.style.textAlign = 'center';
		}

		this.plugin.settings.calendarUrls.forEach((url, index) => {
			const setting = new Setting(containerEl)
				.addText(text => text
					.setPlaceholder('Enter ICS URL')
					.setValue(url)
					.onChange(async (value) => {
						this.plugin.settings.calendarUrls[index] = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(button => button
					.setButtonText('Remove')
					.onClick(async () => {
						this.plugin.settings.calendarUrls.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // Refresh settings view
					})
				);
			
			// Add custom class for styling
			setting.settingEl.addClass('calendar-url-setting');
		});

		// Add new calendar URL button
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add Calendar URL')
				.onClick(async () => {
					this.plugin.settings.calendarUrls.push('');
					await this.plugin.saveSettings();
					this.display(); // Refresh settings view
				})
			);

		// Existing settings sections
		new Setting(containerEl).setName("Optional").setHeading();

		new Setting(containerEl)
			.setName("Calendar owner emails")
			.setDesc(
				"The email addresses of calendar owners. These are used to filter out events that you've declined. Add one email per line."
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("Enter your email addresses")
					.setValue(
						this.plugin.settings.calendarOwnerEmails?.join("\n") ||
							""
					)
					.onChange(async (value) => {
						this.plugin.settings.calendarOwnerEmails = value
							.split("\n")
							.filter((email) => email.trim() !== "");
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

		// Time and range settings
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
							Number(value);
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
							Number(value);
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
						this.plugin.settings.selectablePastDays = Number(value);
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
							Number(value);
						await this.plugin.saveSettings();
					})
			);
	}
}

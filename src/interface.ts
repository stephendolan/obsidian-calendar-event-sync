import { App, Modal, Notice } from "obsidian";

type AsyncCallback<T> = (value: T) => Promise<void> | void;
import { CalendarEvent } from "./calendar";

export class EventChoiceModal extends Modal {
	eventChoices: { label: string; value: CalendarEvent }[];
	onChoose: AsyncCallback<CalendarEvent>;

	constructor(
		app: App,
		eventChoices: { label: string; value: CalendarEvent }[],
		onChoose: AsyncCallback<CalendarEvent>
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

			selectButton.addEventListener("click", async () => {
				try {
					await this.onChoose(choice.value);
					this.close();
				} catch (error) {
					new Notice(
						`Failed to sync event: ${error instanceof Error ? error.message : "Unknown error"}`
					);
				}
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

export class UIManager {
	constructor(private app: App) {}

	displayNotice(message: string, timeout: number) {
		new Notice(message, timeout);
	}

	async showEventSelectionModal(
		eventChoices: { label: string; value: CalendarEvent }[],
		onChoose: AsyncCallback<CalendarEvent>
	) {
		new EventChoiceModal(this.app, eventChoices, onChoose).open();
	}
}

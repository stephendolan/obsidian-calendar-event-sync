import { App, Modal, Notice } from "obsidian";
import { CalendarEvent } from "./calendar";

type AsyncCallback<T> = (value: T) => Promise<void> | void;

export class EventChoiceModal extends Modal {
	eventChoices: CalendarEvent[];
	onChoose: AsyncCallback<CalendarEvent>;

	constructor(
		app: App,
		eventChoices: CalendarEvent[],
		onChoose: AsyncCallback<CalendarEvent>
	) {
		super(app);
		this.eventChoices = eventChoices.sort(
			(a, b) => a.start.getTime() - b.start.getTime()
		);
		this.onChoose = onChoose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Select an Event" });

		const eventList = contentEl.createEl("div", { cls: "event-list" });

		this.eventChoices.forEach((event) => {
			const eventEl = eventList.createEl("div", { cls: "event-choice" });

			const eventInfo = eventEl.createEl("div", { cls: "event-info" });
			eventInfo.createEl("div", {
				cls: "event-title",
				text: event.summary,
			});

			const eventDetails = eventInfo.createEl("div", {
				cls: "event-details",
			});
			eventDetails.createEl("span", {
				cls: "event-date",
				text: event.start.toLocaleDateString("en-US", {
					weekday: "short",
					month: "short",
					day: "numeric",
				}),
			});
			eventDetails.createEl("span", {
				cls: "event-time",
				text: event.start.toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
					hour12: true,
				}),
			});
			eventDetails.createEl("span", {
				cls: "event-duration",
				text: this.formatDuration(event),
			});

			const selectButton = eventEl.createEl("button", { text: "Select" });

			selectButton.addEventListener("click", async () => {
				try {
					await this.onChoose(event);
					this.close();
				} catch (error) {
					new Notice(
						`Failed to sync event: ${error instanceof Error ? error.message : "Unknown error"}`
					);
				}
			});
		});
	}

	private formatDuration(event: CalendarEvent): string {
		const durationMs = event.end.getTime() - event.start.getTime();
		const hours = Math.floor(durationMs / (1000 * 60 * 60));
		const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

		if (hours > 0 && minutes > 0) {
			return `${hours}h ${minutes}m`;
		} else if (hours > 0) {
			return `${hours}h`;
		} else {
			return `${minutes}m`;
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

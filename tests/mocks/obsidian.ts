export class Notice {
	constructor(public message: string, public timeout?: number) {}
}

export class Modal {
	app: App;
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = {
			empty: () => {},
			createEl: () => ({ createEl: () => ({}) }),
		} as unknown as HTMLElement;
	}

	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}

export class Plugin {
	app: App;
	manifest: PluginManifest;

	constructor() {
		this.app = new App();
		this.manifest = {} as PluginManifest;
	}

	async loadData(): Promise<any> {
		return {};
	}

	async saveData(data: any): Promise<void> {}

	addCommand(command: Command): Command {
		return command;
	}

	addSettingTab(settingTab: PluginSettingTab): void {}
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = {} as HTMLElement;
	}

	display(): void {}
	hide(): void {}
}

export class Setting {
	constructor(containerEl: HTMLElement) {}

	setName(name: string): this {
		return this;
	}

	setDesc(desc: string): this {
		return this;
	}

	setHeading(): this {
		return this;
	}

	addText(cb: (text: TextComponent) => any): this {
		cb({
			setPlaceholder: () => ({ setValue: () => ({ onChange: () => {} }) }),
			setValue: () => ({ onChange: () => {} }),
			onChange: () => {},
		} as unknown as TextComponent);
		return this;
	}

	addTextArea(cb: (text: TextAreaComponent) => any): this {
		cb({
			setPlaceholder: () => ({ setValue: () => ({ onChange: () => {} }) }),
			setValue: () => ({ onChange: () => {} }),
			onChange: () => {},
		} as unknown as TextAreaComponent);
		return this;
	}
}

export class App {
	vault: Vault;
	workspace: Workspace;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
	}
}

export class Vault {
	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		return fn("");
	}

	async rename(file: TFile, newPath: string): Promise<void> {}
}

export class Workspace {
	getActiveFile(): TFile | null {
		return null;
	}
}

export interface TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
}

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
}

export interface Command {
	id: string;
	name: string;
	callback?: () => any;
}

export interface TextComponent {
	setPlaceholder(placeholder: string): TextComponent;
	setValue(value: string): TextComponent;
	onChange(callback: (value: string) => any): TextComponent;
}

export interface TextAreaComponent {
	setPlaceholder(placeholder: string): TextAreaComponent;
	setValue(value: string): TextAreaComponent;
	onChange(callback: (value: string) => any): TextAreaComponent;
}

export async function request(options: { url: string; method: string }): Promise<string> {
	throw new Error("request() must be mocked in tests");
}

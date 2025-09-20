import { App, ButtonComponent, Notice, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import OnboardingDialog from "src/onboarding/OnboardingDialog";
import ReleaseNotes from "src/onboarding/ReleaseNotes";

export interface MyPluginSettings {
	mySetting: string;
	previousVersion?: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

type PluginWithSettings = Plugin & {
	settings: MyPluginSettings;
	saveSettings: () => Promise<void>;
};

export function renderSettingsHeader(containerEl: HTMLElement, plugin: PluginWithSettings) {
	const header = containerEl.createDiv({ cls: "plugin-actions-header" });
	header.style.display = "flex";
	header.style.alignItems = "flex-start";
	header.style.justifyContent = "space-between";
	header.style.marginBottom = "8px";

	const title = header.createDiv({ text: plugin.manifest.name });
	title.style.fontWeight = "600";
	title.style.fontSize = "1.2em";

	const actions = header.createDiv();
	actions.style.display = "flex";
	actions.style.gap = "8px";
	actions.style.alignItems = "flex-start";

	// Release notes (left)
	const btnRelease = new ButtonComponent(actions);
	btnRelease.setButtonText("Release notes");
	const rnIcon = createSpan();
	setIcon(rnIcon, "file-text");
	btnRelease.buttonEl.prepend(rnIcon);
	btnRelease.buttonEl.insertBefore(
		document.createTextNode(" "),
		btnRelease.buttonEl.childNodes[1] ?? null,
	);
	btnRelease.onClick(() => {
		ReleaseNotes(plugin);
	});

	// Donations (icon-only) in the middle
	const btnDonate = new ButtonComponent(actions);
	btnDonate.setTooltip("Donate");
	btnDonate.buttonEl.setAttr("aria-label", "Donate");
	const dnIcon = createSpan();
	setIcon(dnIcon, "heart");
	btnDonate.buttonEl.appendChild(dnIcon);
	btnDonate.onClick(() => {
		const url = (plugin.manifest as { fundingUrl?: string }).fundingUrl;
		if (url) window.open(url, "_blank");
		else new Notice("No donation link configured.");
	});

	// Onboarding (right, primary)
	const btnOnboarding = new ButtonComponent(actions);
	btnOnboarding.setCta();
	btnOnboarding.setButtonText("Onboarding");
	const obIcon = createSpan();
	setIcon(obIcon, "play");
	btnOnboarding.buttonEl.prepend(obIcon);
	btnOnboarding.buttonEl.insertBefore(
		document.createTextNode(" "),
		btnOnboarding.buttonEl.childNodes[1] ?? null,
	);
	btnOnboarding.onClick(() => {
		OnboardingDialog(plugin);
	});
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: PluginWithSettings;

	constructor(app: App, plugin: PluginWithSettings) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Render the header bar
		renderSettingsHeader(containerEl, this.plugin);

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

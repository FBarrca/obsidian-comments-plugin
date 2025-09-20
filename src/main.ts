import "./types/md.d.ts";
import { Plugin } from "obsidian";
import OnboardingDialog from "src/onboarding/OnboardingDialog";
import ReleaseNotes from "src/onboarding/ReleaseNotes";
import { registerCommentFeatures } from "./comments/obsidian";
import { MyPluginSettings, DEFAULT_SETTINGS, SampleSettingTab } from "src/settings";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		registerCommentFeatures(this);
		this.addSettingTab(new SampleSettingTab(this.app, this));
		await this.maybeShowOnboardingOrReleaseNotes();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async maybeShowOnboardingOrReleaseNotes() {
		const current = this.manifest.version;
		const prev = this.settings.previousVersion;

		if (!prev) {
			// First install -> show onboarding dialog
			OnboardingDialog(this);
		} else if (prev !== current) {
			// Update -> show release notes
			ReleaseNotes(this);
		}

		if (prev !== current) {
			this.settings.previousVersion = current;
			await this.saveSettings();
		}
	}
}

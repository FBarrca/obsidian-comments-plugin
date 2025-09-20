import { MarkdownStep, MultiStepMarkdownDialog } from "./MultiStepMarkdownDialog";
import { Plugin } from "obsidian";
// Inline onboarding markdown at build time via esbuild loader
import WelcomeMd from "./pages/Welcome.md";
import FeaturesMd from "./pages/Features.md";
import ShortcutsMd from "./pages/Shortcuts.md";

const OnboardingDialog = (plugin: Plugin) => {
	// Configure steps using inlined markdown content (bundled with main.js)
	const steps: MarkdownStep[] = [
		{ content: WelcomeMd, title: "Welcome" },
		{ content: FeaturesMd, title: "Key features" },
		{ content: ShortcutsMd, title: "Shortcuts" },
	];

	new MultiStepMarkdownDialog(plugin.app, plugin, steps, {
		title: "Onboarding",
		prevLabel: "Back",
		nextLabel: "Next",
		closeLabel: "Close",
	}).open();
};

export default OnboardingDialog;

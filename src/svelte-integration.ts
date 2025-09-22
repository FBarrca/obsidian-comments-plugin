import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import ExampleSvelteComponent from "./components/ExampleSvelteComponent.svelte";

/**
 * Example of how to integrate Svelte components into your Obsidian plugin
 */
export class SvelteExampleModal extends Modal {
	private svelteComponent: ReturnType<typeof mount> | null = null;

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Create a container for the Svelte component
		const container = contentEl.createDiv();

		// Mount the Svelte component
		this.svelteComponent = mount(ExampleSvelteComponent, {
			target: container,
			props: {
				title: "Svelte in Obsidian!",
				count: 42,
			},
		});
	}

	onClose() {
		// Clean up the Svelte component
		if (this.svelteComponent) {
			unmount(this.svelteComponent);
			this.svelteComponent = null;
		}
	}
}

/**
 * Utility function to create and show a Svelte component in a modal
 */
export function showSvelteExample(app: App) {
	const modal = new SvelteExampleModal(app);
	modal.open();
}

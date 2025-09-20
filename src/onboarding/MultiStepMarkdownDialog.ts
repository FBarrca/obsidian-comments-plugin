import { App, MarkdownRenderer, Modal, Plugin, TFile } from "obsidian";

// Step in the multi-step dialog
export interface MarkdownStep {
	// Provide either a vault-relative file path or inline markdown content.
	path?: string; // Vault-relative path to a .md file
	content?: string; // Inline markdown content
	title?: string; // Optional custom title per step
}

interface MultiStepOptions {
	title?: string; // Dialog title
	closeLabel?: string; // Label for the final Close button
	nextLabel?: string; // Label for Next button
	prevLabel?: string; // Label for Previous button
	showStepCounter?: boolean; // Show "Step X of N" header (deprecated: prefer dots)
}

/**
 * A generic multi-step dialog that renders Markdown content from vault .md files.
 * Steps are navigable with Previous/Next buttons. Content is rendered using
 * Obsidian's MarkdownRenderer.
 */
export class MultiStepMarkdownDialog extends Modal {
	private plugin: Plugin;
	private steps: MarkdownStep[];
	private options: Required<MultiStepOptions>;
	private currentIndex = 0;
	private loaded: string[] = []; // cached markdown per step

	constructor(app: App, plugin: Plugin, steps: MarkdownStep[], options?: MultiStepOptions) {
		super(app);
		this.plugin = plugin;
		this.steps = steps;
		this.options = {
			title: options?.title ?? "",
			closeLabel: options?.closeLabel ?? "Close",
			nextLabel: options?.nextLabel ?? "Next",
			prevLabel: options?.prevLabel ?? "Previous",
			showStepCounter: options?.showStepCounter ?? false,
		};
	}

	async onOpen(): Promise<void> {
		const { containerEl, titleEl } = this;
		containerEl.addClass("multi-step-markdown-dialog");

		if (this.options.title) {
			titleEl.setText(this.options.title);
		}

		// Preload markdown content for all steps
		this.loaded = await Promise.all(
			this.steps.map((s) =>
				s.content !== undefined
					? Promise.resolve(s.content)
					: this.readMarkdownFile(s.path ?? ""),
			),
		);

		await this.renderStep(this.currentIndex);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async readMarkdownFile(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file && file instanceof TFile) {
			return await this.app.vault.cachedRead(file);
		}
		// Fallback explicit adapter read in case file not resolved via TFile
		try {
			// @ts-ignore - adapter exists on Vault
			return await this.app.vault.adapter.read(path);
		} catch (_e) {
			return `# Missing file\n\nCould not read: \`${path}\``;
		}
	}

	private async renderStep(index: number): Promise<void> {
		const total = this.steps.length;
		const step = this.steps[index];
		const markdown = this.loaded[index] ?? "";

		const { contentEl } = this;
		contentEl.empty();

		// Update modal title to include step title next to dialog title
		const composedTitle = this.options.title
			? step.title
				? `${this.options.title} - ${step.title}`
				: this.options.title
			: (step.title ?? "");
		this.titleEl.setText(composedTitle);

		// Render markdown for this step
		const body = contentEl.createDiv({ cls: "msd-body" });
		// Ensure Obsidian default markdown styles apply
		body.addClass("markdown-rendered");
		await MarkdownRenderer.render(this.app, markdown, body, step.path || "", this.plugin);

		// Navigation footer
		const footer = contentEl.createDiv({ cls: "msd-footer" });
		footer.style.display = "flex";
		footer.style.gap = "8px";
		footer.style.justifyContent = total > 1 ? "space-between" : "flex-end";
		footer.style.alignItems = "flex-end";
		footer.style.marginTop = "1rem";

		const left = total > 1 ? footer.createDiv({ cls: "msd-footer-left" }) : null;
		const center = total > 1 ? footer.createDiv({ cls: "msd-footer-center" }) : null;
		const right = footer.createDiv({ cls: "msd-footer-right" });

		// Progress indicator (dots) centered between buttons
		if (center) {
			const progress = center.createDiv({ cls: "msd-progress" });
			this.steps.forEach((s, i) => {
				const label = s.title ? `Go to ${s.title}` : `Go to step ${i + 1}`;
				const dot = progress.createSpan({
					cls: "msd-progress-dot",
					attr: {
						role: "button",
						"aria-label": label,
						tabindex: "0",
					},
				});
				if (i === index) dot.addClass("is-active");
				dot.onclick = async () => {
					if (this.currentIndex !== i) {
						this.currentIndex = i;
						await this.renderStep(this.currentIndex);
					}
				};
				dot.onkeydown = async (ev: KeyboardEvent) => {
					if (ev.key === "Enter" || ev.key === " ") {
						ev.preventDefault();
						if (this.currentIndex !== i) {
							this.currentIndex = i;
							await this.renderStep(this.currentIndex);
						}
					}
				};
			});
		}

		if (left) {
			const prevBtn = left.createEl("button", {
				text: this.options.prevLabel,
			});
			prevBtn.disabled = index === 0;
			prevBtn.onclick = async () => {
				if (this.currentIndex > 0) {
					this.currentIndex -= 1;
					await this.renderStep(this.currentIndex);
				}
			};
		}

		const nextBtnLabel = index === total - 1 ? this.options.closeLabel : this.options.nextLabel;
		const nextBtn = right.createEl("button", { text: nextBtnLabel });
		nextBtn.addClass("mod-cta");
		nextBtn.onclick = async () => {
			if (this.currentIndex < total - 1) {
				this.currentIndex += 1;
				await this.renderStep(this.currentIndex);
			} else {
				this.close();
			}
		};
	}
}

import { App, Modal, Setting, TextAreaComponent } from "obsidian";

export interface CommentPromptOptions {
	title?: string;
	placeholder?: string;
	ctaLabel?: string;
}

export function requestCommentText(
	app: App,
	initialText = "",
	options?: CommentPromptOptions,
): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new CommentPromptModal(app, initialText, resolve, options);
		modal.open();
	});
}

class CommentPromptModal extends Modal {
	private input!: TextAreaComponent;

	constructor(
		app: App,
		private readonly initial: string,
		private readonly onSubmit: (value: string | null) => void,
		private readonly options?: CommentPromptOptions,
	) {
		super(app);
		this.setModalTitle();
	}

	onOpen() {
		const { contentEl } = this;

		const setting = new Setting(contentEl).setName("Comment text");
		setting.settingEl.addClass("cm-comment-modal-setting");
		setting.addTextArea((component) => {
			this.input = component;
			component.setPlaceholder(this.options?.placeholder ?? "Enter comment text");
			component.setValue(this.initial);
			component.inputEl.rows = 4;
			setTimeout(() => component.inputEl.focus(), 0);
		});

		const buttons = contentEl.createDiv({ cls: "cm-comment-modal-buttons" });
		buttons.style.display = "flex";
		buttons.style.gap = "8px";
		buttons.style.justifyContent = "flex-end";

		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.closeWith(null));

		const submitLabel =
			this.options?.ctaLabel?.trim() || (this.initial.trim().length ? "Update" : "Save");
		const submit = buttons.createEl("button", { text: submitLabel });
		submit.addEventListener("click", () => this.submitCurrentValue());
		submit.addClass("mod-cta");

		this.modalEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				this.submitCurrentValue();
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}

	private submitCurrentValue() {
		const value = this.input.getValue().trim();
		this.closeWith(value);
	}

	private closeWith(value: string | null) {
		this.close();
		this.onSubmit(value);
	}

	private setModalTitle() {
		const customTitle = this.options?.title?.trim();
		if (customTitle) {
			this.titleEl.setText(customTitle);
			return;
		}

		const hasInitial = this.initial.trim().length > 0;
		this.titleEl.setText(hasInitial ? "Edit comment" : "Add comment");
	}
}

import { App, Modal, Setting, TextAreaComponent } from "obsidian";

export function requestCommentText(app: App, initialText = ""): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new CommentPromptModal(app, initialText, resolve);
		modal.open();
	});
}

class CommentPromptModal extends Modal {
	private input!: TextAreaComponent;

	constructor(
		app: App,
		private readonly initial: string,
		private readonly onSubmit: (value: string | null) => void,
	) {
		super(app);
		this.titleEl.setText("Add comment");
	}

	onOpen() {
		const { contentEl } = this;

		const setting = new Setting(contentEl).setName("Comment text");
		setting.settingEl.addClass("cm-comment-modal-setting");
		setting.addTextArea((component) => {
			this.input = component;
			component.setPlaceholder("Enter comment text");
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

		const submit = buttons.createEl("button", { text: "Save" });
		submit.addEventListener("click", () => this.closeWith(this.input.getValue().trim()));
		submit.addClass("mod-cta");

		this.modalEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				this.closeWith(this.input.getValue().trim());
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}

	private closeWith(value: string | null) {
		this.close();
		this.onSubmit(value);
	}
}

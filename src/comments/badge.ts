import { WidgetType } from "@codemirror/view";

export class CommentBadge extends WidgetType {
	constructor(
		readonly id: string,
		readonly resolved: boolean,
	) {
		super();
	}

	eq(other: CommentBadge) {
		return other.id === this.id && other.resolved === this.resolved;
	}

	toDOM() {
		const el = document.createElement("span");
		el.className = this.resolved
			? "cm-comment-badge cm-comment-badge-resolved"
			: "cm-comment-badge";
		el.dataset.commentId = this.id;
		el.dataset.commentResolved = this.resolved ? "true" : "false";
		el.textContent = this.resolved ? "R" : "C";
		el.style.cursor = "pointer";
		el.setAttribute("tabindex", "0");
		el.setAttribute("role", "button");
		const label = this.resolved ? "Resolved comment" : "Comment";
		el.setAttribute("aria-label", label);
		el.title = label;
		return el;
	}
}

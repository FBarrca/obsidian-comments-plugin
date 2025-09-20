import type { hoverTooltip as HoverTooltip } from "@codemirror/tooltip";
import type { EditorView } from "@codemirror/view";
import { Tooltip } from "@codemirror/tooltip";
import { getCommentsAtPos } from "./selectors";
import { scrollToComment } from "./api";

type HoverSource = Parameters<typeof HoverTooltip>[0];

type HoverCallback = NonNullable<HoverSource>;

function truncate(str: string, n = 80) {
	return str.length > n ? `${str.slice(0, n)}…` : str;
}

export const commentHover: HoverCallback = (view, pos, _side) => {
	const cmView = view as unknown as EditorView;
	const comments = getCommentsAtPos(cmView, pos);
	if (!comments.length) return null;

	// Root container picks up CodeMirror tooltip style and Obsidian look
	const root = document.createElement("div");
	root.className = "cm-comment-tooltip";
	root.style.background = "var(--background-primary)";
	root.style.border = "1px solid var(--background-modifier-border)";
	root.style.borderRadius = "8px";
	root.style.boxShadow = "0 4px 12px var(--shadow-s)";
	root.style.padding = "12px";

	if (comments.length === 1) {
		const c = comments[0];
		// Create a comment bubble layout
		const commentBubble = document.createElement("div");
		commentBubble.className = "comment-bubble";

		const header = document.createElement("div");
		header.className = "comment-header";

		const author = document.createElement("div");
		author.className = "comment-author";
		author.textContent = c.author || "Anonymous";

		const timestamp = document.createElement("div");
		timestamp.className = "comment-timestamp";
		timestamp.textContent = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";

		header.append(author, timestamp);

		const text = document.createElement("div");
		text.className = "comment-text";
		text.textContent = c.text || "(No text)";

		commentBubble.append(header, text);
		root.append(commentBubble);
	} else {
		// Use improved layout for multiple items
		const header = document.createElement("div");
		header.className = "comments-header";
		header.textContent = `${comments.length} comments here`;

		const container = document.createElement("div");
		container.className = "comments-container";

		for (const c of comments) {
			const item = document.createElement("div");
			item.className = "comment-item";
			item.dataset.commentId = c.id;

			const commentBubble = document.createElement("div");
			commentBubble.className = "comment-bubble";

			const commentHeader = document.createElement("div");
			commentHeader.className = "comment-header";

			const author = document.createElement("div");
			author.className = "comment-author";
			author.textContent = c.author || "Anonymous";

			const timestamp = document.createElement("div");
			timestamp.className = "comment-timestamp";
			timestamp.textContent = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "";

			commentHeader.append(author, timestamp);

			const text = document.createElement("div");
			text.className = "comment-text";
			text.textContent = c.text ? truncate(c.text, 100) : c.id;

			commentBubble.append(commentHeader, text);
			item.append(commentBubble);

			item.addEventListener("click", () => {
				scrollToComment(cmView, c.id);
			});

			container.appendChild(item);
		}
		root.append(header, container);
	}

	const tooltip: Tooltip = {
		pos,
		above: true,
		create() {
			return { dom: root };
		},
	};

	return tooltip;
};

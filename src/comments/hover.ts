import type { hoverTooltip as HoverTooltip } from "@codemirror/tooltip";
import type { EditorView } from "@codemirror/view";
import { Tooltip } from "@codemirror/tooltip";
import { getCommentsAtPos } from "./selectors";
import { scrollToComment } from "./api";

type HoverSource = Parameters<typeof HoverTooltip>[0];

type HoverCallback = NonNullable<HoverSource>;

export const commentHover: HoverCallback = (view, pos, _side) => {
	const cmView = view as unknown as EditorView;
	const comments = getCommentsAtPos(cmView, pos);
	if (!comments.length) {
		return null;
	}

	const dom = document.createElement("div");
	dom.className = "cm-comment-tooltip";

	if (comments.length === 1) {
		const single = comments[0];
		const meta = document.createElement("div");
		meta.className = "cm-comment-meta";
		const parts = [
			single.author,
			single.createdAt ? new Date(single.createdAt).toLocaleString() : null,
		].filter(Boolean) as string[];
		meta.textContent = parts.join(" - ");

		const body = document.createElement("div");
		body.className = "cm-comment-text";
		body.textContent = single.text || "(No comment text)";

		dom.append(meta, body);
	} else {
		const header = document.createElement("div");
		header.className = "cm-comment-meta";
		header.textContent = `${comments.length} comments here`;

		const list = document.createElement("ul");
		list.className = "cm-comment-list";
		list.style.margin = "0";
		list.style.paddingLeft = "1.1em";

		for (const comment of comments) {
			const item = document.createElement("li");
			item.dataset.commentId = comment.id;
			item.style.cursor = "pointer";
			item.textContent = comment.text
				? `${comment.text.slice(0, 80)}${comment.text.length > 80 ? "..." : ""}`
				: comment.id;

			item.onclick = () => {
				scrollToComment(cmView, comment.id);
			};

			list.appendChild(item);
		}

		dom.append(header, list);
	}

	const tooltip: Tooltip = {
		pos,
		above: true,
		create() {
			return { dom };
		},
	};

	return tooltip;
};

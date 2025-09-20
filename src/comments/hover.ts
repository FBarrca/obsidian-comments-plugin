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

function stickTooltipToRight(wrapper: HTMLElement | null) {
	if (!wrapper) return;
	// Force right gutter anchoring and override CodeMirror's inline left
	wrapper.style.setProperty("left", "auto", "important");
	wrapper.style.setProperty("right", "8px", "important");
	wrapper.style.setProperty("transform", "none", "important");
	wrapper.style.setProperty("maxWidth", "min(520px, 70vw)", "important");
}

export const commentHover: HoverCallback = (view, pos, _side) => {
	const cmView = view as unknown as EditorView;
	const comments = getCommentsAtPos(cmView, pos);
	if (!comments.length) return null;

	// Root container picks up CodeMirror tooltip style and Obsidian look
	const root = document.createElement("div");
	root.className = "cm-comment-tooltip";

	if (comments.length === 1) {
		const c = comments[0];
		// Use Obsidian setting-item layout for tidy single view
		const wrap = document.createElement("div");
		wrap.className = "setting-item mod-compact";

		const info = document.createElement("div");
		info.className = "setting-item-info";

		const name = document.createElement("div");
		name.className = "setting-item-name";
		const parts = [
			c.author,
			c.createdAt ? new Date(c.createdAt).toLocaleString() : null,
		].filter(Boolean) as string[];
		name.textContent = parts.join(" • ") || "Comment";

		const desc = document.createElement("div");
		desc.className = "setting-item-description";
		desc.textContent = c.text || "(No text)";

		info.append(name, desc);
		wrap.append(info);
		root.append(wrap);
	} else {
		// Use Obsidian menu pattern for multiple items
		const header = document.createElement("div");
		header.className = "cm-comment-meta is-text-muted";
		header.textContent = `${comments.length} comments here`;

		const menu = document.createElement("div");
		menu.className = "menu mod-compact";

		for (const c of comments) {
			const item = document.createElement("div");
			item.className = "menu-item";
			item.dataset.commentId = c.id;

			const title = document.createElement("div");
			title.className = "menu-item-title";
			title.textContent = c.text ? truncate(c.text, 100) : c.id;

			const subtitle = document.createElement("div");
			subtitle.className = "menu-item-shortcut";
			const meta = [
				c.author,
				c.createdAt ? new Date(c.createdAt).toLocaleDateString() : null,
			].filter(Boolean) as string[];
			subtitle.textContent = meta.join(" • ");

			item.append(title, subtitle);
			item.addEventListener("click", () => {
				scrollToComment(cmView, c.id);
			});

			menu.appendChild(item);
		}
		root.append(header, menu);
	}

	// After mount, force the wrapper to the right gutter. Try a few frames in case CM repositions.
	const scheduleRight = () => {
		let tries = 0;
		const tick = () => {
			const wrapper = root.closest(".cm-tooltip") as HTMLElement | null;
			stickTooltipToRight(wrapper);
			if (++tries < 3) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	};
	scheduleRight();

	const tooltip: Tooltip = {
		pos,
		above: true,
		create() {
			return { dom: root };
		},
	};

	return tooltip;
};

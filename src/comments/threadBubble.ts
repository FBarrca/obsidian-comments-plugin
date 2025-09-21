import { EditorState } from "@codemirror/state";
import { BlockInfo, EditorView } from "@codemirror/view";
import type { EventRef, Workspace } from "obsidian";
import type { CommentRange } from "./model";
import { commentField, indexToArray } from "./state";

const COMMENT_MARKER_SELECTOR = ".cm-commentIndicator-marker";
const COMMENT_THREAD_SELECTOR = ".cm-commentIndicator-thread";
const COMMENT_THREAD_OPEN_CLASS = "is-open";
const THREAD_VIEWPORT_PADDING = 12;
const THREAD_INLINE_SPACING = 12;
const EDITOR_WRAPPER_CLASS = "cm-editor-wrapper";
const THREAD_LAYER_CLASS = "cm-thread-layer";
const openThreadCleanup = new WeakMap<HTMLElement, () => void>();

type WorkspaceResizeBinding = {
	workspace: Workspace;
	ref: EventRef;
};

/**
 * Collects comments whose ranges intersect the provided document positions.
 * Matches are returned sorted by their start offset.
 */
function getCommentsForLineRange(state: EditorState, from: number, to: number): CommentRange[] {
	const commentState = state.field(commentField, false);
	if (!commentState) return [];
	const matches: CommentRange[] = [];
	for (const comment of indexToArray(commentState.byId)) {
		if (comment.from > to) continue;
		if (comment.to < from) continue;
		matches.push(comment);
	}
	matches.sort((a, b) => a.from - b.from);
	return matches;
}

/**
 * Removes the open state for a marker and tears down any active thread UI.
 */
function closeThreadElement(markerEl: HTMLElement) {
	markerEl.classList.remove(COMMENT_THREAD_OPEN_CLASS);
	const cleanup = openThreadCleanup.get(markerEl);
	if (cleanup) {
		openThreadCleanup.delete(markerEl);
		cleanup();
	}
}

/**
 * Closes every open comment thread under the provided root except the optional marker.
 */
function closeAllThreads(root: HTMLElement, except?: HTMLElement) {
	const openMarkers = root.querySelectorAll<HTMLElement>(
		`${COMMENT_MARKER_SELECTOR}.${COMMENT_THREAD_OPEN_CLASS}`,
	);
	openMarkers.forEach((el) => {
		if (el === except) return;
		closeThreadElement(el);
	});
}

function ensureEditorWrapper(view: EditorView): HTMLElement | null {
	const editorEl = view.dom;
	const parent = editorEl.parentElement as HTMLElement | null;
	if (!parent) {
		return null;
	}
	parent.classList.add(EDITOR_WRAPPER_CLASS);
	return parent;
}

function ensureThreadLayer(view: EditorView): HTMLElement | null {
	const wrapper = ensureEditorWrapper(view);
	if (!wrapper) {
		return null;
	}

	let layer = wrapper.querySelector<HTMLElement>(`.${THREAD_LAYER_CLASS}`);
	if (!layer) {
		layer = document.createElement("div");
		layer.className = THREAD_LAYER_CLASS;
		wrapper.appendChild(layer);
	}
	return layer;
}

function subscribeToWorkspaceResize(listener: () => void): WorkspaceResizeBinding | null {
	const obsidianWindow = window as Window & { app?: { workspace?: Workspace } };
	const workspace = obsidianWindow.app?.workspace;
	if (!workspace) {
		return null;
	}

	const ref = workspace.on("resize", listener);
	return { workspace, ref };
}

/**
 * Positions the thread element beside its marker and keeps it within the viewport bounds.
 */
function updateThreadPlacement(markerEl: HTMLElement, threadEl: HTMLElement, layerEl: HTMLElement) {
	if (!markerEl.isConnected || !layerEl.isConnected || !threadEl.isConnected) {
		closeThreadElement(markerEl);
		return;
	}

	const isRTL = window.getComputedStyle(markerEl).direction === "rtl";
	threadEl.style.left = "auto";
	threadEl.style.right = "auto";
	threadEl.style.top = "auto";

	const wrapperEl = layerEl.parentElement as HTMLElement | null;
	if (!wrapperEl) {
		return;
	}

	const markerRect = markerEl.getBoundingClientRect();
	const threadRect = threadEl.getBoundingClientRect();
	const wrapperRect = wrapperEl.getBoundingClientRect();
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	const spaceRight = viewportWidth - THREAD_VIEWPORT_PADDING - markerRect.right;
	const spaceLeft = markerRect.left - THREAD_VIEWPORT_PADDING;

	let alignRight = !isRTL;
	if (alignRight && threadRect.width > spaceRight && spaceLeft > spaceRight) {
		alignRight = false;
	} else if (!alignRight && threadRect.width > spaceLeft && spaceRight >= spaceLeft) {
		alignRight = true;
	}

	let left: number;
	if (alignRight) {
		left = markerRect.right - wrapperRect.left + THREAD_INLINE_SPACING;
		threadEl.dataset.threadPosition = "right";
	} else {
		left = markerRect.left - wrapperRect.left - THREAD_INLINE_SPACING - threadRect.width;
		threadEl.dataset.threadPosition = "left";
	}

	const minLeft = THREAD_VIEWPORT_PADDING - wrapperRect.left;
	const maxLeft = viewportWidth - THREAD_VIEWPORT_PADDING - threadRect.width - wrapperRect.left;
	if (maxLeft < minLeft) {
		left = minLeft;
	} else {
		left = Math.min(Math.max(left, minLeft), maxLeft);
	}
	threadEl.style.left = `${left}px`;

	const baseTop = markerRect.top - wrapperRect.top;
	const minTop = THREAD_VIEWPORT_PADDING - wrapperRect.top;
	const maxTop = viewportHeight - THREAD_VIEWPORT_PADDING - threadRect.height - wrapperRect.top;
	const clampedTop = maxTop < minTop ? minTop : Math.min(Math.max(baseTop, minTop), maxTop);
	threadEl.style.top = `${clampedTop}px`;
}

/**
 * Mounts the thread element as a child of the marker and wires up dynamic positioning.
 */
function openThreadForMarker(view: EditorView, markerEl: HTMLElement, threadEl: HTMLElement) {
	const layer = ensureThreadLayer(view);
	if (!layer) {
		return;
	}

	closeThreadElement(markerEl);

	markerEl.classList.add(COMMENT_THREAD_OPEN_CLASS);
	threadEl.style.display = "block";
	layer.appendChild(threadEl);

	const reposition = () => updateThreadPlacement(markerEl, threadEl, layer);
	const onScroll = () => reposition();

	reposition();
	requestAnimationFrame(reposition);

	const resizeObserver =
		typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => reposition()) : null;
	if (resizeObserver) {
		const wrapper = layer.parentElement;
		if (wrapper) resizeObserver.observe(wrapper);
		resizeObserver.observe(layer);
	}

	view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("scroll", onScroll, { passive: true });

	const workspaceBinding = subscribeToWorkspaceResize(reposition);
	if (!workspaceBinding) {
		window.addEventListener("resize", reposition);
	}

	let connectionFrame: number | null = null;
	const monitorConnection = () => {
		if (!markerEl.isConnected) {
			closeThreadElement(markerEl);
			return;
		}
		connectionFrame = window.requestAnimationFrame(monitorConnection);
	};
	connectionFrame = window.requestAnimationFrame(monitorConnection);

	openThreadCleanup.set(markerEl, () => {
		resizeObserver?.disconnect();
		view.scrollDOM.removeEventListener("scroll", onScroll);
		window.removeEventListener("scroll", onScroll);
		if (workspaceBinding) {
			workspaceBinding.workspace.offref(workspaceBinding.ref);
		} else {
			window.removeEventListener("resize", reposition);
		}
		if (connectionFrame !== null) {
			cancelAnimationFrame(connectionFrame);
			connectionFrame = null;
		}
		threadEl.remove();
	});
}

/**
 * Builds a thread container populated with the provided comment ranges.
 */
function renderThread(comments: CommentRange[]): HTMLElement {
	const container = document.createElement("div");
	container.className = "cm-commentIndicator-thread";
	for (const comment of comments) {
		container.appendChild(renderThreadItem(comment));
	}
	return container;
}

/**
 * Creates the DOM representation for a single comment bubble entry.
 */
function renderThreadItem(comment: CommentRange): HTMLElement {
	const item = document.createElement("div");
	item.className = "cm-commentIndicator-item comment-bubble";
	item.dataset.commentId = comment.id;
	if (comment.resolved) {
		item.dataset.commentResolved = "true";
	}

	const header = document.createElement("div");
	header.className = "comment-header";

	const author = document.createElement("span");
	author.className = "comment-author";
	author.textContent = comment.author?.trim() || "Comment";
	header.appendChild(author);

	const timestampText = formatTimestamp(comment.createdAt);
	if (timestampText) {
		const time = document.createElement("span");
		time.className = "comment-timestamp";
		time.textContent = timestampText;
		header.appendChild(time);
	}

	if (comment.resolved) {
		const resolvedLabel = document.createElement("span");
		resolvedLabel.className = "comment-timestamp";
		resolvedLabel.textContent = "Resolved";
		header.appendChild(resolvedLabel);
	}

	item.appendChild(header);

	const body = document.createElement("p");
	body.className = "comment-text";
	body.textContent = comment.text?.trim() || "(No comment text)";
	item.appendChild(body);

	return item;
}

/**
 * Formats a comment timestamp into a localized string, returning null when unavailable.
 */
function formatTimestamp(value: CommentRange["createdAt"]): string | null {
	if (value === undefined || value === null) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString();
}

/**
 * Handles pointer interactions on a comment marker, toggling the associated thread bubble.
 */
export function handleCommentMarkerPointerDown(
	view: EditorView,
	line: BlockInfo,
	event: Event,
): boolean {
	const target = event.target as HTMLElement | null;
	if (!target) return false;

	if (target.closest(COMMENT_THREAD_SELECTOR)) {
		return false;
	}

	const markerEl = target.closest<HTMLElement>(COMMENT_MARKER_SELECTOR);
	if (!markerEl) return false;

	event.stopPropagation();

	if (markerEl.classList.contains(COMMENT_THREAD_OPEN_CLASS)) {
		closeThreadElement(markerEl);
		return true;
	}

	const docLine = view.state.doc.lineAt(line.from);
	const comments = getCommentsForLineRange(view.state, docLine.from, docLine.to);
	if (!comments.length) {
		closeThreadElement(markerEl);
		return true;
	}

	closeAllThreads(view.dom, markerEl);

	const threadEl = renderThread(comments);
	openThreadForMarker(view, markerEl, threadEl);

	return true;
}

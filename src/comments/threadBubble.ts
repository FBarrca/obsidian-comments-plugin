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
const MIN_THREAD_WIDTH = 220;

const EDITOR_CLASS = "cm-contentContainer"; // Editor scroller with the document
const THREAD_LAYER_CLASS = "cm-thread-layer";

const openThreadCleanup = new WeakMap<HTMLElement, () => void>();

type WorkspaceResizeBinding = {
	workspace: Workspace;
	ref: EventRef;
};

// ---------- Utilities ----------

const clamp = (v: number, min: number, max: number) =>
	max < min ? min : Math.min(Math.max(v, min), max);

function ensureEditorWrapper(view: EditorView): HTMLElement | null {
	const parent = view.dom.parentElement as HTMLElement | null;
	if (!parent) return null;
	return parent;
}

function ensureThreadLayer(view: EditorView): HTMLElement | null {
	const wrapper = ensureEditorWrapper(view);
	if (!wrapper) return null;
	let layer = wrapper.querySelector<HTMLElement>(`.${THREAD_LAYER_CLASS}`);
	if (!layer) {
		layer = document.createElement("div");
		layer.className = THREAD_LAYER_CLASS;
		wrapper.appendChild(layer);
	}
	return layer;
}

function getMarginRight(view: EditorView): number {
	const editorEl = view.dom as HTMLElement;
	const contentContainerEl = editorEl.querySelector(`.${EDITOR_CLASS}`) as HTMLElement | null;
	if (!contentContainerEl) return 0;
	const editorRect = editorEl.getBoundingClientRect();
	const contentRect = contentContainerEl.getBoundingClientRect();
	return (editorRect.width - contentRect.width) / 2;
}

function subscribeToWorkspaceResize(listener: () => void): WorkspaceResizeBinding | null {
	const obsidianWindow = window as Window & { app?: { workspace?: Workspace } };
	const workspace = obsidianWindow.app?.workspace;
	if (!workspace) return null;
	const ref = workspace.on("resize", listener);
	return { workspace, ref };
}

// ---------- Comments lookups ----------

/**
 * Collects comments whose ranges intersect the provided document positions.
 * Matches are returned sorted by their start offset.
 */
function getCommentsForLineRange(state: EditorState, from: number, to: number): CommentRange[] {
	const commentState = state.field(commentField, false);
	if (!commentState) return [];
	return indexToArray(commentState.byId)
		.filter((c) => !(c.from > to || c.to < from))
		.sort((a, b) => a.from - b.from);
}

// ---------- Thread lifecycle ----------

/** Removes the open state for a marker and tears down any active thread UI. */
function closeThreadElement(markerEl: HTMLElement) {
	markerEl.classList.remove(COMMENT_THREAD_OPEN_CLASS);
	const cleanup = openThreadCleanup.get(markerEl);
	if (cleanup) {
		openThreadCleanup.delete(markerEl);
		cleanup();
	}
}

/** Closes every open comment thread under the provided root except the optional marker. */
function closeAllThreads(root: HTMLElement, except?: HTMLElement) {
	const openMarkers = root.querySelectorAll<HTMLElement>(
		`${COMMENT_MARKER_SELECTOR}.${COMMENT_THREAD_OPEN_CLASS}`,
	);
	openMarkers.forEach((el) => {
		if (el !== except) closeThreadElement(el);
	});
}

/**
 * Positions the thread element beside its marker and keeps it within the viewport bounds.
 */
function updateThreadPlacement(
	markerEl: HTMLElement,
	threadEl: HTMLElement,
	layerEl: HTMLElement,
	view: EditorView,
) {
	if (!markerEl.isConnected || !layerEl.isConnected || !threadEl.isConnected) {
		closeThreadElement(markerEl);
		return;
	}

	// Reset inline positioning
	threadEl.style.left = "auto";
	threadEl.style.right = "auto";
	threadEl.style.top = "auto";

	const isRTL = getComputedStyle(markerEl).direction === "rtl";
	const wrapperEl = layerEl.parentElement as HTMLElement | null;
	if (!wrapperEl) return;

	const markerRect = markerEl.getBoundingClientRect();
	const threadRect = threadEl.getBoundingClientRect();
	const wrapperRect = wrapperEl.getBoundingClientRect();
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	const spaceRight = viewportWidth - THREAD_VIEWPORT_PADDING - markerRect.right;
	const spaceLeft = markerRect.left - THREAD_VIEWPORT_PADDING;
	const marginRight = getMarginRight(view);

	// Prefer right alignment in LTR if there is enough room in the right margin.
	let alignRight = !isRTL && marginRight >= MIN_THREAD_WIDTH;

	// Flip based on available space if needed.
	if (alignRight && threadRect.width > spaceRight && spaceLeft > spaceRight) {
		alignRight = false;
	} else if (!alignRight && threadRect.width > spaceLeft && spaceRight >= spaceLeft) {
		alignRight = true;
	}

	// Horizontal position
	const leftIfRight = markerRect.right - wrapperRect.left + THREAD_INLINE_SPACING;
	const leftIfLeft =
		markerRect.left - wrapperRect.left - THREAD_INLINE_SPACING - threadRect.width;

	const minLeft = THREAD_VIEWPORT_PADDING - wrapperRect.left;
	const maxLeft = viewportWidth - THREAD_VIEWPORT_PADDING - threadRect.width - wrapperRect.left;

	const left = clamp(alignRight ? leftIfRight : leftIfLeft, minLeft, maxLeft);
	threadEl.style.left = `${left}px`;
	threadEl.dataset.threadPosition = alignRight ? "right" : "left";

	// Vertical position
	const baseTop = markerRect.top - wrapperRect.top;
	const minTop = THREAD_VIEWPORT_PADDING - wrapperRect.top;
	const maxTop = viewportHeight - THREAD_VIEWPORT_PADDING - threadRect.height - wrapperRect.top;
	threadEl.style.top = `${clamp(baseTop, minTop, maxTop)}px`;
}

/**
 * Mounts the thread element in the thread layer and wires up dynamic positioning.
 */
function openThreadForMarker(view: EditorView, markerEl: HTMLElement, threadEl: HTMLElement) {
	const layer = ensureThreadLayer(view);
	if (!layer) return;

	// Close any previously-open thread on this marker.
	closeThreadElement(markerEl);

	markerEl.classList.add(COMMENT_THREAD_OPEN_CLASS);
	threadEl.style.display = "block";
	layer.appendChild(threadEl);

	const reposition = () => {
		updateThreadPlacement(markerEl, threadEl, layer, view);

		// Constrain width only when thread is on the right.
		if (threadEl.dataset.threadPosition === "right") {
			const width = Math.max(0, Math.floor(getMarginRight(view)));
			threadEl.style.width = width ? `${width}px` : "";
		} else {
			threadEl.style.width = "";
		}
	};

	// Initial placement + one RAF tick to account for layout/paint.
	reposition();
	requestAnimationFrame(reposition);

	// Observe size changes.
	const resizeObserver =
		typeof ResizeObserver !== "undefined" ? new ResizeObserver(reposition) : null;
	if (resizeObserver) {
		const wrapper = layer.parentElement;
		if (wrapper) resizeObserver.observe(wrapper);
		resizeObserver.observe(layer);
		resizeObserver.observe(view.dom);
	}

	// Scroll / resize listeners.
	const onScroll = () => reposition();
	view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("scroll", onScroll, { passive: true });

	const workspaceBinding = subscribeToWorkspaceResize(reposition);
	if (!workspaceBinding) {
		window.addEventListener("resize", reposition);
	}

	// Auto-close if marker is detached.
	let rafId: number | null = null;
	const monitorConnection = () => {
		if (!markerEl.isConnected) {
			closeThreadElement(markerEl);
			return;
		}
		rafId = window.requestAnimationFrame(monitorConnection);
	};
	rafId = window.requestAnimationFrame(monitorConnection);

	// Register cleanup.
	openThreadCleanup.set(markerEl, () => {
		resizeObserver?.disconnect();
		view.scrollDOM.removeEventListener("scroll", onScroll);
		window.removeEventListener("scroll", onScroll);
		if (workspaceBinding) {
			workspaceBinding.workspace.offref(workspaceBinding.ref);
		} else {
			window.removeEventListener("resize", reposition);
		}
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
		}
		threadEl.remove();
	});
}

// ---------- Rendering ----------

/** Builds a thread container populated with the provided comment ranges. */
function renderThread(comments: CommentRange[]): HTMLElement {
	const container = document.createElement("div");
	container.className = "cm-commentIndicator-thread";
	for (const comment of comments) {
		container.appendChild(renderThreadItem(comment));
	}
	return container;
}

/** Creates the DOM representation for a single comment bubble entry. */
function renderThreadItem(comment: CommentRange): HTMLElement {
	const item = document.createElement("div");
	item.className = "cm-commentIndicator-item comment-bubble";
	item.dataset.commentId = comment.id;
	if (comment.resolved) item.dataset.commentResolved = "true";

	const header = document.createElement("div");
	header.className = "comment-header";

	const author = document.createElement("span");
	author.className = "comment-author";
	author.textContent = (comment.author ?? "Comment").trim();
	header.appendChild(author);

	const timestamp = formatTimestamp(comment.createdAt);
	if (timestamp) {
		const timeEl = document.createElement("span");
		timeEl.className = "comment-timestamp";
		timeEl.textContent = timestamp;
		header.appendChild(timeEl);
	}

	if (comment.resolved) {
		const resolved = document.createElement("span");
		resolved.className = "comment-timestamp";
		resolved.textContent = "Resolved";
		header.appendChild(resolved);
	}

	item.appendChild(header);

	const body = document.createElement("p");
	body.className = "comment-text";
	body.textContent = (comment.text ?? "(No comment text)").trim();
	item.appendChild(body);

	return item;
}

/** Formats a comment timestamp into a localized string, returning null when unavailable. */
function formatTimestamp(value: CommentRange["createdAt"]): string | null {
	if (value === undefined || value === null) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString();
}

// ---------- Public API ----------

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

	// Ignore clicks inside an already-rendered thread.
	if (target.closest(COMMENT_THREAD_SELECTOR)) return false;

	const markerEl = target.closest<HTMLElement>(COMMENT_MARKER_SELECTOR);
	if (!markerEl) return false;

	event.stopPropagation();

	// Toggle off if already open.
	if (markerEl.classList.contains(COMMENT_THREAD_OPEN_CLASS)) {
		closeThreadElement(markerEl);
		return true;
	}

	// Gather comments for this line.
	const docLine = view.state.doc.lineAt(line.from);
	const comments = getCommentsForLineRange(view.state, docLine.from, docLine.to);

	// Close any other open threads regardless of comment presence.
	closeAllThreads(view.dom, markerEl);

	// If no comments remain, just ensure the marker is closed.
	if (!comments.length) {
		closeThreadElement(markerEl);
		return true;
	}

	// Open a new thread.
	const threadEl = renderThread(comments);
	openThreadForMarker(view, markerEl, threadEl);
	return true;
}

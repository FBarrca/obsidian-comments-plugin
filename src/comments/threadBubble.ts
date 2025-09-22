import { EditorState } from "@codemirror/state";
import { BlockInfo, EditorView } from "@codemirror/view";
import type { EventRef, Workspace } from "obsidian";
import type { CommentRange } from "./model";
import { commentField, indexToArray } from "./state";
import { mount, unmount } from "svelte";
import CommentThreadLayer from "../components/CommentThreadLayer.svelte";

const COMMENT_MARKER_SELECTOR = ".cm-commentIndicator-marker";
const COMMENT_THREAD_SELECTOR = ".cm-commentIndicator-thread";
const COMMENT_THREAD_OPEN_CLASS = "is-open";

const _EDITOR_CLASS = "cm-contentContainer"; // Editor scroller with the document
const THREAD_LAYER_CLASS = "cm-thread-layer";

const openThreadCleanup = new WeakMap<HTMLElement, () => void>();

type _WorkspaceResizeBinding = {
	workspace: Workspace;
	ref: EventRef;
};

// ---------- Utilities ----------

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
 * Mounts the Svelte thread component in the thread layer.
 */
function openThreadForMarker(view: EditorView, markerEl: HTMLElement, comments: CommentRange[]) {
	const layer = ensureThreadLayer(view);
	if (!layer) return;

	// Close any previously-open thread on this marker.
	closeThreadElement(markerEl);

	markerEl.classList.add(COMMENT_THREAD_OPEN_CLASS);

	// Create a container for the Svelte component
	const container = document.createElement("div");
	layer.appendChild(container);

	// Mount the Svelte component
	const svelteComponent = mount(CommentThreadLayer, {
		target: container,
		props: {
			comments,
			markerElement: markerEl,
			editorView: view,
			onClose: () => {
				closeThreadElement(markerEl);
			},
		},
	});

	// Register cleanup.
	openThreadCleanup.set(markerEl, () => {
		unmount(svelteComponent);
		container.remove();
	});
}

// ---------- Rendering ----------
// Rendering is now handled by Svelte components

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

	// Open a new thread using Svelte component.
	openThreadForMarker(view, markerEl, comments);
	return true;
}

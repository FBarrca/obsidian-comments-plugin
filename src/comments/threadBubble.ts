import { EditorState } from "@codemirror/state";
import { BlockInfo, EditorView } from "@codemirror/view";
import { Notice } from "obsidian";
import type { EventRef, Workspace } from "obsidian";
import type { CommentRange } from "./model";
import { commentField, indexToArray } from "./state";
import { THREAD_UPDATE_EVENT, ThreadUpdateDetail } from "./threadEvents";
import { getCommentById, getDatabaseAPI } from "./selectors";
import { setDatabaseAPI } from "./model";
import type { CommentAPIWithDatabase } from "./apiWithDatabase";
import { mount, unmount } from "svelte";
import CommentThreadLayer from "../components/CommentThreadLayer.svelte";

const COMMENT_MARKER_SELECTOR = ".cm-commentIndicator-marker";
const COMMENT_THREAD_SELECTOR = ".cm-commentIndicator-thread";
const COMMENT_THREAD_OPEN_CLASS = "is-open";

const THREAD_VIEWPORT_PADDING = 12;
const THREAD_INLINE_SPACING = 12;
const MIN_THREAD_WIDTH = 220;

const EDITOR_CLASS = "cm-contentContainer"; // Editor scroller with the document
const THREAD_LAYER_CLASS = "cm-thread-layer";

const openThreadCleanup = new WeakMap<HTMLElement, () => void>();

// Global references shared with UI layers
let globalDatabaseAPI: CommentAPIWithDatabase | null = null;
export function setGlobalDatabaseAPI(api: CommentAPIWithDatabase) {
	globalDatabaseAPI = api;
}

type ThreadLayerInstance = Record<string, unknown> & {
	$set?: (props: { comments: CommentRange[] }) => void;
};

type _WorkspaceResizeBinding = {
	workspace: Workspace;
	ref: EventRef;
};

// ---------- Utilities ----------

const _clamp = (v: number, min: number, max: number) =>
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

function _getMarginRight(view: EditorView): number {
	const editorEl = view.dom as HTMLElement;
	const contentContainerEl = editorEl.querySelector(`.${EDITOR_CLASS}`) as HTMLElement | null;
	if (!contentContainerEl) return 0;
	const editorRect = editorEl.getBoundingClientRect();
	const contentRect = contentContainerEl.getBoundingClientRect();
	return (editorRect.width - contentRect.width) / 2;
}

function _subscribeToWorkspaceResize(listener: () => void): _WorkspaceResizeBinding | null {
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

	// Get the database API from the state or use the global one
	let databaseAPI = getDatabaseAPI(view) as CommentAPIWithDatabase | null;

	// If not in state, use global API and set it in state
	if (!databaseAPI && globalDatabaseAPI) {
		databaseAPI = globalDatabaseAPI;
		// Set it in the state for future use
		view.dispatch({ effects: setDatabaseAPI.of({ api: globalDatabaseAPI }) });
	}

	if (!comments.length) {
		closeThreadElement(markerEl);
		return;
	}

	function cloneComment(comment: CommentRange): CommentRange {
		return {
			...comment,
			replies: comment.replies?.map((reply) => ({ ...reply })),
		};
	}

	function repliesEqual(a?: CommentRange["replies"], b?: CommentRange["replies"]): boolean {
		const left = a ?? [];
		const right = b ?? [];
		if (left.length !== right.length) {
			return false;
		}
		for (let i = 0; i < left.length; i++) {
			const lhs = left[i];
			const rhs = right[i];
			if (
				lhs.id !== rhs.id ||
				lhs.text !== rhs.text ||
				lhs.author !== rhs.author ||
				String(lhs.createdAt ?? "") !== String(rhs.createdAt ?? "") ||
				String(lhs.updatedAt ?? "") !== String(rhs.updatedAt ?? "")
			) {
				return false;
			}
		}
		return true;
	}

	function commentsEqual(a: CommentRange[], b: CommentRange[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			const lhs = a[i];
			const rhs = b[i];
			if (
				lhs.id !== rhs.id ||
				lhs.from !== rhs.from ||
				lhs.to !== rhs.to ||
				lhs.text !== rhs.text ||
				lhs.author !== rhs.author ||
				Boolean(lhs.resolved) !== Boolean(rhs.resolved)
			) {
				return false;
			}
			if (!repliesEqual(lhs.replies, rhs.replies)) {
				return false;
			}
		}
		return true;
	}

	let threadComments = comments.map((comment) => cloneComment(comment));
	let svelteComponent: ThreadLayerInstance | null = null;
	let trackedLineNumber = view.state.doc.lineAt(comments[0].from).number;

	function loadCommentsForLine(state: EditorState, lineNumber: number) {
		const clamped = Math.max(1, Math.min(lineNumber, state.doc.lines));
		const line = state.doc.line(clamped);
		return getCommentsForLineRange(state, line.from, line.to);
	}

	const handleEditComment = async (commentId: string, nextText: string) => {
		const api =
			(getDatabaseAPI(view) as CommentAPIWithDatabase | null) ??
			databaseAPI ??
			globalDatabaseAPI;
		if (!api || typeof api.updateCommentCommand !== "function") {
			console.warn("editComment: database API not available", { id: commentId });
			return false;
		}

		const trimmed = nextText.trim();
		if (!trimmed.length) {
			return false;
		}

		const current = threadComments.find((item) => item.id === commentId);
		const currentText = (current?.text ?? "").trim();
		if (trimmed === currentText) {
			return true;
		}

		try {
			const success = await api.updateCommentCommand(view, commentId, { text: trimmed });
			if (!success) {
				new Notice("Failed to update comment");
				return false;
			}

			if (current) {
				threadComments = threadComments.map((item) =>
					item.id === commentId ? { ...item, text: trimmed } : item,
				);
				svelteComponent?.$set?.({ comments: threadComments });
			}

			return true;
		} catch (error) {
			console.error("Failed to update comment:", { id: commentId, error });
			new Notice("Failed to update comment");
			return false;
		}
	};
	const handleResolveComment = async (commentId: string, resolved = true) => {
		const api =
			(getDatabaseAPI(view) as CommentAPIWithDatabase | null) ??
			databaseAPI ??
			globalDatabaseAPI;
		if (!api || typeof api.resolveCommentCommand !== "function") {
			console.warn("resolveComment: database API not available", { id: commentId });
			return false;
		}

		const current = threadComments.find((item) => item.id === commentId);
		if (current?.resolved === resolved) {
			return true;
		}

		const noticeMessage = resolved ? "Failed to resolve comment" : "Failed to reopen comment";
		const consoleMessage = resolved
			? "Failed to resolve comment"
			: "Failed to unresolve comment";

		try {
			const success = await api.resolveCommentCommand(view, commentId, resolved);
			if (!success) {
				new Notice(noticeMessage);
				return false;
			}

			threadComments = threadComments.map((item) =>
				item.id === commentId ? { ...item, resolved } : item,
			);
			svelteComponent?.$set?.({ comments: threadComments });
			return true;
		} catch (error) {
			console.error(`${consoleMessage}:`, { id: commentId, error });
			new Notice(noticeMessage);
			return false;
		}
	};

	const handleReplyToComment = async (commentId: string, replyText: string) => {
		const api =
			(getDatabaseAPI(view) as CommentAPIWithDatabase | null) ??
			databaseAPI ??
			globalDatabaseAPI;
		if (!api || typeof api.addReplyToComment !== "function") {
			console.warn("replyToComment: database API not available", { id: commentId });
			return false;
		}
		const trimmed = replyText.trim();
		if (!trimmed.length) {
			return false;
		}
		try {
			const updated = await api.addReplyToComment(view, commentId, { text: trimmed });
			if (!updated) {
				new Notice("Failed to add reply");
				return false;
			}
			const stateComment = getCommentById(view, commentId) ?? updated;
			if (stateComment) {
				threadComments = threadComments.map((item) =>
					item.id === commentId ? { ...item, ...stateComment } : item,
				);
				svelteComponent?.$set?.({ comments: threadComments });
			}
			return true;
		} catch (error) {
			console.error("Failed to add reply:", { id: commentId, error });
			new Notice("Failed to add reply");
			return false;
		}
	};
	// Mount the Svelte component
	svelteComponent = mount(CommentThreadLayer, {
		target: container,
		props: {
			comments: threadComments,
			markerElement: markerEl,
			editorView: view,
			databaseAPI,
			onResolve: handleResolveComment,
			onEdit: handleEditComment,
			onReply: handleReplyToComment,
			onClose: () => {
				closeThreadElement(markerEl);
			},
			// Pass positioning constants
			threadViewportPadding: THREAD_VIEWPORT_PADDING,
			threadInlineSpacing: THREAD_INLINE_SPACING,
			minThreadWidth: MIN_THREAD_WIDTH,
		},
	});
	const handleThreadUpdate = (event: Event) => {
		const detail = (event as CustomEvent<ThreadUpdateDetail>).detail;
		if (!detail || detail.view !== view) {
			return;
		}
		if (detail.lineNumber !== trackedLineNumber) {
			// Allow updates triggered by other comments on the same line
			trackedLineNumber = detail.lineNumber;
		}
		const updated = loadCommentsForLine(view.state, trackedLineNumber);
		if (!updated.length) {
			closeThreadElement(markerEl);
			return;
		}
		trackedLineNumber = view.state.doc.lineAt(updated[0].from).number;
		if (commentsEqual(threadComments, updated)) {
			return;
		}
		threadComments = updated.map((comment) => cloneComment(comment));
		svelteComponent?.$set?.({ comments: threadComments });
	};

	window.addEventListener(THREAD_UPDATE_EVENT, handleThreadUpdate);

	// Register cleanup.
	openThreadCleanup.set(markerEl, () => {
		window.removeEventListener(THREAD_UPDATE_EVENT, handleThreadUpdate);
		if (svelteComponent) {
			unmount(svelteComponent);
			svelteComponent = null;
		}
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

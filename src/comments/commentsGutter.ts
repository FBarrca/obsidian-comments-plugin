import {
	EditorState,
	Extension,
	Facet,
	RangeSet,
	StateField,
	combineConfig,
} from "@codemirror/state";
import { BlockInfo, EditorView, ViewUpdate, WidgetType } from "@codemirror/view";
import { activeGutters, gutters, GutterMarker } from "./rightGutter";
import { setIcon } from "obsidian";
import { addOrUpdateComment, removeComment } from "./model";
import type { CommentRange } from "./model";
import { commentField, indexToArray } from "./state";

type Handlers = {
	[event: string]: (view: EditorView, line: BlockInfo, event: Event) => boolean;
};

export const commentsIndicatorMarkers = Facet.define<RangeSet<GutterMarker>>();

/// Facet used to create markers in the comments indicator gutter next to widgets.
export const commentsIndicatorWidgetMarker =
	Facet.define<(view: EditorView, widget: WidgetType, block: BlockInfo) => GutterMarker | null>();

interface CommentsIndicatorConfig {
	/// How to display the count of comments attached to a line. Defaults to decimal string output.
	formatNumber?: (count: number, state: EditorState) => string;
	/// Supply event handlers for DOM events on this gutter.
	domEventHandlers?: Handlers;
}

class CommentsIndicatorMarker extends GutterMarker {
	constructor(
		readonly count: number,
		readonly label: string,
	) {
		super();
	}
	eq(other: CommentsIndicatorMarker) {
		return this.count === other.count && this.label === other.label;
	}
	toDOM() {
		const container = document.createElement("span");
		container.className = "cm-commentIndicator-marker";

		const icon = document.createElement("span");
		icon.className = "cm-commentIndicator-icon";
		setIcon(icon, "message-square-text");
		container.append(icon);

		const safeCount = Math.max(0, this.count);
		const title = safeCount > 1 ? `${safeCount} comments` : "One comment";
		container.setAttribute("aria-label", title);
		container.dataset.commentCount = safeCount.toString();

		if (safeCount > 1) {
			container.appendChild(document.createTextNode(" "));
			const countSpan = document.createElement("span");
			countSpan.className = "cm-commentIndicator-count";
			countSpan.textContent = this.label;
			container.append(countSpan);
		}

		return container;
	}
}

const commentsIndicatorConfig = Facet.define<
	CommentsIndicatorConfig,
	Required<CommentsIndicatorConfig>
>({
	combine(values) {
		return combineConfig<Required<CommentsIndicatorConfig>>(
			values,
			{ formatNumber: String, domEventHandlers: {} },
			{
				domEventHandlers(a: Handlers, b: Handlers) {
					const result: Handlers = Object.assign({}, a);
					for (const event in b) {
						const exists = result[event],
							add = b[event];
						result[event] = exists
							? (view, line, ev) => exists(view, line, ev) || add(view, line, ev)
							: add;
					}
					return result;
				},
			},
		);
	},
});

function formatCommentNumber(view: EditorView, count: number) {
	return view.state.facet(commentsIndicatorConfig).formatNumber(count, view.state);
}

function maxCommentNumber(lines: number) {
	let last = 9;
	while (last < lines) last = last * 10 + 9;
	return last;
}

const COMMENT_MARKER_SELECTOR = ".cm-commentIndicator-marker";
const COMMENT_THREAD_SELECTOR = ".cm-commentIndicator-thread";
const COMMENT_THREAD_OPEN_CLASS = "is-open";
const COMMENT_THREAD_FLOATING_CLASS = "cm-commentIndicator-threadFloating";
const openThreadCleanup = new WeakMap<HTMLElement, () => void>();

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

function closeThreadElement(markerEl: HTMLElement) {
	markerEl.classList.remove(COMMENT_THREAD_OPEN_CLASS);
	const cleanup = openThreadCleanup.get(markerEl);
	if (cleanup) {
		openThreadCleanup.delete(markerEl);
		cleanup();
	}
	const existing = markerEl.querySelector<HTMLElement>(COMMENT_THREAD_SELECTOR);
	existing?.remove();
}

function closeAllThreads(root: HTMLElement, except?: HTMLElement) {
	const openMarkers = root.querySelectorAll<HTMLElement>(
		`${COMMENT_MARKER_SELECTOR}.${COMMENT_THREAD_OPEN_CLASS}`,
	);
	openMarkers.forEach((el) => {
		if (el === except) return;
		closeThreadElement(el);
	});
}

function positionThreadForMarker(view: EditorView, markerEl: HTMLElement, threadEl: HTMLElement) {
	threadEl.classList.add(COMMENT_THREAD_FLOATING_CLASS);
	threadEl.style.display = "block";
	threadEl.style.position = "fixed";
	threadEl.style.zIndex = "var(--layer-popover, 100)";
	threadEl.style.pointerEvents = "auto";

	const spacing = 12;
	const viewportPadding = 12;

	function reposition() {
		if (!markerEl.isConnected) {
			closeThreadElement(markerEl);
			return;
		}

		const markerRect = markerEl.getBoundingClientRect();
		const overlayWidth = threadEl.offsetWidth || threadEl.getBoundingClientRect().width;
		const overlayHeight = threadEl.offsetHeight || threadEl.getBoundingClientRect().height;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const isRTL = window.getComputedStyle(markerEl).direction === "rtl";

		let left: number;
		if (isRTL) {
			left = markerRect.left - spacing - overlayWidth;
			if (left < viewportPadding) {
				left = markerRect.right + spacing;
			}
		} else {
			left = markerRect.right + spacing;
			if (left + overlayWidth > viewportWidth - viewportPadding) {
				left = markerRect.left - spacing - overlayWidth;
			}
		}
		left = Math.max(
			viewportPadding,
			Math.min(left, viewportWidth - viewportPadding - overlayWidth),
		);
		threadEl.style.left = `${left}px`;
		threadEl.style.right = "auto";

		let top = markerRect.top;
		if (top + overlayHeight > viewportHeight - viewportPadding) {
			top = viewportHeight - viewportPadding - overlayHeight;
		}
		top = Math.max(viewportPadding, top);
		threadEl.style.top = `${top}px`;
	}

	const onViewScroll = () => reposition();
	const onWindowScroll = () => reposition();

	document.body.appendChild(threadEl);
	reposition();

	view.scrollDOM.addEventListener("scroll", onViewScroll, { passive: true });
	window.addEventListener("resize", reposition);
	window.addEventListener("scroll", onWindowScroll, { passive: true });

	openThreadCleanup.set(markerEl, () => {
		view.scrollDOM.removeEventListener("scroll", onViewScroll);
		window.removeEventListener("resize", reposition);
		window.removeEventListener("scroll", onWindowScroll);
		threadEl.remove();
	});
}

function renderThread(comments: CommentRange[]): HTMLElement {
	const container = document.createElement("div");
	container.className = "cm-commentIndicator-thread";
	for (const comment of comments) {
		container.appendChild(renderThreadItem(comment));
	}
	return container;
}

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

function formatTimestamp(value: CommentRange["createdAt"]): string | null {
	if (value === undefined || value === null) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString();
}

function handleCommentMarkerPointerDown(view: EditorView, line: BlockInfo, event: Event): boolean {
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
	positionThreadForMarker(view, markerEl, threadEl);
	markerEl.classList.add(COMMENT_THREAD_OPEN_CLASS);

	return true;
}

/* -------------------------------------------
   Marker derivation
------------------------------------------- */

function collectCommentLineCounts(state: EditorState): Map<number, number> {
	const commentState = state.field(commentField, false);
	if (!commentState) {
		return new Map();
	}

	const doc = state.doc;
	const counts = new Map<number, number>();
	for (const comment of indexToArray(commentState.byId)) {
		const fromLine = doc.lineAt(comment.from).number;
		const toLine = doc.lineAt(comment.to).number;
		for (let lineNo = fromLine; lineNo <= toLine; lineNo++) {
			counts.set(lineNo, (counts.get(lineNo) ?? 0) + 1);
		}
	}

	return counts;
}

function computeCommentMarkers(state: EditorState) {
	const lineCounts = collectCommentLineCounts(state);
	return buildCommentMarkerSet(state, lineCounts);
}

function buildCommentMarkerSet(state: EditorState, lineCounts: Map<number, number>) {
	const cfg = state.facet(commentsIndicatorConfig);
	const ranges: { from: number; to: number; value: GutterMarker }[] = [];

	for (const [lineNo, count] of lineCounts) {
		if (lineNo < 1 || lineNo > state.doc.lines) continue;
		const line = state.doc.line(lineNo);
		const label = cfg.formatNumber(count, state);
		ranges.push({
			from: line.from,
			to: line.from,
			value: new CommentsIndicatorMarker(count, label),
		});
	}

	ranges.sort((a, b) => a.from - b.from);

	return RangeSet.of(ranges, true);
}

/**
 * Internal StateField that stores the RangeSet of indicators.
 * It feeds the public `commentsIndicatorMarkers` facet so the gutter can read it.
 */
const commentLineMarkersField = StateField.define<RangeSet<GutterMarker>>({
	create(state) {
		return computeCommentMarkers(state);
	},
	update(value, tr) {
		const hasCommentChange =
			tr.docChanged ||
			tr.effects.some((e) => e.is(addOrUpdateComment) || e.is(removeComment));

		if (!hasCommentChange) {
			return value;
		}

		return computeCommentMarkers(tr.state);
	},
	provide: (f) => commentsIndicatorMarkers.from(f),
});

/**
 * Gutter definition: reads markers exclusively from the RangeSet facet.
 * `lineMarker` returns null so we do NOT draw on every line by default.
 */
const commentsIndicatorGutter = activeGutters.compute([commentsIndicatorConfig], (state) => ({
	class: "cm-commentIndicator",
	renderEmptyElements: false,
	markers(view: EditorView) {
		return view.state.facet(commentsIndicatorMarkers);
	},
	lineMarker(/* view, line, others */) {
		// No default markers; only those in `markers()` are shown
		return null;
	},
	widgetMarker: (view: EditorView, widget: WidgetType, block: BlockInfo) => {
		for (const marker of view.state.facet(commentsIndicatorWidgetMarker)) {
			const result = marker(view, widget, block);
			if (result) return result;
		}
		return null;
	},
	lineMarkerChange: (update: ViewUpdate) =>
		update.startState.facet(commentsIndicatorConfig) !=
		update.state.facet(commentsIndicatorConfig),
	// Optional: keep spacer if you want gutter width stable for large format numbers
	initialSpacer(view: EditorView) {
		const maxCount = maxCommentNumber(view.state.doc.lines);
		return new CommentsIndicatorMarker(maxCount, formatCommentNumber(view, maxCount));
	},
	updateSpacer(spacer: GutterMarker, update: ViewUpdate) {
		const maxCount = maxCommentNumber(update.view.state.doc.lines);
		const maxLabel = formatCommentNumber(update.view, maxCount);
		const marker = spacer as CommentsIndicatorMarker;
		return marker.count === maxCount && marker.label === maxLabel
			? spacer
			: new CommentsIndicatorMarker(maxCount, maxLabel);
	},
	domEventHandlers: state.facet(commentsIndicatorConfig).domEventHandlers,
	side: "after",
}));

/// Create a comments indicator gutter extension.
export function commentsIndicator(config: CommentsIndicatorConfig = {}): Extension {
	const baseHandlers = config.domEventHandlers ?? {};
	const existingPointerDown = baseHandlers.pointerdown;
	const domHandlers: Handlers = {
		...baseHandlers,
		pointerdown(view, line, event) {
			if (handleCommentMarkerPointerDown(view, line, event)) {
				return true;
			}
			return existingPointerDown ? existingPointerDown(view, line, event) : false;
		},
	};

	return [
		commentLineMarkersField,
		commentsIndicatorConfig.of({
			...config,
			domEventHandlers: domHandlers,
		}),
		gutters(),
		commentsIndicatorGutter,
	];
}

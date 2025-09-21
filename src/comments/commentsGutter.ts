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
		const title = safeCount > 1 ? `${safeCount} comments` : "Add a comment";
		container.title = title;
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
	return [
		commentLineMarkersField, // <- derives markers from comment state
		commentsIndicatorConfig.of(config), // <- config facet
		gutters(),
		commentsIndicatorGutter,
	];
}

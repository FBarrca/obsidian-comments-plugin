import { EditorState, Extension, Facet, RangeSet, combineConfig } from "@codemirror/state";
import { activeGutters, gutters, GutterMarker } from "./rightGutter";
import { BlockInfo, EditorView, ViewUpdate, WidgetType } from "@codemirror/view";

type Handlers = {
	[event: string]: (view: EditorView, line: BlockInfo, event: Event) => boolean;
};

export const commentsIndicatorMarkers = Facet.define<RangeSet<GutterMarker>>();

/// Facet used to create markers in the comments indicator gutter next to widgets.
export const commentsIndicatorWidgetMarker =
	Facet.define<(view: EditorView, widget: WidgetType, block: BlockInfo) => GutterMarker | null>();

interface CommentsIndicatorConfig {
	/// How to display comment indicators. Defaults to simply converting the line number to string.
	formatNumber?: (lineNo: number, state: EditorState) => string;
	/// Supply event handlers for DOM events on this gutter.
	domEventHandlers?: Handlers;
}

class CommentsIndicatorMarker extends GutterMarker {
	constructor(readonly number: string) {
		super();
	}

	eq(other: CommentsIndicatorMarker) {
		return this.number == other.number;
	}

	toDOM() {
		return document.createTextNode(this.number);
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
					let result: Handlers = Object.assign({}, a);
					for (let event in b) {
						let exists = result[event],
							add = b[event];
						result[event] = exists
							? (view, line, event) =>
									exists(view, line, event) || add(view, line, event)
							: add;
					}
					return result;
				},
			},
		);
	},
});

function formatCommentNumber(view: EditorView, number: number) {
	return view.state.facet(commentsIndicatorConfig).formatNumber(number, view.state);
}

function maxCommentNumber(lines: number) {
	let last = 9;
	while (last < lines) last = last * 10 + 9;
	return last;
}

const commentsIndicatorGutter = activeGutters.compute([commentsIndicatorConfig], (state) => ({
	class: "cm-commentIndicator",
	renderEmptyElements: false,
	markers(view: EditorView) {
		return view.state.facet(commentsIndicatorMarkers);
	},
	lineMarker(view, line, others) {
		if (others.some((m) => m.toDOM)) return null;
		return new CommentsIndicatorMarker(
			formatCommentNumber(view, view.state.doc.lineAt(line.from).number),
		);
	},
	widgetMarker: (view, widget, block) => {
		for (let marker of view.state.facet(commentsIndicatorWidgetMarker)) {
			let result = marker(view, widget, block);
			if (result) return result;
		}
		return null;
	},
	lineMarkerChange: (update) =>
		update.startState.facet(commentsIndicatorConfig) !=
		update.state.facet(commentsIndicatorConfig),
	initialSpacer(view: EditorView) {
		return new CommentsIndicatorMarker(
			formatCommentNumber(view, maxCommentNumber(view.state.doc.lines)),
		);
	},
	updateSpacer(spacer: GutterMarker, update: ViewUpdate) {
		let max = formatCommentNumber(update.view, maxCommentNumber(update.view.state.doc.lines));
		return max == (spacer as CommentsIndicatorMarker).number
			? spacer
			: new CommentsIndicatorMarker(max);
	},
	domEventHandlers: state.facet(commentsIndicatorConfig).domEventHandlers,
	side: "after",
}));

/// Create a comments indicator gutter extension.
export function commentsIndicator(config: CommentsIndicatorConfig = {}): Extension {
	return [commentsIndicatorConfig.of(config), gutters(), commentsIndicatorGutter];
}

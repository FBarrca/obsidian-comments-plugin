import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { MapMode, StateField } from "@codemirror/state";
import {
	buildDecorations,
	commentHighlightColorFacet,
	defaultCommentHighlightColor,
} from "./decorations";
import {
	CommentRange,
	addOrUpdateComment,
	clampRange,
	removeComment,
	setActiveComment,
} from "./model";

export type CommentIndex = Map<string, CommentRange>;

export interface CommentState {
	byId: CommentIndex;
	decos: DecorationSet;
	activeId: string | null;
	highlightColor: string;
}

export function indexToArray(idx: CommentIndex): CommentRange[] {
	return Array.from(idx.values()).sort(
		(a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id),
	);
}

export const commentField = StateField.define<CommentState>({
	create(state) {
		const highlightColor =
			state.facet(commentHighlightColorFacet) ?? defaultCommentHighlightColor;
		return { byId: new Map(), decos: Decoration.none, activeId: null, highlightColor };
	},
	update(curr, tr) {
		const docLen = tr.newDoc.length;
		let activeId = curr.activeId;
		let needsRebuild = tr.docChanged;
		let byId: CommentIndex;
		const highlightColor =
			tr.state.facet(commentHighlightColorFacet) ?? defaultCommentHighlightColor;

		if (highlightColor !== curr.highlightColor) {
			needsRebuild = true;
		}

		if (tr.docChanged) {
			byId = new Map<string, CommentRange>();
			for (const [id, comment] of curr.byId) {
				const mappedFrom = tr.changes.mapPos(comment.from, 1, MapMode.TrackDel);
				const mappedTo = tr.changes.mapPos(comment.to, -1, MapMode.TrackDel);
				const [from, to] = clampRange(
					docLen,
					mappedFrom ?? comment.from,
					mappedTo ?? comment.to,
				);
				byId.set(id, { ...comment, from, to });
			}
		} else {
			byId = new Map(curr.byId);
		}

		const effectSummary: Array<Record<string, unknown>> = [];

		for (const effect of tr.effects) {
			if (effect.is(addOrUpdateComment)) {
				const value = effect.value;
				const [from, to] = clampRange(docLen, value.from, value.to);
				byId.set(value.id, { ...value, from, to });
				needsRebuild = true;
				effectSummary.push({ type: "addOrUpdate", id: value.id, from, to });
			} else if (effect.is(removeComment)) {
				if (byId.delete(effect.value.id)) {
					needsRebuild = true;
				}
				if (activeId === effect.value.id) {
					activeId = null;
				}
				effectSummary.push({ type: "remove", id: effect.value.id });
			} else if (effect.is(setActiveComment)) {
				if (activeId !== effect.value.id) {
					activeId = effect.value.id;
					needsRebuild = true;
				}
				effectSummary.push({ type: "setActive", id: effect.value.id });
			} else {
				effectSummary.push({ type: "other" });
			}
		}

		if (needsRebuild) {
			console.log("commentField.rebuild", {
				docChanged: tr.docChanged,
				commentCount: byId.size,
				activeId,
				docLength: docLen,
				effects: effectSummary,
				highlightColor,
			});
		}

		const decos = needsRebuild
			? buildDecorations(docLen, indexToArray(byId), activeId, highlightColor)
			: curr.decos;

		return { byId, decos, activeId, highlightColor };
	},
	provide: (field) => [EditorView.decorations.from(field, (state) => state.decos)],
});

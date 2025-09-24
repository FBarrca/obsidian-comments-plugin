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
	syncWithDatabase,
	loadFromDatabase,
	setDatabaseAPI,
} from "./model";
import { CommentAPIWithDatabase } from "./apiWithDatabase";

export type CommentIndex = Map<string, CommentRange>;

export interface CommentState {
	byId: CommentIndex;
	decos: DecorationSet;
	activeId: string | null;
	highlightColor: string;
	databaseAPI: CommentAPIWithDatabase | null;
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
		return {
			byId: new Map(),
			decos: Decoration.none,
			activeId: null,
			highlightColor,
			databaseAPI: null,
		};
	},
	update(curr, tr) {
		const docLen = tr.newDoc.length;
		let activeId = curr.activeId;
		let needsRebuild = tr.docChanged;
		let byId: CommentIndex;
		let databaseAPI = curr.databaseAPI;
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
			} else if (effect.is(loadFromDatabase)) {
				// Load comments from database
				byId = new Map<string, CommentRange>();
				for (const comment of effect.value.comments) {
					const [from, to] = clampRange(docLen, comment.from, comment.to);
					byId.set(comment.id, { ...comment, from, to });
				}
				needsRebuild = true;
				effectSummary.push({
					type: "loadFromDatabase",
					count: effect.value.comments.length,
				});
			} else if (effect.is(syncWithDatabase)) {
				// Sync current state with database
				byId = new Map<string, CommentRange>();
				for (const comment of effect.value.comments) {
					const [from, to] = clampRange(docLen, comment.from, comment.to);
					byId.set(comment.id, { ...comment, from, to });
				}
				needsRebuild = true;
				effectSummary.push({
					type: "syncWithDatabase",
					count: effect.value.comments.length,
				});
			} else if (effect.is(setDatabaseAPI)) {
				// Set the database API
				databaseAPI = effect.value.api;
				effectSummary.push({ type: "setDatabaseAPI" });
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

		return { byId, decos, activeId, highlightColor, databaseAPI };
	},
	provide: (field) => [EditorView.decorations.from(field, (state) => state.decos)],
});

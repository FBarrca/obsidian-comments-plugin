import { EditorView } from "@codemirror/view";
import { CommentRange } from "./model";
import { commentField, indexToArray } from "./state";

export function getAllComments(view: EditorView): CommentRange[] {
	const state = view.state.field(commentField, false);
	return state ? indexToArray(state.byId) : [];
}

export function getCommentById(view: EditorView, id: string): CommentRange | undefined {
	const state = view.state.field(commentField, false);
	return state?.byId.get(id);
}

export function getActiveComment(view: EditorView): CommentRange | undefined {
	const state = view.state.field(commentField, false);
	const activeId = state?.activeId ?? null;
	return activeId ? state?.byId.get(activeId) : undefined;
}

export function getCommentsAtPos(view: EditorView, pos: number): CommentRange[] {
	const state = view.state.field(commentField, false);
	if (!state) {
		return [];
	}

	const hits: CommentRange[] = [];
	const seen = new Set<string>();

	state.decos.between(pos, pos, (_from, _to, deco) => {
		const id = deco.spec?.attributes?.["data-comment-id"];
		if (typeof id === "string" && !seen.has(id)) {
			const comment = state.byId.get(id);
			if (comment) {
				hits.push(comment);
				seen.add(id);
			}
		}
	});

	return hits;
}

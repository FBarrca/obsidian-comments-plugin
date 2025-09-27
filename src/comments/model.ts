import { StateEffect } from "@codemirror/state";

/** A reply attached to a comment thread. */
export interface CommentReply {
	id: string;
	text: string;
	author?: string;
	createdAt?: string | number | Date;
	updatedAt?: string | number | Date;
}

/** Public shape of a comment. */
export interface CommentRange {
	id: string;
	from: number;
	to: number;
	text?: string;
	author?: string;
	createdAt?: string | number | Date;
	resolved?: boolean;
	replies?: CommentReply[];
}

/** Event name dispatched from the editor DOM on comment interaction. */
export const COMMENT_CLICK_EVENT = "cm-comment-click";

/** Internal helper to keep ranges inside the document. */
export function clampRange(docLen: number, from: number, to: number) {
	const a = Math.max(0, Math.min(from, docLen));
	const b = Math.max(0, Math.min(to, docLen));
	return a <= b ? ([a, b] as const) : ([b, a] as const);
}

export const addOrUpdateComment = StateEffect.define<CommentRange>();
export const removeComment = StateEffect.define<{ id: string }>();
export const setActiveComment = StateEffect.define<{ id: string | null }>();
export const syncWithDatabase = StateEffect.define<{ comments: CommentRange[] }>();
export const loadFromDatabase = StateEffect.define<{ comments: CommentRange[] }>();
export const setDatabaseAPI = StateEffect.define<{ api: unknown }>();

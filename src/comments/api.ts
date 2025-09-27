import { EditorView } from "@codemirror/view";
import {
	CommentRange,
	CommentReply,
	addOrUpdateComment,
	removeComment,
	setActiveComment,
} from "./model";
import { getCommentById } from "./selectors";
import { emitThreadUpdate } from "./threadEvents";

export function addCommentCommand(view: EditorView, comment: CommentRange): boolean {
	console.log("addCommentCommand", { id: comment.id, from: comment.from, to: comment.to });
	view.dispatch({ effects: addOrUpdateComment.of(comment) });
	emitThreadUpdate(view, comment.from);
	return true;
}

export function updateCommentCommand(
	view: EditorView,
	id: string,
	patch: Partial<Omit<CommentRange, "id">>,
): boolean {
	const current = getCommentById(view, id);
	if (!current) {
		console.log("updateCommentCommand: missing comment", { id });
		return false;
	}

	const next: CommentRange = { ...current, ...patch, id };
	console.log("updateCommentCommand", { id, patch });
	view.dispatch({ effects: addOrUpdateComment.of(next) });
	return true;
}

export function resolveCommentCommand(view: EditorView, id: string, resolved = true): boolean {
	console.log("resolveCommentCommand", { id, resolved });
	return updateCommentCommand(view, id, { resolved });
}

export function removeCommentCommand(view: EditorView, id: string): boolean {
	const comment = getCommentById(view, id);
	if (!comment) {
		console.log("removeCommentCommand: missing comment", { id });
		return false;
	}

	console.log("removeCommentCommand", { id });
	view.dispatch({ effects: removeComment.of({ id }) });
	emitThreadUpdate(view, comment.from);
	return true;
}

export function setActiveCommentCommand(view: EditorView, id: string | null): boolean {
	console.log("setActiveCommentCommand", { id });
	view.dispatch({ effects: setActiveComment.of({ id }) });
	return true;
}

export function scrollToComment(view: EditorView, id: string): boolean {
	const comment = getCommentById(view, id);
	if (!comment) {
		console.log("scrollToComment: missing comment", { id });
		return false;
	}

	console.log("scrollToComment", { id, from: comment.from });
	view.focus();
	view.dispatch({
		selection: { anchor: comment.from, head: comment.from },
		scrollIntoView: true,
		effects: setActiveComment.of({ id }),
	});

	return true;
}

export function addCommentFromSelection(
	view: EditorView,
	data: Omit<CommentRange, "from" | "to">,
): string {
	const selection = view.state.selection.main;
	const id = data.id || cryptoRandomCommentId();
	console.log("addCommentFromSelection", {
		id,
		anchor: selection.from,
		head: selection.to,
		provided: { ...data },
	});
	addCommentCommand(view, { ...data, id, from: selection.from, to: selection.to });
	return id;
}

export function addReplyToComment(
	view: EditorView,
	commentId: string,
	payload: { text: string; author?: string; replyId?: string },
): CommentRange | null {
	const comment = getCommentById(view, commentId);
	if (!comment) {
		console.warn("addReplyToComment: missing comment", { id: commentId });
		return null;
	}

	const trimmed = payload.text.trim();
	if (!trimmed.length) {
		console.warn("addReplyToComment: empty text", { id: commentId });
		return null;
	}

	const now = new Date().toISOString();
	const reply: CommentReply = {
		id: payload.replyId ?? cryptoRandomReplyId(),
		text: trimmed,
		author: payload.author,
		createdAt: now,
		updatedAt: now,
	};

	const next: CommentRange = {
		...comment,
		replies: [...(comment.replies ?? []), reply],
		id: commentId,
	};

	console.log("addReplyToComment", { commentId, replyId: reply.id });
	view.dispatch({ effects: addOrUpdateComment.of(next) });
	emitThreadUpdate(view, comment.from);
	return next;
}

function cryptoRandomCommentId() {
	return `c_${Math.random().toString(36).slice(2, 9)}`;
}

function cryptoRandomReplyId() {
	return `r_${Math.random().toString(36).slice(2, 9)}`;
}

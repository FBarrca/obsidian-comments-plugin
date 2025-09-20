import { EditorView, KeyBinding } from "@codemirror/view";
import { getActiveComment, getAllComments } from "./selectors";
import { scrollToComment } from "./api";
import { CommentRange } from "./model";

export interface NavigationOptions {
	wrap?: boolean;
}

function findNextComment(
	all: CommentRange[],
	activeId: string | undefined,
	cursorPos: number,
	wrap: boolean,
): CommentRange | undefined {
	if (!all.length) {
		return undefined;
	}

	if (activeId) {
		const idx = all.findIndex((comment) => comment.id === activeId);
		if (idx >= 0) {
			const next = all[idx + 1];
			if (next) {
				return next;
			}
			return wrap ? all[0] : undefined;
		}
	}

	for (const comment of all) {
		if (comment.from >= cursorPos) {
			return comment;
		}
	}

	return wrap ? all[0] : undefined;
}

function findPreviousComment(
	all: CommentRange[],
	activeId: string | undefined,
	cursorPos: number,
	wrap: boolean,
): CommentRange | undefined {
	if (!all.length) {
		return undefined;
	}

	if (activeId) {
		const idx = all.findIndex((comment) => comment.id === activeId);
		if (idx >= 0) {
			const prev = all[idx - 1];
			if (prev) {
				return prev;
			}
			return wrap ? all[all.length - 1] : undefined;
		}
	}

	for (let i = all.length - 1; i >= 0; i -= 1) {
		const comment = all[i];
		if (comment.to <= cursorPos) {
			return comment;
		}
	}

	return wrap ? all[all.length - 1] : undefined;
}

export function jumpToNextComment(view: EditorView, options?: NavigationOptions): boolean {
	const wrap = options?.wrap ?? true;
	const all = getAllComments(view);
	const active = getActiveComment(view);
	const target = findNextComment(all, active?.id, view.state.selection.main.head + 1, wrap);
	if (!target) {
		return false;
	}
	return scrollToComment(view, target.id);
}

export function jumpToPreviousComment(view: EditorView, options?: NavigationOptions): boolean {
	const wrap = options?.wrap ?? true;
	const all = getAllComments(view);
	const active = getActiveComment(view);
	const target = findPreviousComment(
		all,
		active?.id,
		Math.max(0, view.state.selection.main.head - 1),
		wrap,
	);
	if (!target) {
		return false;
	}
	return scrollToComment(view, target.id);
}

export const defaultCommentKeymap: readonly KeyBinding[] = [
	{
		key: "Alt-Down",
		run: (view) => jumpToNextComment(view),
		preventDefault: true,
	},
	{
		key: "Alt-Up",
		run: (view) => jumpToPreviousComment(view),
		preventDefault: true,
	},
];

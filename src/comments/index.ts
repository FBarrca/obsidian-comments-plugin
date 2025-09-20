import type { Extension } from "@codemirror/state";
import { KeyBinding, keymap } from "@codemirror/view";
import { hoverTooltip } from "@codemirror/tooltip";
import { commentField } from "./state";
import { commentInteraction } from "./interaction";
import { commentHover } from "./hover";
import { defaultCommentKeymap } from "./navigation";

export interface CommentsExtensionOptions {
	hover?: boolean;
	keymap?: false | KeyBinding[];
}

export function commentsExtension(options?: CommentsExtensionOptions): Extension {
	const extensions: Extension[] = [commentField, commentInteraction];

	if (options?.hover !== false) {
		extensions.push(hoverTooltip((view, pos, side) => commentHover(view, pos, side)));
	}

	const keymapConfig = options?.keymap === undefined ? defaultCommentKeymap : options.keymap;
	if (keymapConfig && keymapConfig.length) {
		extensions.push(keymap.of(keymapConfig));
	}

	return extensions;
}

export { CommentBadge } from "./badge";
export { commentField } from "./state";
export { commentHover } from "./hover";
export { commentInteraction } from "./interaction";
export { defaultCommentKeymap } from "./navigation";
export {
	addCommentCommand,
	addCommentFromSelection,
	removeCommentCommand,
	resolveCommentCommand,
	scrollToComment,
	setActiveCommentCommand,
	updateCommentCommand,
} from "./api";
export { getActiveComment, getAllComments, getCommentById, getCommentsAtPos } from "./selectors";
export type { CommentRange } from "./model";
export { COMMENT_CLICK_EVENT, addOrUpdateComment, removeComment, setActiveComment } from "./model";

import { Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { KeyBinding, keymap } from "@codemirror/view";
import { commentField } from "./state";
import { commentInteraction } from "./interaction";
import { defaultCommentKeymap } from "./navigation";
import { commentHighlightColorFacet, defaultCommentHighlightColor } from "./decorations";

export interface CommentsExtensionOptions {
	highlightColor?: string;
	keymap?: false | KeyBinding[];
}

export const commentHighlightColorCompartment = new Compartment();

export function commentsExtension(options?: CommentsExtensionOptions): Extension {
	const highlightColor = options?.highlightColor ?? defaultCommentHighlightColor;
	const extensions: Extension[] = [
		commentHighlightColorCompartment.of(commentHighlightColorFacet.of(highlightColor)),
		commentField,
		commentInteraction,
	];

	const keymapConfig = options?.keymap === undefined ? defaultCommentKeymap : options.keymap;
	if (keymapConfig && keymapConfig.length) {
		extensions.push(keymap.of(keymapConfig));
	}

	return extensions;
}

export { commentField } from "./state";
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
export {
	COMMENT_CLICK_EVENT,
	addOrUpdateComment,
	removeComment,
	setActiveComment,
	syncWithDatabase,
	loadFromDatabase,
} from "./model";
export { CommentDatabaseService } from "./databaseService";
export { CommentAPIWithDatabase } from "./apiWithDatabase";

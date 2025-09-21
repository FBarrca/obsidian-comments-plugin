import { App, Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";
import {
	CommentRange,
	addCommentFromSelection,
	commentsExtension,
	commentHighlightColorCompartment,
	getActiveComment,
	getAllComments,
	removeCommentCommand,
	resolveCommentCommand,
	scrollToComment,
} from "./index";
import { requestCommentText } from "./modal";
import { jumpToNextComment, jumpToPreviousComment } from "./navigation";
import type { CommentsExtensionOptions } from "./index";
import { commentsIndicator } from "./commentsGutter";
import { commentHighlightColorFacet, defaultCommentHighlightColor } from "./decorations";

function getEditorView(editor: Editor | undefined): EditorView | null {
	const cm = (editor as Editor & { cm?: EditorView })?.cm;
	return cm?.state ? cm : null;
}

export function registerCommentFeatures(plugin: Plugin, options?: CommentsExtensionOptions) {
	const highlightColor = options?.highlightColor?.trim() || defaultCommentHighlightColor;
	const extensionOptions: CommentsExtensionOptions = { ...options, highlightColor };
	console.log("registerCommentFeatures", { options: extensionOptions });
	plugin.registerEditorExtension(commentsExtension(extensionOptions));
	plugin.registerEditorExtension(commentsIndicator());
	// plugin.registerEditorExtension(lineNumbers());

	updateCommentHighlightColor(plugin, highlightColor);

	plugin.addCommand({
		id: "comments-add",
		name: "Add comment to selection",
		editorCallback: async (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-add: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			if (cm.state.selection.main.empty) {
				console.log("comments-add: empty selection");
				new Notice("Select text to comment on");
				return;
			}

			console.log("comments-add: selection", {
				from: cm.state.selection.main.from,
				to: cm.state.selection.main.to,
			});

			const text = await requestCommentText(plugin.app);
			if (text === null) {
				console.log("comments-add: cancelled by user");
				return;
			}

			addCommentFromSelection(cm, {
				id: `c_${Date.now()}`,
				text,
				author: plugin.app.workspace.getActiveFile()?.basename,
				createdAt: Date.now(),
			});
		},
	});

	plugin.addCommand({
		id: "comments-resolve",
		name: "Toggle comment resolved",
		editorCallback: (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-resolve: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			const active = getActiveComment(cm);
			if (!active) {
				console.log("comments-resolve: no active comment");
				new Notice("Place the cursor inside a comment");
				return;
			}

			console.log("comments-resolve", { id: active.id, resolved: active.resolved });
			resolveCommentCommand(cm, active.id, !active.resolved);
		},
	});

	plugin.addCommand({
		id: "comments-remove",
		name: "Remove active comment",
		editorCallback: (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-remove: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			const active = getActiveComment(cm);
			if (!active) {
				console.log("comments-remove: no active comment");
				new Notice("No comment at cursor");
				return;
			}

			console.log("comments-remove", { id: active.id });
			removeCommentCommand(cm, active.id);
		},
	});

	plugin.addCommand({
		id: "comments-next",
		name: "Jump to next comment",
		editorCallback: (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-next: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			if (!jumpToNextComment(cm)) {
				console.log("comments-next: no comments");
				new Notice("No comments in this note");
			}
		},
	});

	plugin.addCommand({
		id: "comments-previous",
		name: "Jump to previous comment",
		editorCallback: (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-previous: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			if (!jumpToPreviousComment(cm)) {
				console.log("comments-previous: no comments");
				new Notice("No comments in this note");
			}
		},
	});
}

export function updateCommentHighlightColor(plugin: Plugin, color?: string) {
	const highlightColor = color?.trim() || defaultCommentHighlightColor;
	const leaves = plugin.app.workspace.getLeavesOfType("markdown");
	for (const leaf of leaves) {
		const view = leaf.view as MarkdownView | null;
		const cm = getEditorView(view?.editor);
		if (!cm) continue;
		cm.dispatch({
			effects: commentHighlightColorCompartment.reconfigure(
				commentHighlightColorFacet.of(highlightColor),
			),
		});
	}
}

export function getAllCommentsForActiveFile(app: App): CommentRange[] {
	const markdown = app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdown) {
		console.log("getAllCommentsForActiveFile: no markdown view");
		return [];
	}

	const editorView = getEditorView(markdown.editor);
	if (!editorView) {
		console.log("getAllCommentsForActiveFile: no editor view");
		return [];
	}

	const comments = getAllComments(editorView);
	console.log("getAllCommentsForActiveFile", { count: comments.length });
	return comments;
}

export function scrollToActiveComment(app: App, id: string) {
	const markdown = app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdown) {
		console.log("scrollToActiveComment: no markdown view", { id });
		return;
	}

	const editorView = getEditorView(markdown.editor);
	if (!editorView) {
		console.log("scrollToActiveComment: no editor view", { id });
		return;
	}

	console.log("scrollToActiveComment", { id });
	scrollToComment(editorView, id);
}

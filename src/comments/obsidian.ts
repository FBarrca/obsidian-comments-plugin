import { App, Editor, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
// import { ViewPlugin } from "@codemirror/view";
import {
	CommentRange,
	commentsExtension,
	commentHighlightColorCompartment,
	getActiveComment,
	getAllComments,
	scrollToComment,
} from "./index";
import { requestCommentText } from "./modal";
import { jumpToNextComment, jumpToPreviousComment } from "./navigation";
import type { CommentsExtensionOptions } from "./index";
import { commentsIndicator } from "./commentsGutter";
import { commentHighlightColorFacet, defaultCommentHighlightColor } from "./decorations";
import { CommentDatabaseService } from "./databaseService";
import { CommentAPIWithDatabase } from "./apiWithDatabase";
// import { loadFromDatabase, syncWithDatabase, setDatabaseAPI } from "./model";
import { setGlobalDatabaseAPI } from "./threadBubble";

function getEditorView(editor: Editor | undefined): EditorView | null {
	const cm = (editor as Editor & { cm?: EditorView })?.cm;
	return cm?.state ? cm : null;
}

export async function registerCommentFeatures(plugin: Plugin, options?: CommentsExtensionOptions) {
	const highlightColor = options?.highlightColor?.trim() || defaultCommentHighlightColor;
	const extensionOptions: CommentsExtensionOptions = { ...options, highlightColor };
	console.log("registerCommentFeatures", { options: extensionOptions });

	// Initialize database service
	const dbService = new CommentDatabaseService(plugin.app);
	await dbService.initialize();
	const commentAPI = new CommentAPIWithDatabase(dbService);

	// Set global references for thread UI helpers
	setGlobalDatabaseAPI(commentAPI);

	plugin.registerEditorExtension(commentsExtension(extensionOptions));
	plugin.registerEditorExtension(commentsIndicator());
	// plugin.registerEditorExtension(lineNumbers());

	updateCommentHighlightColor(plugin, highlightColor);

	// Register file change listeners for database sync
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", async (file) => {
			if (file && file.extension === "md") {
				await loadCommentsForFile(plugin.app, file, commentAPI);
			}
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", async (leaf) => {
			if (leaf && leaf.view instanceof MarkdownView) {
				const file = leaf.view.file;
				if (file && file.extension === "md") {
					await saveCommentsForFile(plugin.app, file, commentAPI);
				}
			}
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("editor-change", async (editor, info) => {
			const file = plugin.app.workspace.getActiveFile();
			if (file && file.extension === "md") {
				await syncCommentsForFile(plugin.app, file, commentAPI);
			}
		}),
	);

	// Database management commands
	plugin.addCommand({
		id: "comments-db-stats",
		name: "Show comment database statistics",
		callback: async () => {
			try {
				const stats = await dbService.getStats();
				new Notice(
					`Total comments: ${stats.totalComments}. Files with comments: ${Object.keys(stats.commentsByFile).length}`,
				);
				console.log("Comment database statistics:", stats);
			} catch (error) {
				console.error("Failed to get database statistics:", error);
				new Notice("Failed to get database statistics");
			}
		},
	});

	plugin.addCommand({
		id: "comments-export",
		name: "Export comments to JSON",
		callback: async () => {
			try {
				const jsonData = await dbService.exportComments();
				const blob = new Blob([jsonData], { type: "application/json" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "comments-export.json";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				new Notice("Comments exported successfully");
			} catch (error) {
				console.error("Failed to export comments:", error);
				new Notice("Failed to export comments");
			}
		},
	});

	plugin.addCommand({
		id: "comments-cleanup-db",
		name: "Clean up comment database",
		callback: () => {
			dbService.close();
			new Notice("Comment database closed");
		},
	});

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

			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				console.log("comments-add: no active file");
				new Notice("No active file");
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

			commentAPI.setCurrentFile(file);
			await commentAPI.addCommentFromSelection(cm, {
				id: `c_${Date.now()}`,
				text,
				author: file.basename,
				createdAt: Date.now(),
			});
		},
	});

	plugin.addCommand({
		id: "comments-resolve",
		name: "Toggle comment resolved",
		editorCallback: async (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-resolve: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				console.log("comments-resolve: no active file");
				new Notice("No active file");
				return;
			}

			const active = getActiveComment(cm);
			if (!active) {
				console.log("comments-resolve: no active comment");
				new Notice("Place the cursor inside a comment");
				return;
			}

			console.log("comments-resolve", { id: active.id, resolved: active.resolved });
			commentAPI.setCurrentFile(file);
			await commentAPI.resolveCommentCommand(cm, active.id, !active.resolved);
		},
	});

	plugin.addCommand({
		id: "comments-remove",
		name: "Remove active comment",
		editorCallback: async (editor) => {
			const cm = getEditorView(editor);
			if (!cm) {
				console.log("comments-remove: no editor view");
				new Notice("Unable to access editor");
				return;
			}

			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				console.log("comments-remove: no active file");
				new Notice("No active file");
				return;
			}

			const active = getActiveComment(cm);
			if (!active) {
				console.log("comments-remove: no active comment");
				new Notice("No comment at cursor");
				return;
			}

			console.log("comments-remove", { id: active.id });
			commentAPI.setCurrentFile(file);
			await commentAPI.removeCommentCommand(cm, active.id);
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

/**
 * Load comments from database for a file
 */
async function loadCommentsForFile(app: App, file: TFile, commentAPI: CommentAPIWithDatabase) {
	try {
		const markdown = app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdown || markdown.file !== file) {
			return;
		}

		const editorView = getEditorView(markdown.editor);
		if (!editorView) {
			return;
		}

		commentAPI.setCurrentFile(file);
		await commentAPI.loadCommentsFromDatabase(editorView);
	} catch (error) {
		console.error("Failed to load comments for file:", error);
	}
}

/**
 * Save comments to database for a file
 */
async function saveCommentsForFile(app: App, file: TFile, commentAPI: CommentAPIWithDatabase) {
	try {
		const markdown = app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdown || markdown.file !== file) {
			return;
		}

		const editorView = getEditorView(markdown.editor);
		if (!editorView) {
			return;
		}

		commentAPI.setCurrentFile(file);
		await commentAPI.syncWithDatabase(editorView);
	} catch (error) {
		console.error("Failed to save comments for file:", error);
	}
}

/**
 * Sync comments with database for a file
 */
async function syncCommentsForFile(app: App, file: TFile, commentAPI: CommentAPIWithDatabase) {
	try {
		const markdown = app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdown || markdown.file !== file) {
			return;
		}

		const editorView = getEditorView(markdown.editor);
		if (!editorView) {
			return;
		}

		commentAPI.setCurrentFile(file);
		await commentAPI.syncWithDatabase(editorView);
	} catch (error) {
		console.error("Failed to sync comments for file:", error);
	}
}

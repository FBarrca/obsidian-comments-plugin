import { EditorView } from "@codemirror/view";
import { CommentRange, addOrUpdateComment, removeComment, setActiveComment } from "./model";
import { getCommentById, getAllComments } from "./selectors";
import { CommentDatabaseService } from "./databaseService";
import { TFile } from "obsidian";

export class CommentAPIWithDatabase {
	private dbService: CommentDatabaseService;
	private currentFile: TFile | null = null;

	constructor(dbService: CommentDatabaseService) {
		this.dbService = dbService;
	}

	/**
	 * Set the current file for comment operations
	 */
	setCurrentFile(file: TFile | null) {
		this.currentFile = file;
	}

	/**
	 * Get the current file
	 */
	getCurrentFile(): TFile | null {
		return this.currentFile;
	}

	/**
	 * Add a comment with database persistence
	 */
	async addCommentCommand(view: EditorView, comment: CommentRange): Promise<boolean> {
		if (!this.currentFile) {
			console.error("addCommentCommand: No current file set");
			return false;
		}

		console.log("addCommentCommand", { id: comment.id, from: comment.from, to: comment.to });

		// Update the editor state
		view.dispatch({ effects: addOrUpdateComment.of(comment) });

		// Persist to database
		try {
			await this.dbService.upsertComment(comment, this.currentFile);
			console.log("Comment saved to database:", comment.id);
		} catch (error) {
			console.error("Failed to save comment to database:", error);
		}

		return true;
	}

	/**
	 * Update a comment with database persistence
	 */
	async updateCommentCommand(
		view: EditorView,
		id: string,
		patch: Partial<Omit<CommentRange, "id">>,
	): Promise<boolean> {
		if (!this.currentFile) {
			console.error("updateCommentCommand: No current file set");
			return false;
		}

		const current = getCommentById(view, id);
		if (!current) {
			console.log("updateCommentCommand: missing comment", { id });
			return false;
		}

		const next: CommentRange = { ...current, ...patch, id };
		console.log("updateCommentCommand", { id, patch });

		// Update the editor state
		view.dispatch({ effects: addOrUpdateComment.of(next) });

		// Persist to database
		try {
			await this.dbService.upsertComment(next, this.currentFile);
			console.log("Comment updated in database:", id);
		} catch (error) {
			console.error("Failed to update comment in database:", error);
		}

		return true;
	}

	/**
	 * Resolve a comment with database persistence
	 */
	async resolveCommentCommand(view: EditorView, id: string, resolved = true): Promise<boolean> {
		console.log("resolveCommentCommand", { id, resolved });
		return this.updateCommentCommand(view, id, { resolved });
	}

	/**
	 * Remove a comment with database persistence
	 */
	async removeCommentCommand(view: EditorView, id: string): Promise<boolean> {
		if (!this.currentFile) {
			console.error("removeCommentCommand: No current file set");
			return false;
		}

		if (!getCommentById(view, id)) {
			console.log("removeCommentCommand: missing comment", { id });
			return false;
		}

		console.log("removeCommentCommand", { id });

		// Update the editor state
		view.dispatch({ effects: removeComment.of({ id }) });

		// Remove from database
		try {
			const removed = await this.dbService.removeComment(id);
			if (removed) {
				console.log("Comment removed from database:", id);
			} else {
				console.warn("Comment not found in database:", id);
			}
		} catch (error) {
			console.error("Failed to remove comment from database:", error);
		}

		return true;
	}

	/**
	 * Set active comment (no database persistence needed)
	 */
	setActiveCommentCommand(view: EditorView, id: string | null): boolean {
		console.log("setActiveCommentCommand", { id });
		view.dispatch({ effects: setActiveComment.of({ id }) });
		return true;
	}

	/**
	 * Scroll to a comment
	 */
	scrollToComment(view: EditorView, id: string): boolean {
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

	/**
	 * Add comment from selection with database persistence
	 */
	async addCommentFromSelection(
		view: EditorView,
		data: Omit<CommentRange, "from" | "to">,
	): Promise<string> {
		if (!this.currentFile) {
			throw new Error("No current file set");
		}

		const selection = view.state.selection.main;
		const id = data.id || cryptoRandomId();
		console.log("addCommentFromSelection", {
			id,
			anchor: selection.from,
			head: selection.to,
			provided: { ...data },
		});

		const comment: CommentRange = { ...data, id, from: selection.from, to: selection.to };
		await this.addCommentCommand(view, comment);
		return id;
	}

	/**
	 * Load comments from database for the current file
	 */
	async loadCommentsFromDatabase(view: EditorView): Promise<void> {
		if (!this.currentFile) {
			console.warn("loadCommentsFromDatabase: No current file set");
			return;
		}

		console.log("loadCommentsFromDatabase called for file:", this.currentFile.path);

		try {
			const comments = await this.dbService.initializeCommentsForFile(this.currentFile);
			console.log("Retrieved comments from database:", comments.length);

			// Clear existing comments in the editor
			const allComments = getAllComments(view);
			console.log("Clearing existing comments:", allComments.length);
			for (const comment of allComments) {
				view.dispatch({ effects: removeComment.of({ id: comment.id }) });
			}

			// Add comments from database
			for (const comment of comments) {
				console.log("Adding comment to editor:", comment.id);
				view.dispatch({ effects: addOrUpdateComment.of(comment) });
			}

			console.log(
				`Loaded ${comments.length} comments from database for file: ${this.currentFile.path}`,
			);
		} catch (error) {
			console.error("Failed to load comments from database:", error);
		}
	}

	/**
	 * Sync current editor state with database
	 */
	async syncWithDatabase(view: EditorView): Promise<void> {
		if (!this.currentFile) {
			console.warn("syncWithDatabase: No current file set");
			return;
		}

		try {
			const comments = getAllComments(view);
			await this.dbService.syncCommentState(this.currentFile, comments);
		} catch (error) {
			console.error("Failed to sync with database:", error);
		}
	}

	/**
	 * Update comment positions when document changes
	 */
	async updateCommentPositions(
		view: EditorView,
		positionUpdates: Array<{ id: string; from: number; to: number }>,
	): Promise<void> {
		if (!this.currentFile) {
			console.warn("updateCommentPositions: No current file set");
			return;
		}

		try {
			await this.dbService.updateCommentPositions(this.currentFile, positionUpdates);
		} catch (error) {
			console.error("Failed to update comment positions in database:", error);
		}
	}
}

function cryptoRandomId() {
	return `c_${Math.random().toString(36).slice(2, 9)}`;
}

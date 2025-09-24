import { App, TFile } from "obsidian";
import { CommentFileStorage } from "./fileStorage";
import { CommentRange } from "./model";

export class CommentDatabaseService {
	private storage: CommentFileStorage;
	private app: App;

	constructor(app: App) {
		this.app = app;
		this.storage = new CommentFileStorage(app);
	}

	/**
	 * Initialize the database service
	 */
	async initialize(): Promise<void> {
		try {
			console.log("CommentDatabaseService initialized with file storage");
		} catch (error) {
			console.error("Failed to initialize CommentDatabaseService:", error);
			throw error;
		}
	}

	/**
	 * Get all comments for a file
	 */
	async getCommentsForFile(file: TFile): Promise<CommentRange[]> {
		try {
			return await this.storage.getCommentsForFile(file);
		} catch (error) {
			console.error(`Failed to get comments for file ${file.path}:`, error);
			return [];
		}
	}

	/**
	 * Get a specific comment by ID
	 */
	async getCommentById(id: string): Promise<CommentRange | null> {
		return await this.storage.getCommentById(id);
	}

	/**
	 * Add or update a comment
	 */
	async upsertComment(comment: CommentRange, file: TFile): Promise<void> {
		try {
			await this.storage.upsertComment(comment, file);
		} catch (error) {
			console.error(`Failed to upsert comment ${comment.id} for file ${file.path}:`, error);
			throw error;
		}
	}

	/**
	 * Remove a comment
	 */
	async removeComment(id: string): Promise<boolean> {
		return await this.storage.removeComment(id);
	}

	/**
	 * Update comment positions when document changes
	 */
	async updateCommentPositions(
		file: TFile,
		positionUpdates: Array<{ id: string; from: number; to: number }>,
	): Promise<void> {
		await this.storage.updateCommentPositions(file, positionUpdates);
	}

	/**
	 * Remove all comments for a file
	 */
	async removeCommentsForFile(file: TFile): Promise<number> {
		return await this.storage.removeCommentsForFile(file);
	}

	/**
	 * Get all comments across all files
	 */
	async getAllComments(): Promise<CommentRange[]> {
		return await this.storage.getAllComments();
	}

	/**
	 * Get database statistics
	 */
	async getStats(): Promise<{ totalComments: number; commentsByFile: Record<string, number> }> {
		return await this.storage.getStats();
	}

	/**
	 * Export comments as JSON
	 */
	async exportComments(): Promise<string> {
		return await this.storage.exportComments();
	}

	/**
	 * Import comments from JSON
	 */
	async importComments(jsonData: string): Promise<void> {
		await this.storage.importComments(jsonData);
	}

	/**
	 * Close the database connection (no-op for file storage)
	 */
	close(): void {
		// File storage doesn't need explicit closing
		console.log("CommentDatabaseService closed");
	}

	/**
	 * Initialize comments for a file from the database
	 * This should be called when a file is opened
	 */
	async initializeCommentsForFile(file: TFile): Promise<CommentRange[]> {
		try {
			const comments = await this.getCommentsForFile(file);
			console.log(`Loaded ${comments.length} comments for file: ${file.path}`);
			return comments;
		} catch (error) {
			console.error(`Failed to load comments for file ${file.path}:`, error);
			return [];
		}
	}

	/**
	 * Sync comment state with database after changes
	 * This should be called after any comment operations
	 */
	async syncCommentState(file: TFile, comments: CommentRange[]): Promise<void> {
		try {
			// Get current comments from database
			const dbComments = await this.getCommentsForFile(file);
			const _dbCommentIds = new Set(dbComments.map((c) => c.id));
			const currentCommentIds = new Set(comments.map((c) => c.id));

			// Only remove comments if we have comments in the editor
			// This prevents clearing the database when editor is empty during initial load
			if (comments.length > 0) {
				// Remove comments that no longer exist
				for (const dbComment of dbComments) {
					if (!currentCommentIds.has(dbComment.id)) {
						await this.removeComment(dbComment.id);
					}
				}
			}

			// Add or update current comments
			for (const comment of comments) {
				await this.upsertComment(comment, file);
			}

			console.log(`Synced ${comments.length} comments for file: ${file.path}`);
		} catch (error) {
			console.error(`Failed to sync comments for file ${file.path}:`, error);
		}
	}
}

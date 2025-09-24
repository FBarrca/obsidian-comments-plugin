import { App, TFile } from "obsidian";
import { CommentRange } from "./model";

export interface CommentRecord {
	id: string;
	file_path: string;
	from: number;
	to: number;
	text?: string;
	author?: string;
	created_at: string;
	updated_at: string;
	resolved: boolean;
}

export class CommentFileStorage {
	private app: App;
	private storagePath: string;

	constructor(app: App) {
		this.app = app;
		this.storagePath = ".obsidian/plugins/obsidian-comments-plugin/comments.json";
	}

	/**
	 * Get the relative path for a file
	 */
	private getRelativePath(file: TFile | string): string {
		const filePath = typeof file === "string" ? file : file.path;
		return filePath;
	}

	/**
	 * Load all comments from storage
	 */
	private async loadComments(): Promise<CommentRecord[]> {
		try {
			console.log("loadComments: Looking for file at path:", this.storagePath);
			const file = this.app.vault.getAbstractFileByPath(this.storagePath);
			if (!file) {
				console.log("loadComments: File not found in vault, trying direct read");
				// Try reading directly using the adapter
				const content = await this.app.vault.adapter.read(this.storagePath);
				console.log(
					"loadComments: Direct read successful, content length:",
					content.length,
				);
				return JSON.parse(content);
			}
			const content = await this.app.vault.read(file as TFile);
			console.log("loadComments: Vault read successful, content length:", content.length);
			return JSON.parse(content);
		} catch (error) {
			console.error("Failed to load comments from storage:", error);
			return [];
		}
	}

	/**
	 * Save all comments to storage
	 */
	private async saveComments(comments: CommentRecord[]): Promise<void> {
		try {
			const content = JSON.stringify(comments, null, 2);
			await this.app.vault.adapter.write(this.storagePath, content);
		} catch (error) {
			console.error("Failed to save comments to storage:", error);
			throw error;
		}
	}

	/**
	 * Convert CommentRecord to CommentRange
	 */
	private recordToComment(record: CommentRecord): CommentRange {
		return {
			id: record.id,
			from: record.from,
			to: record.to,
			text: record.text,
			author: record.author,
			createdAt: record.created_at,
			resolved: record.resolved,
		};
	}

	/**
	 * Convert CommentRange to CommentRecord
	 */
	private commentToRecord(comment: CommentRange, filePath: string): CommentRecord {
		const now = new Date().toISOString();
		let createdAt: string;
		if (comment.createdAt) {
			if (typeof comment.createdAt === "string") {
				createdAt = comment.createdAt;
			} else if (comment.createdAt instanceof Date) {
				createdAt = comment.createdAt.toISOString();
			} else {
				// Handle number timestamp
				createdAt = new Date(comment.createdAt).toISOString();
			}
		} else {
			createdAt = now;
		}

		return {
			id: comment.id,
			file_path: this.getRelativePath(filePath),
			from: comment.from,
			to: comment.to,
			text: comment.text,
			author: comment.author,
			created_at: createdAt,
			updated_at: now,
			resolved: comment.resolved || false,
		};
	}

	/**
	 * Get all comments for a specific file
	 */
	async getCommentsForFile(file: TFile | string): Promise<CommentRange[]> {
		const comments = await this.loadComments();
		const relativePath = this.getRelativePath(file);
		console.log("getCommentsForFile:", {
			filePath: typeof file === "string" ? file : file.path,
			relativePath,
			totalComments: comments.length,
		});

		const filteredComments = comments.filter((comment) => comment.file_path === relativePath);
		console.log("Filtered comments:", filteredComments.length);

		return filteredComments
			.map((comment) => this.recordToComment(comment))
			.sort((a, b) => a.from - b.from || a.to - b.to);
	}

	/**
	 * Get a specific comment by ID
	 */
	async getCommentById(id: string): Promise<CommentRange | null> {
		const comments = await this.loadComments();
		const comment = comments.find((c) => c.id === id);
		return comment ? this.recordToComment(comment) : null;
	}

	/**
	 * Add or update a comment
	 */
	async upsertComment(comment: CommentRange, file: TFile | string): Promise<void> {
		const comments = await this.loadComments();
		const filePath = typeof file === "string" ? file : file.path;
		const record = this.commentToRecord(comment, filePath);

		// Remove existing comment with same ID
		const filteredComments = comments.filter((c) => c.id !== comment.id);
		// Add the new/updated comment
		filteredComments.push(record);

		await this.saveComments(filteredComments);
	}

	/**
	 * Remove a comment by ID
	 */
	async removeComment(id: string): Promise<boolean> {
		const comments = await this.loadComments();
		const filteredComments = comments.filter((c) => c.id !== id);

		if (filteredComments.length < comments.length) {
			await this.saveComments(filteredComments);
			return true;
		}
		return false;
	}

	/**
	 * Update comment positions when document changes
	 */
	async updateCommentPositions(
		file: TFile | string,
		positionUpdates: Array<{ id: string; from: number; to: number }>,
	): Promise<void> {
		const comments = await this.loadComments();
		const relativePath = this.getRelativePath(file);
		const now = new Date().toISOString();

		for (const comment of comments) {
			if (comment.file_path === relativePath) {
				const update = positionUpdates.find((u) => u.id === comment.id);
				if (update) {
					comment.from = update.from;
					comment.to = update.to;
					comment.updated_at = now;
				}
			}
		}

		await this.saveComments(comments);
	}

	/**
	 * Remove all comments for a file
	 */
	async removeCommentsForFile(file: TFile | string): Promise<number> {
		const comments = await this.loadComments();
		const relativePath = this.getRelativePath(file);
		const filteredComments = comments.filter((c) => c.file_path !== relativePath);
		const removedCount = comments.length - filteredComments.length;

		await this.saveComments(filteredComments);
		return removedCount;
	}

	/**
	 * Get all comments across all files
	 */
	async getAllComments(): Promise<CommentRange[]> {
		const comments = await this.loadComments();
		return comments
			.map((comment) => this.recordToComment(comment))
			.sort((a, b) => a.from - b.from || a.to - b.to);
	}

	/**
	 * Get database statistics
	 */
	async getStats(): Promise<{ totalComments: number; commentsByFile: Record<string, number> }> {
		const comments = await this.loadComments();
		const commentsByFile: Record<string, number> = {};

		for (const comment of comments) {
			commentsByFile[comment.file_path] = (commentsByFile[comment.file_path] || 0) + 1;
		}

		return {
			totalComments: comments.length,
			commentsByFile,
		};
	}

	/**
	 * Export comments as JSON
	 */
	async exportComments(): Promise<string> {
		const comments = await this.loadComments();
		return JSON.stringify(comments, null, 2);
	}

	/**
	 * Import comments from JSON
	 */
	async importComments(jsonData: string): Promise<void> {
		try {
			const comments = JSON.parse(jsonData);
			await this.saveComments(comments);
		} catch (error) {
			console.error("Failed to import comments:", error);
			throw error;
		}
	}
}

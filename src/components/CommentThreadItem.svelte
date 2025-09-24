<script lang="ts">
	import type { CommentRange } from "../types/comment";

	interface Props {
		comment: CommentRange;
		onResolve?: (commentId: string) => void;
		onDelete?: (commentId: string) => void;
		onEdit?: (commentId: string) => void;
		databaseAPI?: any; // CommentAPIWithDatabase
		editorView?: any; // EditorView from CodeMirror
		onClose?: () => void;
	}

	let { comment, onResolve, onDelete, onEdit, databaseAPI, editorView, onClose }: Props =
		$props();

	function formatTimestamp(value: CommentRange["createdAt"]): string | null {
		if (value === undefined || value === null) return null;
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	let timestamp = $derived(formatTimestamp(comment.createdAt));

	function handleResolve() {
		onResolve?.(comment.id);
	}

	async function handleDelete() {
		if (databaseAPI && editorView) {
			try {
				// Use the database API to delete the comment
				await databaseAPI.removeCommentCommand(editorView, comment.id);
				console.log("Comment deleted successfully:", comment.id);

				// Close the thread after successful deletion
				onClose?.();
			} catch (error) {
				console.error("Failed to delete comment:", error);
				// Fallback to the callback on error
				onDelete?.(comment.id);
			}
		} else {
			// Fallback to the callback if no database API or editor view available
			onDelete?.(comment.id);
		}
	}

	function handleEdit() {
		onEdit?.(comment.id);
	}
</script>

<div
	class="cm-commentIndicator-item comment-bubble"
	data-comment-id={comment.id}
	data-comment-resolved={comment.resolved ? "true" : undefined}
>
	<div class="comment-header">
		<div class="comment-info">
			{#if timestamp}
				<span class="comment-timestamp">{timestamp}</span>
			{/if}

			{#if comment.resolved}
				<span class="comment-resolved-badge">Resolved</span>
			{/if}
		</div>

		<div class="comment-actions">
			{#if !comment.resolved}
				<button
					class="action-btn resolve-btn"
					onclick={handleResolve}
					title="Resolve comment"
					aria-label="Resolve comment"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M20 6L9 17l-5-5" />
					</svg>
				</button>
			{/if}

			<button
				class="action-btn edit-btn"
				onclick={handleEdit}
				title="Edit comment"
				aria-label="Edit comment"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
					<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
				</svg>
			</button>

			<button
				class="action-btn delete-btn"
				onclick={handleDelete}
				title="Delete comment"
				aria-label="Delete comment"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<polyline points="3,6 5,6 21,6" />
					<path
						d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"
					/>
					<line x1="10" y1="11" x2="10" y2="17" />
					<line x1="14" y1="11" x2="14" y2="17" />
				</svg>
			</button>
		</div>
	</div>

	<div class="comment-content">
		<p class="comment-text">
			{comment.text?.trim() ?? "(No comment text)"}
		</p>
	</div>
</div>

<style>
	.cm-commentIndicator-item {
		position: relative;
		padding: 0.75rem 0.75rem;
		margin-bottom: 0.5rem;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		transition: all 0.2s ease;
	}

	.cm-commentIndicator-item:last-child {
		margin-bottom: 0;
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		gap: 1rem;
	}

	.comment-info {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.comment-timestamp {
		color: var(--text-muted);
		font-size: 0.75rem;
		line-height: 1.2;
	}

	.comment-resolved-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: var(--interactive-success);
		color: var(--text-on-accent);
		border-radius: 12px;
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.comment-actions {
		display: flex;
		gap: 0.25rem;
		opacity: 1;
		flex-shrink: 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: var(--background-secondary);
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
	}

	.action-btn:hover {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.action-btn:active {
		opacity: 0.8;
	}

	.resolve-btn:hover {
		background: var(--interactive-success);
		color: var(--text-on-accent);
	}

	.edit-btn:hover {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.delete-btn:hover {
		background: var(--text-error);
		color: var(--text-on-accent);
	}

	.comment-content {
		margin-top: 0.5rem;
	}

	.comment-text {
		margin: 0;
		color: var(--text-normal);
		line-height: 1.5;
		font-size: 0.9rem;
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	/* Resolved state styling */
	[data-comment-resolved="true"] {
		opacity: 0.8;
		background: var(--background-secondary);
		border-color: var(--interactive-success);
	}

	[data-comment-resolved="true"] .comment-text {
		text-decoration: line-through;
		color: var(--text-muted);
	}

	[data-comment-resolved="true"] .comment-actions {
		opacity: 0.8;
	}

	/* Focus states for accessibility */
	.action-btn:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	/* Responsive design */
	@media (max-width: 480px) {
		.cm-commentIndicator-item {
			padding: 0.75rem;
		}

		.comment-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.comment-actions {
			align-self: flex-end;
		}

		.action-btn {
			width: 32px;
			height: 32px;
		}
	}
</style>

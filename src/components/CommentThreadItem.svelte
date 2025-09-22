<script lang="ts">
	import type { CommentRange } from "../types/comment";

	interface Props {
		comment: CommentRange;
	}

	let { comment }: Props = $props();

	function formatTimestamp(value: CommentRange["createdAt"]): string | null {
		if (value === undefined || value === null) return null;
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	let timestamp = $derived(formatTimestamp(comment.createdAt));
</script>

<div
	class="cm-commentIndicator-item comment-bubble"
	data-comment-id={comment.id}
	data-comment-resolved={comment.resolved ? "true" : undefined}
>
	<div class="comment-header">
		<span class="comment-author">
			{comment.author?.trim() ?? "Comment"}
		</span>

		{#if timestamp}
			<span class="comment-timestamp">{timestamp}</span>
		{/if}

		{#if comment.resolved}
			<span class="comment-timestamp">Resolved</span>
		{/if}
	</div>

	<p class="comment-text">
		{comment.text?.trim() ?? "(No comment text)"}
	</p>
</div>

<style>
	.cm-commentIndicator-item {
		padding: 0.75rem;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.cm-commentIndicator-item:last-child {
		border-bottom: none;
	}

	.comment-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}

	.comment-author {
		font-weight: 600;
		color: var(--text-normal);
	}

	.comment-timestamp {
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.comment-text {
		margin: 0;
		color: var(--text-normal);
		line-height: 1.4;
		font-size: 0.9rem;
	}

	[data-comment-resolved="true"] {
		opacity: 0.7;
	}

	[data-comment-resolved="true"] .comment-text {
		text-decoration: line-through;
	}
</style>

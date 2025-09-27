<script lang="ts">
	import type { CommentRange } from "../types/comment";
	import CommentReplies from "./CommentReplies.svelte";

	interface Props {
		comment: CommentRange;
		onResolve?: (
			commentId: string,
			resolved?: boolean,
		) => Promise<boolean | void> | boolean | void;
		onDelete?: (commentId: string) => void;
		onEdit?: (commentId: string, nextText: string) => Promise<boolean | void> | boolean | void;
		onReply?: (
			commentId: string,
			replyText: string,
		) => Promise<boolean | void> | boolean | void;
		onEditReply?: (
			commentId: string,
			replyId: string,
			newText: string,
		) => Promise<boolean | void> | boolean | void;
		onDeleteReply?: (commentId: string, replyId: string) => void;
		databaseAPI?: any; // CommentAPIWithDatabase
		editorView?: any; // EditorView from CodeMirror
		onClose?: () => void;
	}

	let {
		comment,
		onResolve,
		onDelete,
		onEdit,
		onReply,
		onEditReply,
		onDeleteReply,
		databaseAPI,
		editorView,
		onClose,
	}: Props = $props();

	function formatTimestamp(value: CommentRange["createdAt"]): string | null {
		if (value === undefined || value === null) return null;
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	let timestamp = $derived(formatTimestamp(comment.createdAt));
	let isEditing = $state(false);
	let draftText = $state(comment.text ?? "");
	let isSaving = $state(false);
	let isResolving = $state(false);
	let errorMessage = $state<string | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let renderedText = $state(comment.text ?? "");
	let lastCommentText = $state(comment.text ?? "");

	let displayText = $derived(() => {
		const text = renderedText.trim();
		return text.length ? text : "(No comment text)";
	});

	let canEdit = $derived(
		Boolean(onEdit) || Boolean(databaseAPI?.updateCommentCommand && editorView),
	);
	let trimmedDraft = $derived(draftText.trim());
	let currentText = $derived((comment.text ?? "").trim());
	let hasChanges = $derived(trimmedDraft !== currentText);
	let canSave = $derived(canEdit && !isSaving && hasChanges && trimmedDraft.length > 0);

	$effect(() => {
		const propText = comment.text ?? "";
		if (propText !== lastCommentText) {
			lastCommentText = propText;
			renderedText = propText;
		}
	});

	$effect(() => {
		if (!isEditing) {
			draftText = renderedText;
		}
	});

	async function updateResolvedState(nextResolved: boolean) {
		if (!onResolve || isResolving) {
			return;
		}
		isResolving = true;
		try {
			await onResolve(comment.id, nextResolved);
		} catch (error) {
			const message = nextResolved
				? "Failed to resolve comment:"
				: "Failed to unresolve comment:";
			console.error(message, error);
		} finally {
			isResolving = false;
		}
	}

	async function handleResolve() {
		await updateResolvedState(true);
	}

	async function handleUnresolve() {
		await updateResolvedState(false);
	}

	async function handleDelete() {
		if (databaseAPI && editorView) {
			try {
				await databaseAPI.removeCommentCommand(editorView, comment.id);
				console.log("Comment deleted successfully:", comment.id);
				onClose?.();
			} catch (error) {
				console.error("Failed to delete comment:", error);
				onDelete?.(comment.id);
			}
		} else {
			onDelete?.(comment.id);
		}
	}

	function focusTextarea() {
		queueMicrotask(() => {
			if (textareaEl) {
				textareaEl.focus();
				const length = textareaEl.value.length;
				textareaEl.setSelectionRange(length, length);
			}
		});
	}

	function handleEdit() {
		if (!canEdit) {
			return;
		}

		errorMessage = null;
		isEditing = true;
		draftText = comment.text ?? "";
		focusTextarea();
	}

	function handleCancel() {
		isEditing = false;
		errorMessage = null;
		draftText = comment.text ?? "";
	}

	async function handleSave() {
		if (!trimmedDraft.length) {
			errorMessage = "Comment cannot be empty.";
			return;
		}

		if (!hasChanges) {
			isEditing = false;
			errorMessage = null;
			return;
		}

		if (!canEdit) {
			errorMessage = "Editing is not available.";
			return;
		}

		isSaving = true;
		errorMessage = null;

		try {
			let updateSucceeded = false;

			if (onEdit) {
				const result = await onEdit(comment.id, trimmedDraft);
				updateSucceeded = result !== false;
			} else if (databaseAPI?.updateCommentCommand && editorView) {
				updateSucceeded = await databaseAPI.updateCommentCommand(editorView, comment.id, {
					text: trimmedDraft,
				});
			}

			if (!updateSucceeded) {
				errorMessage = "Failed to update comment.";
				return;
			}

			isEditing = false;
			draftText = trimmedDraft;
			renderedText = trimmedDraft;
		} catch (error) {
			console.error("Failed to update comment:", error);
			errorMessage = "Failed to update comment.";
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSave();
		} else if (event.key === "Escape") {
			event.preventDefault();
			handleCancel();
		}
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
			{#if comment.resolved}
				<button
					class="action-btn unresolve-btn"
					onclick={handleUnresolve}
					title="Mark as unresolved"
					aria-label="Mark as unresolved"
					disabled={isResolving}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			{:else}
				<button
					class="action-btn resolve-btn"
					onclick={handleResolve}
					title="Resolve comment"
					aria-label="Resolve comment"
					disabled={isResolving}
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
				disabled={!canEdit}
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
		{#if isEditing}
			<div class="comment-edit">
				<textarea
					bind:this={textareaEl}
					bind:value={draftText}
					class="comment-textarea"
					rows={Math.min(8, Math.max(3, draftText.split("\n").length + 1))}
					placeholder="Update comment"
					onkeydown={handleKeydown}
					disabled={isSaving}
				></textarea>

				{#if errorMessage}
					<p class="edit-error">{errorMessage}</p>
				{/if}

				<div class="edit-actions">
					<button
						class="edit-action-btn save-btn"
						onclick={() => void handleSave()}
						disabled={!canSave}
					>
						Save
					</button>
					<button
						class="edit-action-btn cancel-btn"
						onclick={handleCancel}
						disabled={isSaving}
					>
						Cancel
					</button>
				</div>
			</div>
		{:else}
			<p class="comment-text">
				{displayText()}
			</p>
		{/if}
	</div>

	<CommentReplies
		replies={comment.replies}
		{onReply}
		{onEditReply}
		{onDeleteReply}
		{databaseAPI}
		{editorView}
		commentId={comment.id}
	/>
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

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.resolve-btn:hover {
		background: var(--interactive-success);
		color: var(--text-on-accent);
	}

	.unresolve-btn:hover {
		background: var(--background-modifier-error);
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
		white-space: pre-wrap;
	}

	.comment-edit {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.comment-textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		background: var(--background-secondary);
		color: var(--text-normal);
		font-size: 0.9rem;
		line-height: 1.4;
		resize: vertical;
		font-family: inherit;
	}

	.comment-textarea:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.edit-error {
		margin: 0;
		color: var(--text-error);
		font-size: 0.8rem;
	}

	.edit-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

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

	.action-btn:focus-visible,
	.edit-action-btn:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

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
	}

	.comment-bubble {
		padding: 12px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		box-shadow: 0 4px 12px var(--shadow-s);
		color: var(--text-normal);
		white-space: normal;
		flex: 0 0 auto;
		width: 100%;
	}
</style>

<script lang="ts">
	import type { CommentReply } from "../types/comment";

	interface Props {
		replies?: CommentReply[];
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
		commentId: string;
	}

	let {
		replies: initialReplies = [],
		onReply,
		onEditReply,
		onDeleteReply,
		databaseAPI,
		editorView,
		commentId,
	}: Props = $props();

	let localReplies = $state<CommentReply[]>([...initialReplies]);
	let lastRepliesVersion = $state(0);

	let isReplying = $state(false);
	let replyDraft = $state("");
	let replyError = $state<string | null>(null);
	let isSubmittingReply = $state(false);
	let replyTextareaEl = $state<HTMLTextAreaElement | null>(null);
	let editingReplyId = $state<string | null>(null);
	let editingReplyText = $state("");
	let editingReplyError = $state<string | null>(null);

	let canReply = $derived(
		Boolean(onReply) || Boolean(databaseAPI?.addReplyToComment && editorView),
	);
	let trimmedReplyDraft = $derived(replyDraft.trim());
	let canSubmitReply = $derived(canReply && !isSubmittingReply && trimmedReplyDraft.length > 0);

	// Sync local replies with prop changes
	$effect(() => {
		const propReplies = initialReplies ?? [];
		// Use a simple length check as a basic version indicator
		// In a real app, you might use a more sophisticated versioning strategy
		const currentVersion =
			propReplies.length +
			(propReplies.length > 0
				? propReplies.reduce((sum, reply) => {
						const updatedAtTime = reply.updatedAt
							? new Date(reply.updatedAt).getTime()
							: 0;
						const createdAtTime = reply.createdAt
							? new Date(reply.createdAt).getTime()
							: 0;
						return sum + (updatedAtTime || createdAtTime || 0);
					}, 0)
				: 0);

		if (currentVersion !== lastRepliesVersion) {
			lastRepliesVersion = currentVersion;
			localReplies = [...propReplies];
		}
	});

	function formatTimestamp(
		value: CommentReply["createdAt"] | CommentReply["updatedAt"],
	): string | null {
		if (value === undefined || value === null) return null;
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	function focusReplyTextarea() {
		queueMicrotask(() => {
			if (replyTextareaEl) {
				replyTextareaEl.focus();
				const length = replyTextareaEl.value.length;
				replyTextareaEl.setSelectionRange(length, length);
			}
		});
	}

	function handleStartReply() {
		if (!canReply) {
			return;
		}

		if (isReplying) {
			handleCancelReply();
			return;
		}

		replyError = null;
		replyDraft = "";
		isReplying = true;
		focusReplyTextarea();
	}

	function handleCancelReply() {
		isReplying = false;
		replyDraft = "";
		replyError = null;
	}

	async function handleSubmitReply() {
		if (!trimmedReplyDraft.length) {
			replyError = "Reply cannot be empty.";
			return;
		}

		if (!canReply) {
			replyError = "Replying is not available.";
			return;
		}

		isSubmittingReply = true;
		replyError = null;

		try {
			let success = false;

			if (onReply) {
				const result = await onReply(commentId, trimmedReplyDraft);
				success = result !== false;
			} else if (databaseAPI?.addReplyToComment && editorView) {
				const result = await databaseAPI.addReplyToComment(editorView, commentId, {
					text: trimmedReplyDraft,
				});
				success = Boolean(result);
			}

			if (!success) {
				replyError = "Failed to add reply.";
				return;
			}

			// Add the reply to local state directly
			const newReply: CommentReply = {
				id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Generate a temporary ID
				text: trimmedReplyDraft,
				author: "Current User", // You might want to get this from props or context
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			localReplies = [...localReplies, newReply];

			replyDraft = "";
			replyError = null;
			isReplying = false;
		} catch (error) {
			console.error("Failed to add reply:", error);
			replyError = "Failed to add reply.";
		} finally {
			isSubmittingReply = false;
		}
	}

	function handleReplyKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSubmitReply();
		} else if (event.key === "Escape") {
			event.preventDefault();
			handleCancelReply();
		}
	}

	function startEditingReply(replyId: string, currentText: string) {
		editingReplyId = replyId;
		editingReplyText = currentText;
		editingReplyError = null;
	}

	function cancelEditingReply() {
		editingReplyId = null;
		editingReplyText = "";
		editingReplyError = null;
	}

	async function saveReplyEdit(replyId: string) {
		const trimmedText = editingReplyText.trim();
		if (!trimmedText.length) {
			editingReplyError = "Reply cannot be empty.";
			return;
		}

		try {
			let updateSucceeded = false;

			// Try callback first, then database API
			if (onEditReply) {
				const result = await onEditReply(commentId, replyId, trimmedText);
				updateSucceeded = result !== false;
			} else if (databaseAPI?.updateReplyCommand && editorView) {
				updateSucceeded = await databaseAPI.updateReplyCommand(
					editorView,
					commentId,
					replyId,
					{
						text: trimmedText,
					},
				);
			} else {
				// No API or callback, just update local state
				updateSucceeded = true;
			}

			if (updateSucceeded) {
				// Update local state after successful update
				localReplies = localReplies.map((reply) =>
					reply.id === replyId
						? { ...reply, text: trimmedText, updatedAt: new Date() }
						: reply,
				);
				cancelEditingReply();
			} else {
				editingReplyError = "Failed to update reply.";
			}
		} catch (error) {
			console.error("Failed to update reply:", error);
			editingReplyError = "Failed to update reply.";
		}
	}

	async function deleteReply(replyId: string) {
		try {
			let deleteSucceeded = false;

			// Try callback first, then database API
			if (onDeleteReply) {
				onDeleteReply(commentId, replyId);
				deleteSucceeded = true;
			} else if (databaseAPI?.removeReplyCommand && editorView) {
				deleteSucceeded = await databaseAPI.removeReplyCommand(
					editorView,
					commentId,
					replyId,
				);
			} else {
				// No API or callback, just remove from local state
				deleteSucceeded = true;
			}

			if (deleteSucceeded) {
				// Remove from local state after successful deletion
				localReplies = localReplies.filter((reply) => reply.id !== replyId);
			} else {
				console.error("Failed to delete reply from database");
				// Note: In a real app, you might want to show an error message here
			}
		} catch (error) {
			console.error("Failed to delete reply:", error);
			// Note: In a real app, you might want to show an error message here
		}
	}

	function handleEditReplyKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
			event.preventDefault();
			if (editingReplyId) {
				void saveReplyEdit(editingReplyId);
			}
		} else if (event.key === "Escape") {
			event.preventDefault();
			cancelEditingReply();
		}
	}
</script>

{#if localReplies?.length}
	<div class="comment-replies">
		{#each localReplies as reply (reply.id)}
			<div class="comment-reply">
				<div class="comment-reply-header">
					<div class="comment-reply-actions">
						<button
							class="reply-action-btn reply-edit-btn"
							onclick={() => startEditingReply(reply.id, reply.text ?? "")}
							title="Edit reply"
							aria-label="Edit reply"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
								/>
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
						</button>
						<button
							class="reply-action-btn reply-delete-btn"
							onclick={() => deleteReply(reply.id)}
							title="Delete reply"
							aria-label="Delete reply"
						>
							<svg
								width="12"
								height="12"
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

				{#if editingReplyId === reply.id}
					<div class="reply-edit">
						<textarea
							bind:value={editingReplyText}
							class="comment-textarea reply-edit-textarea"
							rows={Math.min(6, Math.max(2, editingReplyText.split("\n").length + 1))}
							placeholder="Edit reply"
							onkeydown={handleEditReplyKeydown}
						></textarea>

						{#if editingReplyError}
							<p class="reply-edit-error">{editingReplyError}</p>
						{/if}

						<div class="reply-edit-actions">
							<button
								class="reply-action-btn reply-save-btn"
								onclick={() => void saveReplyEdit(reply.id)}
							>
								Save
							</button>
							<button
								class="reply-action-btn reply-cancel-btn"
								onclick={cancelEditingReply}
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<p class="comment-reply-text">{reply.text ?? "(No reply text)"}</p>
				{/if}

				{#if formatTimestamp(reply.updatedAt ?? reply.createdAt)}
					<span class="comment-reply-timestamp">
						{formatTimestamp(reply.updatedAt ?? reply.createdAt)}
					</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<div class="reply-footer">
	{#if isReplying}
		<div class="reply-editor">
			<textarea
				bind:this={replyTextareaEl}
				bind:value={replyDraft}
				class="comment-textarea reply-textarea"
				rows={Math.min(6, Math.max(2, replyDraft.split("\n").length + 1))}
				placeholder="Reply"
				onkeydown={handleReplyKeydown}
				disabled={isSubmittingReply}
			></textarea>

			{#if replyError}
				<p class="reply-error">{replyError}</p>
			{/if}

			<div class="reply-actions">
				<button
					class="reply-action-btn reply-save-btn"
					onclick={() => void handleSubmitReply()}
					disabled={!canSubmitReply}
				>
					Reply
				</button>
				<button
					class="reply-action-btn reply-cancel-btn"
					onclick={handleCancelReply}
					disabled={isSubmittingReply}
				>
					Cancel
				</button>
			</div>
		</div>
	{:else}
		<button class="reply-trigger-btn" onclick={handleStartReply} disabled={!canReply}>
			Reply
		</button>
	{/if}
</div>

<style>
	.comment-replies {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-left: 1.5rem;
		border-left: 2px solid var(--background-modifier-border);
	}

	.comment-reply {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.comment-reply-text {
		margin: 0;
		color: var(--text-normal);
		font-size: 0.9rem;
		line-height: 1.4;
		white-space: pre-wrap;
	}

	.comment-reply-timestamp {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.comment-reply-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.comment-reply-actions {
		display: flex;
		gap: 0.25rem;
		opacity: 0.7;
		transition: opacity 0.2s ease;
	}

	.comment-reply:hover .comment-reply-actions {
		opacity: 1;
	}

	.reply-edit-btn:hover {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.reply-delete-btn:hover {
		background: var(--text-error);
		color: var(--text-on-accent);
	}

	.reply-edit {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.reply-edit-textarea {
		min-height: 60px;
	}

	.reply-edit-error {
		margin: 0;
		color: var(--text-error);
		font-size: 0.8rem;
	}

	.reply-edit-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.reply-footer {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.reply-trigger-btn {
		align-self: stretch;
		padding: 0.45rem 0.75rem;
		border-radius: 6px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		text-align: left;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.reply-trigger-btn:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.reply-trigger-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.reply-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.reply-textarea {
		min-height: 60px;
	}

	.reply-error {
		margin: 0;
		color: var(--text-error);
		font-size: 0.8rem;
	}

	.reply-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
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

	.reply-action-btn {
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		border: 1px solid transparent;
		font-size: 0.85rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.reply-save-btn {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}

	.reply-save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.reply-cancel-btn {
		background: var(--background-primary);
		color: var(--text-muted);
		border-color: var(--background-modifier-border);
	}

	.reply-cancel-btn:hover {
		color: var(--text-normal);
	}

	.reply-cancel-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.reply-action-btn:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	@media (max-width: 480px) {
		.comment-replies {
			padding-left: 1rem;
		}
	}
</style>

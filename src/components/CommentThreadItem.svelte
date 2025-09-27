<script lang="ts">
	import type { CommentRange, CommentReply } from "../types/comment";

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
		databaseAPI?: any; // CommentAPIWithDatabase
		editorView?: any; // EditorView from CodeMirror
		onClose?: () => void;
	}

	let { comment, onResolve, onDelete, onEdit, onReply, databaseAPI, editorView, onClose }: Props =
		$props();

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
	let localReplies = $state<CommentRange["replies"]>(comment.replies ?? []);
	let lastRepliesVersion = $state(0);

	let displayText = $derived(() => {
		const text = renderedText.trim();
		return text.length ? text : "(No comment text)";
	});

	let isReplying = $state(false);
	let replyDraft = $state("");
	let replyError = $state<string | null>(null);
	let isSubmittingReply = $state(false);
	let replyTextareaEl = $state<HTMLTextAreaElement | null>(null);
	let editingReplyId = $state<string | null>(null);
	let editingReplyText = $state("");
	let editingReplyError = $state<string | null>(null);

	let canEdit = $derived(
		Boolean(onEdit) || Boolean(databaseAPI?.updateCommentCommand && editorView),
	);
	let trimmedDraft = $derived(draftText.trim());
	let currentText = $derived((comment.text ?? "").trim());
	let hasChanges = $derived(trimmedDraft !== currentText);
	let canSave = $derived(canEdit && !isSaving && hasChanges && trimmedDraft.length > 0);

	let canReply = $derived(
		Boolean(onReply) || Boolean(databaseAPI?.addReplyToComment && editorView),
	);
	let trimmedReplyDraft = $derived(replyDraft.trim());
	let canSubmitReply = $derived(canReply && !isSubmittingReply && trimmedReplyDraft.length > 0);

	$effect(() => {
		const propText = comment.text ?? "";
		if (propText !== lastCommentText) {
			lastCommentText = propText;
			renderedText = propText;
		}
	});

	$effect(() => {
		const propReplies = comment.replies ?? [];
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
				const result = await onReply(comment.id, trimmedReplyDraft);
				success = result !== false;
			} else if (databaseAPI?.addReplyToComment && editorView) {
				const result = await databaseAPI.addReplyToComment(editorView, comment.id, {
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
			localReplies = [...(localReplies ?? []), newReply];

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

			// If we have database API, try to persist the change first
			if (databaseAPI?.updateReplyCommand && editorView) {
				updateSucceeded = await databaseAPI.updateReplyCommand(
					editorView,
					comment.id,
					replyId,
					{
						text: trimmedText,
					},
				);
			} else {
				// If no database API, just update local state
				updateSucceeded = true;
			}

			if (updateSucceeded) {
				// Update local state after successful database update
				localReplies = (localReplies ?? []).map((reply) =>
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

			// If we have database API, try to persist the deletion first
			if (databaseAPI?.removeReplyCommand && editorView) {
				deleteSucceeded = await databaseAPI.removeReplyCommand(
					editorView,
					comment.id,
					replyId,
				);
			} else {
				// If no database API, just remove from local state
				deleteSucceeded = true;
			}

			if (deleteSucceeded) {
				// Remove from local state after successful database deletion
				localReplies = (localReplies ?? []).filter((reply) => reply.id !== replyId);
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
									<path
										d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
									/>
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
								rows={Math.min(
									6,
									Math.max(2, editingReplyText.split("\n").length + 1),
								)}
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

	.edit-action-btn,
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

	.save-btn,
	.reply-save-btn {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}

	.save-btn:disabled,
	.reply-save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.cancel-btn,
	.reply-cancel-btn {
		background: var(--background-primary);
		color: var(--text-muted);
		border-color: var(--background-modifier-border);
	}

	.cancel-btn:hover,
	.reply-cancel-btn:hover {
		color: var(--text-normal);
	}

	.cancel-btn:disabled,
	.reply-cancel-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

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
	.reply-trigger-btn:focus-visible,
	.edit-action-btn:focus-visible,
	.reply-action-btn:focus-visible {
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

		.comment-replies {
			padding-left: 1rem;
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

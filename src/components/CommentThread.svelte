<script lang="ts">
	import type { CommentRange } from "../types/comment";
	import CommentThreadItem from "./CommentThreadItem.svelte";

	interface Props {
		comments: CommentRange[];
		position?: "left" | "right";
		width?: number;
		style?: string;
		databaseAPI?: any; // CommentAPIWithDatabase
		editorView?: any; // EditorView from CodeMirror
		onResolve?: (commentId: string) => Promise<boolean | void> | boolean | void;
		onClose?: () => void;
		onEdit?: (commentId: string, nextText: string) => Promise<boolean | void> | boolean | void;
	}

	let {
		comments,
		position = "right",
		width,
		style: customStyle,
		databaseAPI,
		editorView,
		onResolve,
		onClose,
		onEdit,
	}: Props = $props();

	let computedStyle = $derived(width ? `width: ${width}px;` : "");
	let finalStyle = $derived(customStyle ? `${customStyle}; ${computedStyle}` : computedStyle);

	// Expose the DOM element for parent component binding
	let threadElement: HTMLDivElement;
</script>

<div
	bind:this={threadElement}
	class="cm-commentIndicator-thread"
	data-thread-position={position}
	style={finalStyle}
>
	{#each comments as comment (comment.id)}
		<CommentThreadItem {comment} {databaseAPI} {editorView} {onResolve} {onClose} {onEdit} />
	{/each}
</div>

<style>
	.cm-commentIndicator-thread {
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		box-shadow: var(--shadow-s);
		max-height: 400px;
		overflow-y: auto;
		position: absolute;
		z-index: 1000;
		min-width: 220px;
	}

	/* Position-specific styling can be added here if needed */

	/* Scrollbar styling for webkit browsers */
	.cm-commentIndicator-thread::-webkit-scrollbar {
		width: 6px;
	}

	.cm-commentIndicator-thread::-webkit-scrollbar-track {
		background: var(--background-secondary);
		border-radius: 3px;
	}

	.cm-commentIndicator-thread::-webkit-scrollbar-thumb {
		background: var(--background-modifier-border);
		border-radius: 3px;
	}

	.cm-commentIndicator-thread::-webkit-scrollbar-thumb:hover {
		background: var(--text-muted);
	}
</style>

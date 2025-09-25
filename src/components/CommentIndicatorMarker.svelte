<script lang="ts">
	import { setIcon } from "obsidian";

	interface Props {
		count: number;
		label: string;
		isOpen?: boolean;
		hasNewComments?: boolean;
		isActive?: boolean;
	}

	let {
		count,
		label,
		isOpen = false,
		hasNewComments = false,
		isActive = false,
	}: Props = $props();

	let countSafe = $derived(Math.max(0, count));
	let title = $derived(countSafe > 1 ? `${countSafe} comments` : "Comments");
	let icon = $state<HTMLElement | null>(null);

	$effect(() => {
		if (icon) setIcon(icon, "message-square-text");
	});
</script>

<span
	class="cm-commentIndicator-marker"
	class:is-open={isOpen}
	class:new-comments={hasNewComments}
	class:active={isActive}
	aria-label={title}
	data-comment-count={countSafe}
>
	<span class="cm-commentIndicator-icon" bind:this={icon}></span>
	{#if countSafe > 1}
		<span class="cm-commentIndicator-suffix">{countSafe}</span>
	{/if}
</span>

<style>
	.cm-commentIndicator-marker {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		cursor: pointer;
		padding: 4px 8px;
		padding-right: 14px;
		padding-bottom: 2px;
		border-radius: 12px;
		background: var(--background-modifier-hover);
		border: none;
		transition: all 0.15s ease;
		box-shadow: 0 1px 2px var(--shadow-s);
		font-size: 0.8em;
		line-height: 1;
	}

	.cm-commentIndicator-marker:hover {
		background: var(--background-modifier-active-hover);
		border: none;
		transform: translateY(-1px);
		box-shadow: 0 2px 6px var(--shadow-s);
	}

	.cm-commentIndicator-marker.is-open {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border: none;
		box-shadow: 0 3px 8px var(--shadow-s);
	}

	.cm-commentIndicator-marker.is-open:hover {
		background: var(--interactive-accent-hover);
		border: none;
	}

	.cm-commentIndicator-icon {
		width: 14px;
		height: 14px;
		color: var(--text-muted);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.cm-commentIndicator-marker:hover .cm-commentIndicator-icon,
	.cm-commentIndicator-marker.is-open .cm-commentIndicator-icon {
		color: var(--text-normal);
		transform: scale(1.1);
	}

	.cm-commentIndicator-marker.is-open .cm-commentIndicator-icon {
		color: var(--text-on-accent);
	}

	.cm-commentIndicator-suffix {
		position: absolute;
		bottom: -4px;
		right: 2px;
		font-weight: 700;
		font-size: 0.68em;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		padding: 0;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
		transition: all 0.15s ease;
		box-shadow: 0 2px 4px var(--shadow-s);
		z-index: 1;
	}

	.cm-commentIndicator-marker:hover .cm-commentIndicator-suffix {
		background: var(--interactive-accent-hover);
		transform: scale(1.1);
		box-shadow: 0 2px 6px var(--shadow-s);
		font-weight: 700;
		width: 16px;
		height: 16px;
	}

	.cm-commentIndicator-marker.is-open .cm-commentIndicator-suffix {
		background: var(--text-on-accent);
		color: var(--interactive-accent);
		font-weight: 700;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
		width: 16px;
		height: 16px;
	}

	.cm-commentIndicator-marker.new-comments {
		animation: pulse 0.5s ease-in-out;
	}

	.cm-commentIndicator-marker.active {
		border: none;
		animation: breathe 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.15);
		}
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}
</style>

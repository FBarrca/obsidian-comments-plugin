<script lang="ts">
	import { setIcon } from "obsidian";

	interface Props {
		count: number;
		label: string;
		resolvedCount?: number;
		isOpen?: boolean;
		hasNewComments?: boolean;
		isActive?: boolean;
	}

	let {
		count,
		label,
		resolvedCount = 0,
		isOpen = false,
		hasNewComments = false,
		isActive = false,
	}: Props = $props();

	function computeTitle(total: number, unresolved: number): string {
		if (!total) {
			return "Comments";
		}

		if (unresolved > 0) {
			return total > 1 ? `${total} comments` : "Comment";
		}

		return total > 1 ? `${total} resolved comments` : "Resolved comment";
	}

	function computeAriaLabel(total: number, unresolved: number): string {
		if (!total) {
			return "No comments";
		}

		if (unresolved > 0) {
			const base =
				unresolved === 1 ? "1 unresolved comment" : `${unresolved} unresolved comments`;
			return total === unresolved ? base : `${base} (total ${total})`;
		}

		return total === 1 ? "Resolved comment" : `${total} resolved comments`;
	}

	let countSafe = $derived(Math.max(0, Number(count ?? 0)));
	let resolvedSafe = $derived(Math.min(countSafe, Math.max(0, Number(resolvedCount ?? 0))));
	let unresolvedCount = $derived(Math.max(0, countSafe - resolvedSafe));
	let hasUnresolved = $derived(unresolvedCount > 0);

	let title = $derived(computeTitle(countSafe, unresolvedCount));
	let ariaLabel = $derived(computeAriaLabel(countSafe, unresolvedCount));
	let iconName = $derived(!countSafe || hasUnresolved ? "message-square-text" : "check-circle");
	let suffixValue = $derived(
		hasUnresolved ? String(unresolvedCount) : String(label ?? countSafe),
	);
	let showSuffix = $derived(hasUnresolved ? unresolvedCount > 0 : countSafe > 1);
	let icon = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!icon) {
			return;
		}

		const nextIcon = iconName || "message-square-text";
		setIcon(icon, nextIcon);
	});
</script>

<span
	class="cm-commentIndicator-marker"
	class:is-open={isOpen}
	class:new-comments={hasNewComments}
	class:active={isActive}
	class:all-resolved={!hasUnresolved && countSafe > 0}
	aria-label={ariaLabel}
	{title}
	data-comment-count={countSafe}
	data-comments-resolved={resolvedSafe}
	data-comments-unresolved={unresolvedCount}
>
	<span class="cm-commentIndicator-icon" bind:this={icon}></span>
	{#if showSuffix}
		<span class="cm-commentIndicator-suffix">{suffixValue}</span>
	{/if}
</span>

<style>
	.cm-commentIndicator-marker {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		cursor: pointer;
		padding: 0;
		border: none;
		color: var(--text-muted);
		transition:
			transform 0.15s ease,
			color 0.15s ease;
		overflow: visible;
	}

	.cm-commentIndicator-marker::before {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--background-modifier-hover);
		box-shadow: 0 1px 2px var(--shadow-s);
		transition:
			background 0.15s ease,
			box-shadow 0.15s ease;
		pointer-events: none;
		z-index: 0;
	}

	.cm-commentIndicator-marker:hover {
		transform: translateY(-1px);
		color: var(--text-normal);
	}

	.cm-commentIndicator-marker:hover::before {
		background: var(--background-modifier-active-hover);
		box-shadow: 0 2px 6px var(--shadow-s);
	}

	.cm-commentIndicator-marker.all-resolved {
		color: var(--interactive-success);
	}

	.cm-commentIndicator-marker.all-resolved::before {
		background: color-mix(
			in srgb,
			var(--interactive-success) 30%,
			var(--background-modifier-hover)
		);
		box-shadow: 0 2px 6px var(--shadow-s);
	}

	.cm-commentIndicator-marker.all-resolved:hover::before {
		background: color-mix(
			in srgb,
			var(--interactive-success) 45%,
			var(--background-modifier-active-hover)
		);
	}

	.cm-commentIndicator-marker.all-resolved .cm-commentIndicator-suffix {
		background: var(--interactive-success);
		color: var(--text-on-accent);
	}

	.cm-commentIndicator-marker.is-open {
		color: var(--text-on-accent);
	}

	.cm-commentIndicator-marker.is-open::before {
		background: var(--interactive-accent);
		box-shadow: 0 3px 8px var(--shadow-s);
	}

	.cm-commentIndicator-marker.is-open:hover::before {
		background: var(--interactive-accent-hover);
	}

	.cm-commentIndicator-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: inherit;
		transition:
			transform 0.15s ease,
			color 0.15s ease;
		flex-shrink: 0;
		position: relative;
		z-index: 1;
	}

	:global(.cm-commentIndicator-icon svg) {
		width: 16px;
		height: 16px;
	}

	.cm-commentIndicator-marker:hover .cm-commentIndicator-icon,
	.cm-commentIndicator-marker.is-open .cm-commentIndicator-icon {
		transform: scale(1.1);
	}

	.cm-commentIndicator-marker.is-open .cm-commentIndicator-icon {
		color: var(--text-on-accent);
	}

	.cm-commentIndicator-suffix {
		position: absolute;
		bottom: -5px;
		right: -1px;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 2px solid var(--background-primary);
		font-weight: 700;
		font-size: 0.65rem;
		line-height: 1;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
		transition:
			transform 0.15s ease,
			background 0.15s ease,
			color 0.15s ease,
			box-shadow 0.15s ease;
		box-shadow: 0 2px 6px var(--shadow-s);
		z-index: 2;
		min-width: 18px;
		min-height: 18px;
	}

	.cm-commentIndicator-marker:hover .cm-commentIndicator-suffix {
		background: var(--interactive-accent-hover);
		transform: scale(1.05);
	}

	.cm-commentIndicator-marker.is-open .cm-commentIndicator-suffix {
		background: var(--text-on-accent);
		color: var(--interactive-accent);
	}

	.cm-commentIndicator-marker.new-comments {
		animation: pulse 0.5s ease-in-out;
	}

	.cm-commentIndicator-marker.active {
		animation: breathe 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
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

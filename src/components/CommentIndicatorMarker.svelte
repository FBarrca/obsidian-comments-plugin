<script lang="ts">
	import { setIcon } from "obsidian";

	interface Props {
		count: number;
		label: string;
	}

	let { count, label }: Props = $props();

	let safeCount = $derived(Math.max(0, count));
	let title = $derived(safeCount > 1 ? `${safeCount} comments` : "One comment");
	let iconElement = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!iconElement) {
			return;
		}

		setIcon(iconElement, "message-square-text");
	});
</script>

<span class="cm-commentIndicator-marker" aria-label={title} data-comment-count={safeCount}>
	<span class="cm-commentIndicator-icon" bind:this={iconElement}></span>
	{#if safeCount > 1}
		<span class="cm-commentIndicator-count">{label}</span>
	{/if}
</span>

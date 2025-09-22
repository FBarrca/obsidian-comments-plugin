<script lang="ts">
	import { onMount } from "svelte";

	interface Props {
		title?: string;
		count?: number;
	}

	// Get props with safe defaults
	let { title = "Svelte Component", count: initialCount = 0 }: Props = $props();

	let count = $state(initialCount);
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	function increment() {
		count += 1;
	}

	function decrement() {
		count -= 1;
	}
</script>

<div>
	<h3>{title}</h3>
	<p>This is a Svelte component integrated into your Obsidian plugin!</p>
	<p>Mounted: {mounted ? "Yes" : "No"}</p>

	<div class="counter">
		<button onclick={decrement}>-</button>
		<span class="count">{count}</span>
		<button onclick={increment}>+</button>
	</div>
</div>

<style>
	.svelte-component h3 {
		margin: 0 0 0.5rem 0;
		color: var(--text-normal);
	}

	.svelte-component p {
		margin: 0.5rem 0;
		color: var(--text-muted);
	}

	.counter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.counter button {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border: none;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.counter button:hover {
		background: var(--interactive-accent-hover);
	}

	.count {
		font-weight: bold;
		min-width: 2rem;
		text-align: center;
		color: var(--text-normal);
	}
</style>

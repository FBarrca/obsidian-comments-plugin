<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import type { CommentRange } from "../types/comment";
	import CommentThread from "./CommentThread.svelte";

	interface Props {
		comments: CommentRange[];
		markerElement: HTMLElement;
		editorView: any; // EditorView from CodeMirror
		onClose: () => void;
		threadViewportPadding?: number;
		threadInlineSpacing?: number;
		minThreadWidth?: number;
		databaseAPI?: any; // CommentAPIWithDatabase
	}

	let {
		comments,
		markerElement,
		editorView,
		onClose,
		threadViewportPadding = 12,
		threadInlineSpacing = 12,
		minThreadWidth = 220,
		databaseAPI,
	}: Props = $props();

	let threadElement: HTMLElement | null = null;
	let layerElement: HTMLElement;
	let resizeObserver: ResizeObserver | null = null;
	let rafId: number | null = null;
	let workspaceBinding: { workspace: any; ref: any } | null = null;

	function clamp(v: number, min: number, max: number): number {
		return max < min ? min : Math.min(Math.max(v, min), max);
	}

	function getMarginRight(view: any): number {
		const editorEl = view.dom as HTMLElement;
		const contentContainerEl = editorEl.querySelector(
			".cm-contentContainer",
		) as HTMLElement | null;
		if (!contentContainerEl) return 0;
		const editorRect = editorEl.getBoundingClientRect();
		const contentRect = contentContainerEl.getBoundingClientRect();
		return (editorRect.width - contentRect.width) / 2;
	}

	function subscribeToWorkspaceResize(listener: () => void): { workspace: any; ref: any } | null {
		const obsidianWindow = window as Window & { app?: { workspace?: any } };
		const workspace = obsidianWindow.app?.workspace;
		if (!workspace) return null;
		const ref = workspace.on("resize", listener);
		return { workspace, ref };
	}

	function updateThreadPlacement() {
		// Get the actual thread element from the CommentThread component
		const actualThreadElement = layerElement?.querySelector(
			".cm-commentIndicator-thread",
		) as HTMLElement;

		if (
			!markerElement?.isConnected ||
			!layerElement?.isConnected ||
			!actualThreadElement?.isConnected
		) {
			onClose();
			return;
		}

		// Reset inline positioning
		actualThreadElement.style.left = "auto";
		actualThreadElement.style.right = "auto";
		actualThreadElement.style.top = "auto";

		const isRTL = getComputedStyle(markerElement).direction === "rtl";
		const wrapperEl = layerElement.parentElement as HTMLElement | null;
		if (!wrapperEl) return;

		const markerRect = markerElement.getBoundingClientRect();
		const threadRect = actualThreadElement.getBoundingClientRect();
		const wrapperRect = wrapperEl.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		const spaceRight = viewportWidth - threadViewportPadding - markerRect.right;
		const spaceLeft = markerRect.left - threadViewportPadding;
		const marginRight = getMarginRight(editorView);

		// Prefer right alignment in LTR if there is enough room in the right margin.
		let alignRight = !isRTL && marginRight >= minThreadWidth;

		// Flip based on available space if needed.
		if (alignRight && threadRect.width > spaceRight && spaceLeft > spaceRight) {
			alignRight = false;
		} else if (!alignRight && threadRect.width > spaceLeft && spaceRight >= spaceLeft) {
			alignRight = true;
		}

		// Horizontal position
		const leftIfRight = markerRect.right - wrapperRect.left + threadInlineSpacing;
		const leftIfLeft =
			markerRect.left - wrapperRect.left - threadInlineSpacing - threadRect.width;

		const minLeft = threadViewportPadding - wrapperRect.left;
		const maxLeft = viewportWidth - threadViewportPadding - threadRect.width - wrapperRect.left;

		const left = clamp(alignRight ? leftIfRight : leftIfLeft, minLeft, maxLeft);
		actualThreadElement.style.left = `${left}px`;
		actualThreadElement.dataset.threadPosition = alignRight ? "right" : "left";

		// Vertical position
		const baseTop = markerRect.top - wrapperRect.top;
		const minTop = threadViewportPadding - wrapperRect.top;
		const maxTop = viewportHeight - threadViewportPadding - threadRect.height - wrapperRect.top;
		actualThreadElement.style.top = `${clamp(baseTop, minTop, maxTop)}px`;

		// Constrain width only when thread is on the right.
		if (actualThreadElement.dataset.threadPosition === "right") {
			const width = Math.max(0, Math.floor(getMarginRight(editorView)));
			actualThreadElement.style.width = width ? `${width}px` : "";
		} else {
			actualThreadElement.style.width = "";
		}
	}

	function handleScroll() {
		// Add null check before calling updateThreadPlacement
		const actualThreadElement = layerElement?.querySelector(
			".cm-commentIndicator-thread",
		) as HTMLElement;
		if (
			markerElement?.isConnected &&
			layerElement?.isConnected &&
			actualThreadElement?.isConnected
		) {
			updateThreadPlacement();
		}
	}

	function monitorConnection() {
		if (!markerElement?.isConnected) {
			onClose();
			return;
		}
		rafId = window.requestAnimationFrame(monitorConnection);
	}

	onMount(() => {
		// Initial placement + one RAF tick to account for layout/paint.
		updateThreadPlacement();
		requestAnimationFrame(updateThreadPlacement);

		// Observe size changes.
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(updateThreadPlacement);
			const wrapper = layerElement.parentElement;
			if (wrapper) resizeObserver.observe(wrapper);
			resizeObserver.observe(layerElement);
			resizeObserver.observe(editorView.dom);
		}

		// Scroll / resize listeners.
		editorView.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("scroll", handleScroll, { passive: true });

		workspaceBinding = subscribeToWorkspaceResize(updateThreadPlacement);
		if (!workspaceBinding) {
			window.addEventListener("resize", updateThreadPlacement);
		}

		// Auto-close if marker is detached.
		rafId = window.requestAnimationFrame(monitorConnection);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		editorView.scrollDOM.removeEventListener("scroll", handleScroll);
		window.removeEventListener("scroll", handleScroll);
		if (workspaceBinding) {
			workspaceBinding.workspace.off(workspaceBinding.ref);
		} else {
			window.removeEventListener("resize", updateThreadPlacement);
		}
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
		}
	});
</script>

<div bind:this={layerElement} class="cm-thread-layer" style="position: relative;">
	<div bind:this={threadElement}>
		<CommentThread {comments} {databaseAPI} {editorView} {onClose} style="display: block;" />
	</div>
</div>

<style>
	.cm-thread-layer {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 1000;
	}

	.cm-thread-layer :global(.cm-commentIndicator-thread) {
		pointer-events: auto;
	}
</style>

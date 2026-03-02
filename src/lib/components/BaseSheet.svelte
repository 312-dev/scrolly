<script lang="ts">
	import type { Snippet } from 'svelte';
	import { pushState, beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { openSheet, closeSheet } from '$lib/stores/sheetOpen';

	let {
		title = '',
		sheetId = 'sheet',
		showHandle = true,
		ondismiss,
		header,
		children
	}: {
		title?: string;
		sheetId?: string;
		showHandle?: boolean;
		ondismiss: () => void;
		header?: Snippet;
		children: Snippet;
	} = $props();

	let visible = $state(false);
	let closedViaBack = false;
	let timers: ReturnType<typeof setTimeout>[] = [];

	let handleEl: HTMLElement | null = $state(null);
	let dragY = $state(0);
	let dragging = $state(false);
	let dragStartY = 0;
	const DRAG_DISMISS_THRESHOLD = 120;

	function startDrag(e: PointerEvent) {
		if (!handleEl) return;
		handleEl.setPointerCapture(e.pointerId);
		dragging = true;
		dragStartY = e.clientY;
		dragY = 0;
	}

	function moveDrag(e: PointerEvent) {
		if (!dragging) return;
		dragY = Math.max(0, e.clientY - dragStartY);
	}

	function endDrag() {
		if (!dragging) return;
		const wasTap = dragY < 5;
		dragging = false;
		if (wasTap || dragY > DRAG_DISMISS_THRESHOLD) {
			dragY = 0;
			dismiss();
		} else {
			dragY = 0;
		}
	}

	// Prevent history.back() in cleanup when a real navigation occurs (e.g. clicking a link inside the sheet)
	beforeNavigate(() => {
		closedViaBack = true;
	});

	function safeTimeout(fn: () => void, ms: number) {
		const id = setTimeout(fn, ms);
		timers.push(id);
		return id;
	}

	// Animate in, lock scroll, manage history
	$effect(() => {
		openSheet();
		requestAnimationFrame(() => {
			visible = true;
		});
		document.body.style.overflow = 'hidden';

		pushState('', { sheet: sheetId });
		const handlePopState = () => {
			closedViaBack = true;
			ondismiss();
		};
		window.addEventListener('popstate', handlePopState);

		return () => {
			closeSheet();
			document.body.style.overflow = '';
			window.removeEventListener('popstate', handlePopState);
			if (!closedViaBack) history.back();
		};
	});

	export function dismiss() {
		visible = false;
		safeTimeout(ondismiss, 300);
	}

	onDestroy(() => timers.forEach(clearTimeout));
</script>

<div class="base-overlay" class:visible onclick={dismiss} role="presentation"></div>

<div
	class="base-sheet"
	class:visible
	class:dragging
	style:transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
>
	{#if showHandle}
		<div
			class="base-handle-bar"
			bind:this={handleEl}
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') dismiss();
			}}
			role="button"
			tabindex="-1"
		>
			<div class="base-handle"></div>
		</div>
	{/if}

	{#if header}
		{@render header()}
	{:else if title}
		<div class="base-header">
			<span class="base-title">{title}</span>
		</div>
	{/if}

	{@render children()}
</div>

<style>
	.base-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 99;
		opacity: 0;
		transition: opacity 300ms ease;
	}
	.base-overlay.visible {
		opacity: 1;
	}

	.base-sheet {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--bg-surface);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		transform: translateY(100%);
		transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	.base-sheet.visible {
		transform: translateY(0);
	}
	.base-sheet.dragging {
		transition: none;
	}

	.base-handle-bar {
		display: flex;
		justify-content: center;
		padding: var(--space-md);
		cursor: pointer;
		touch-action: none;
	}
	.base-handle {
		width: 36px;
		height: 4px;
		background: var(--bg-subtle);
		border-radius: 2px;
	}

	.base-header {
		padding: 0 var(--space-lg) var(--space-md);
		border-bottom: 1px solid var(--border);
	}
	.base-title {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}
</style>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { pushState, beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { openSheet, closeSheet } from '$lib/stores/sheetOpen';
	import { createSafeTimeout } from '$lib/safeTimeout';
	import XIcon from 'phosphor-svelte/lib/XIcon';

	let {
		title = '',
		sheetId = 'sheet',
		ondismiss,
		header,
		children
	}: {
		title?: string;
		sheetId?: string;
		ondismiss: () => void;
		header?: Snippet;
		children: Snippet;
	} = $props();

	let visible = $state(false);
	let closedViaBack = false;
	const { safeTimeout, clearAll } = createSafeTimeout();

	let dragZoneEl: HTMLElement | null = $state(null);
	let dragY = $state(0);
	let dragging = $state(false);
	let dragTracking = false;
	let dragStartY = 0;
	let dragStartX = 0;
	const DRAG_COMMIT_THRESHOLD = 6; // px of downward motion before locking to a drag
	const DRAG_DISMISS_THRESHOLD = 120;

	function startDrag(e: PointerEvent) {
		dragTracking = true;
		dragStartY = e.clientY;
		dragStartX = e.clientX;
		dragY = 0;
	}

	function moveDrag(e: PointerEvent) {
		if (!dragTracking) return;
		const dy = e.clientY - dragStartY;
		const dx = e.clientX - dragStartX;

		if (!dragging) {
			// Commit to drag only when moving clearly downward
			if (dy > DRAG_COMMIT_THRESHOLD && dy > Math.abs(dx)) {
				dragging = true;
				dragZoneEl?.setPointerCapture(e.pointerId);
			} else if (Math.abs(dx) > DRAG_COMMIT_THRESHOLD || dy < -DRAG_COMMIT_THRESHOLD) {
				dragTracking = false;
			}
			return;
		}

		dragY = Math.max(0, dy);
	}

	function endDrag() {
		if (!dragTracking) return;
		dragTracking = false;
		if (!dragging) return;
		dragging = false;
		if (dragY > DRAG_DISMISS_THRESHOLD) {
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

	onDestroy(clearAll);
</script>

<div class="base-overlay" class:visible onclick={dismiss} role="presentation"></div>

<div
	class="base-sheet"
	class:visible
	class:dragging
	style:transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
>
	<div
		class="base-drag-zone"
		bind:this={dragZoneEl}
		onpointerdown={startDrag}
		onpointermove={moveDrag}
		onpointerup={endDrag}
		onpointercancel={endDrag}
		role="presentation"
	>
		{#if header}
			{@render header()}
		{:else if title}
			<div class="base-header">
				<span class="base-title">{title}</span>
				<button class="base-close-btn" onclick={dismiss} aria-label="Close">
					<XIcon size={18} />
				</button>
			</div>
		{/if}
	</div>

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

	.base-drag-zone {
		touch-action: none;
	}

	.base-header {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
		position: relative;
	}
	.base-title {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
	}
	.base-close-btn {
		position: absolute;
		right: var(--space-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: background 0.2s ease;
	}
	.base-close-btn:active {
		background: var(--bg-subtle);
	}
</style>

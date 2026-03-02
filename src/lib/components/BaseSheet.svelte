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

<div class="base-sheet" class:visible>
	{#if showHandle}
		<div
			class="base-handle-bar"
			onclick={dismiss}
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

	.base-handle-bar {
		display: flex;
		justify-content: center;
		padding: var(--space-md);
		cursor: pointer;
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

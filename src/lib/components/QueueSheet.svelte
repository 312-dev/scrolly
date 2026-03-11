<script lang="ts">
	import BaseSheet from './BaseSheet.svelte';
	import PlatformIcon from './PlatformIcon.svelte';
	import { confirm } from '$lib/stores/confirm';
	import { toast } from '$lib/stores/toasts';
	import { fetchQueueCount } from '$lib/stores/queue';
	import { basename } from '$lib/utils';
	import QueueCloutBanner from './QueueCloutBanner.svelte';
	import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import QueueIcon from 'phosphor-svelte/lib/QueueIcon';
	import QuestionIcon from 'phosphor-svelte/lib/QuestionIcon';
	import DotsSixVerticalIcon from 'phosphor-svelte/lib/DotsSixVerticalIcon';

	const { ondismiss }: { ondismiss: () => void } = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response passed through to QueueCloutBanner
	let clout = $state<any>(null);

	interface QueueItem {
		id: string;
		clipId: string;
		position: number;
		scheduledAt: string;
		sharesIn: string;
		title: string | null;
		originalUrl: string;
		platform: string;
		contentType: string;
		status: string;
		thumbnailPath: string | null;
	}

	let items = $state<QueueItem[]>([]);
	let loading = $state(true);

	// Drag state
	let dragIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let dragOffsetY = $state(0);
	let dragStartY = 0;
	let dragItemHeight = 0;
	let listEl = $state<HTMLUListElement | null>(null);

	$effect(() => {
		loadQueue();
		loadClout();
	});

	async function loadQueue() {
		loading = true;
		try {
			const res = await fetch('/api/queue');
			if (res.ok) {
				const data = await res.json();
				items = data.queue;
			}
		} catch {
			// silently fail
		}
		loading = false;
	}

	async function loadClout() {
		try {
			const res = await fetch('/api/clout');
			if (res.ok) {
				const data = await res.json();
				if (data.enabled) clout = data;
			}
		} catch {
			// silently fail
		}
	}

	function handleDragStart(e: PointerEvent, index: number) {
		e.stopPropagation();
		e.preventDefault();
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		dragStartY = e.clientY;
		dragIndex = index;
		dragOverIndex = index;
		dragOffsetY = 0;

		// Measure item height for snap calculations
		const li = handle.closest('.queue-item') as HTMLElement;
		if (li) dragItemHeight = li.offsetHeight;
	}

	function handleDragMove(e: PointerEvent) {
		if (dragIndex === null) return;
		e.preventDefault();
		dragOffsetY = e.clientY - dragStartY;

		// Calculate which index we're hovering over
		const steps = Math.round(dragOffsetY / dragItemHeight);
		const newOver = Math.max(0, Math.min(items.length - 1, dragIndex + steps));
		dragOverIndex = newOver;
	}

	function handleDragEnd() {
		if (dragIndex === null || dragOverIndex === null) {
			resetDrag();
			return;
		}
		if (dragIndex !== dragOverIndex) {
			const reordered = [...items];
			const [moved] = reordered.splice(dragIndex, 1);
			reordered.splice(dragOverIndex, 0, moved);
			items = reordered;
			persistReorder(reordered);
		}
		resetDrag();
	}

	function resetDrag() {
		dragIndex = null;
		dragOverIndex = null;
		dragOffsetY = 0;
	}

	async function persistReorder(reordered: QueueItem[]) {
		const orderedIds = reordered.map((i) => i.id);
		const res = await fetch('/api/queue/reorder', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ orderedIds })
		});
		if (res.ok) {
			await loadQueue();
		}
	}

	async function cancelItem(entryId: string) {
		const res = await fetch(`/api/queue/${entryId}`, { method: 'DELETE' });
		if (res.ok) {
			items = items.filter((i) => i.id !== entryId);
			fetchQueueCount();
			toast.success('Clip removed from queue');
		}
	}

	async function clearAll() {
		const ok = await confirm({
			title: 'Clear queue?',
			message: 'All queued clips will be removed. This cannot be undone.',
			confirmLabel: 'Clear all',
			destructive: true
		});
		if (!ok) return;
		const res = await fetch('/api/queue', { method: 'DELETE' });
		if (res.ok) {
			items = [];
			fetchQueueCount();
			toast.success('Queue cleared');
		}
	}

	function showHelp() {
		confirm({
			title: 'How the queue works',
			message:
				'Your first few clips go straight to the feed. ' +
				'After that, extras land here and get shared on a timer.\n\n' +
				'Your queue speed is based on how your clips land with the group — ' +
				'more reactions and comments means faster sharing.\n\n' +
				'Drag to reorder, or tap the trash icon to remove.',
			confirmLabel: 'Got it',
			cancelLabel: 'Close'
		});
	}

	function displayTitle(item: QueueItem): string {
		if (item.title) return item.title;
		try {
			return new URL(item.originalUrl).hostname;
		} catch {
			return item.originalUrl;
		}
	}

	function getItemTransform(index: number): string {
		if (dragIndex === null || dragOverIndex === null) return '';
		if (index === dragIndex) return `translateY(${dragOffsetY}px) scale(1.02)`;
		// Shift items between old and new position
		if (dragIndex < dragOverIndex && index > dragIndex && index <= dragOverIndex) {
			return `translateY(-${dragItemHeight}px)`;
		}
		if (dragIndex > dragOverIndex && index < dragIndex && index >= dragOverIndex) {
			return `translateY(${dragItemHeight}px)`;
		}
		return '';
	}
</script>

<BaseSheet sheetId="queue" {ondismiss}>
	{#snippet header()}
		<div class="queue-header">
			<div class="queue-header-left">
				<QueueIcon size={18} weight="bold" />
				<span class="queue-title">Your Queue</span>
				<button class="help-btn" onclick={showHelp} aria-label="How the queue works">
					<QuestionIcon size={16} />
				</button>
			</div>
			{#if items.length > 0}
				<button class="clear-btn" onclick={clearAll}>Clear all</button>
			{/if}
		</div>
	{/snippet}

	{#if clout}
		<QueueCloutBanner {clout} />
	{/if}

	<div class="queue-body">
		{#if loading}
			<div class="queue-empty">
				<span class="loading-text">Loading...</span>
			</div>
		{:else if items.length === 0}
			<div class="queue-empty">
				<QueueIcon size={48} weight="light" />
				<span class="empty-title">No clips queued</span>
				<span class="empty-sub">Clips that exceed your burst will appear here</span>
			</div>
		{:else}
			<ul class="queue-list" bind:this={listEl}>
				{#each items as item, i (item.id)}
					<li
						class="queue-item"
						class:dragging={dragIndex === i}
						style:transform={getItemTransform(i)}
						style:z-index={dragIndex === i ? 10 : 1}
					>
						<button
							class="drag-handle"
							onpointerdown={(e) => handleDragStart(e, i)}
							onpointermove={handleDragMove}
							onpointerup={handleDragEnd}
							onpointercancel={handleDragEnd}
							aria-label="Reorder"
						>
							<DotsSixVerticalIcon size={20} />
						</button>
						<div class="item-thumb">
							{#if item.thumbnailPath}
								<img src="/api/thumbnails/{basename(item.thumbnailPath)}" alt="" />
							{:else}
								<div class="thumb-placeholder">
									<PlatformIcon platform={item.platform} size={18} />
								</div>
							{/if}
						</div>
						<div class="item-info">
							<span class="item-title">{displayTitle(item)}</span>
							<span class="item-meta">
								<ClockIcon size={12} />
								{#if item.status === 'failed'}
									<span class="failed-label">Failed</span>
								{:else}
									Shares in ~{item.sharesIn}
								{/if}
							</span>
						</div>
						<button
							class="action-btn danger"
							onclick={() => cancelItem(item.id)}
							aria-label="Remove"
						>
							<TrashIcon size={16} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</BaseSheet>

<style>
	.queue-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
	}
	.queue-header-left {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--text-primary);
	}
	.queue-header-left :global(svg) {
		width: 18px;
		height: 18px;
	}
	.queue-title {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
	}
	.help-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
	}
	.help-btn:active {
		opacity: 0.7;
	}
	.clear-btn {
		background: none;
		border: none;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--error);
		cursor: pointer;
		padding: var(--space-xs) var(--space-sm);
	}
	.clear-btn:active {
		opacity: 0.7;
	}
	.queue-body {
		max-height: 60dvh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	.queue-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-3xl) var(--space-lg);
		color: var(--text-muted);
	}
	.queue-empty :global(svg) {
		opacity: 0.4;
	}
	.empty-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.empty-sub {
		font-size: 0.875rem;
		color: var(--text-muted);
		text-align: center;
		max-width: 240px;
	}
	.loading-text {
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.queue-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.queue-item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-md) var(--space-md) 0;
		border-bottom: 1px solid var(--border);
		transition:
			transform 200ms ease,
			box-shadow 200ms ease,
			background 200ms ease;
		background: var(--bg-elevated);
		position: relative;
	}
	.queue-item:last-child {
		border-bottom: none;
	}
	.queue-item.dragging {
		z-index: 10;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		background: var(--bg-surface);
		transition:
			box-shadow 200ms ease,
			background 200ms ease;
	}
	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		flex-shrink: 0;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: grab;
		padding: var(--space-md) var(--space-xs);
		touch-action: none;
	}
	.drag-handle:active {
		cursor: grabbing;
	}
	.drag-handle :global(svg) {
		width: 20px;
		height: 20px;
	}
	.item-thumb {
		width: 44px;
		height: 56px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-subtle);
	}
	.item-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
	}
	.item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.item-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.item-meta {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.failed-label {
		color: var(--error);
	}
	.action-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background: var(--bg-subtle);
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.15s ease;
	}
	.action-btn:active {
		background: var(--border);
	}
	.action-btn.danger {
		color: var(--error);
	}
</style>

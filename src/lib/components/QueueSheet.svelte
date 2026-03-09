<script lang="ts">
	import BaseSheet from './BaseSheet.svelte';
	import PlatformIcon from './PlatformIcon.svelte';
	import { confirm } from '$lib/stores/confirm';
	import { toast } from '$lib/stores/toasts';
	import { fetchQueueCount } from '$lib/stores/queue';
	import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import QueueIcon from 'phosphor-svelte/lib/QueueIcon';

	const { ondismiss }: { ondismiss: () => void } = $props();

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

	$effect(() => {
		loadQueue();
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

	async function moveToTop(entryId: string) {
		const res = await fetch(`/api/queue/${entryId}/move-to-top`, { method: 'POST' });
		if (res.ok) {
			await loadQueue();
			fetchQueueCount();
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
		const confirmed = await confirm({
			title: 'Clear queue?',
			message: 'All queued clips will be removed. This cannot be undone.',
			confirmLabel: 'Clear all',
			destructive: true
		});
		if (!confirmed) return;
		const res = await fetch('/api/queue', { method: 'DELETE' });
		if (res.ok) {
			items = [];
			fetchQueueCount();
			toast.success('Queue cleared');
		}
	}

	function displayTitle(item: QueueItem): string {
		if (item.title) return item.title;
		try {
			return new URL(item.originalUrl).hostname;
		} catch {
			return item.originalUrl;
		}
	}
</script>

<BaseSheet sheetId="queue" {ondismiss}>
	{#snippet header()}
		<div class="queue-header">
			<span class="queue-title">Your Queue</span>
			{#if items.length > 0}
				<button class="clear-btn" onclick={clearAll}>Clear all</button>
			{/if}
		</div>
	{/snippet}

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
			<ul class="queue-list">
				{#each items as item (item.id)}
					<li class="queue-item">
						<div class="item-thumb">
							{#if item.thumbnailPath}
								<img src="/api/thumbnails/{item.thumbnailPath}" alt="" />
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
						<div class="item-actions">
							{#if item.position > 0}
								<button
									class="action-btn"
									onclick={() => moveToTop(item.id)}
									aria-label="Move to top"
								>
									<ArrowUpIcon size={16} />
								</button>
							{/if}
							<button
								class="action-btn danger"
								onclick={() => cancelItem(item.id)}
								aria-label="Remove"
							>
								<TrashIcon size={16} />
							</button>
						</div>
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
	.queue-title {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
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
		gap: var(--space-md);
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
	}
	.queue-item:last-child {
		border-bottom: none;
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
	.item-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-shrink: 0;
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
		transition: background 0.15s ease;
	}
	.action-btn:active {
		background: var(--border);
	}
	.action-btn.danger {
		color: var(--error);
	}
</style>

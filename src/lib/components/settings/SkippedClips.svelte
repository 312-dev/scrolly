<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { basename, relativeTime } from '$lib/utils';
	import { fetchUnwatchedCount } from '$lib/stores/notifications';
	import { confirm } from '$lib/stores/confirm';
	import FastForwardIcon from 'phosphor-svelte/lib/FastForwardIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';

	interface DismissedClip {
		id: string;
		title: string | null;
		thumbnailPath: string | null;
		platform: string;
		contentType: string;
		addedByUsername: string;
		addedByAvatar: string | null;
		createdAt: string;
		dismissedAt: string;
	}

	const PAGE_SIZE = 5;

	let clips = $state<DismissedClip[]>([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let restoring = new SvelteSet<string>();
	let restoringAll = $state(false);

	let totalPages = $derived(Math.max(1, Math.ceil(clips.length / PAGE_SIZE)));
	let visibleClips = $derived(clips.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

	async function loadDismissed() {
		loading = true;
		try {
			const res = await fetch('/api/clips/dismissed');
			if (res.ok) {
				const data = await res.json();
				clips = data.clips;
			}
		} finally {
			loading = false;
		}
	}

	async function restoreClip(clipId: string) {
		restoring.add(clipId);
		try {
			const res = await fetch('/api/clips/dismiss', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clipIds: [clipId] })
			});
			if (res.ok) {
				clips = clips.filter((c) => c.id !== clipId);
				const newTotalPages = Math.max(1, Math.ceil(clips.length / PAGE_SIZE));
				if (currentPage > newTotalPages) currentPage = newTotalPages;
				fetchUnwatchedCount();
			}
		} finally {
			restoring.delete(clipId);
		}
	}

	async function restoreAll() {
		if (clips.length > 30) {
			const confirmed = await confirm({
				title: 'Restore all clips?',
				message: `This will restore ${clips.length} skipped clips back to your feed.`,
				confirmLabel: 'Restore all',
				cancelLabel: 'Cancel'
			});
			if (!confirmed) return;
		}
		restoringAll = true;
		try {
			const res = await fetch('/api/clips/dismiss', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true })
			});
			if (res.ok) {
				clips = [];
				fetchUnwatchedCount();
			}
		} finally {
			restoringAll = false;
		}
	}

	onMount(() => {
		loadDismissed();
	});
</script>

{#if !loading && clips.length > 0}
	<div class="settings-section">
		<h3 class="section-title">Skipped Clips</h3>
		<div class="card">
			<div class="skipped-header">
				<span class="skipped-count">
					<FastForwardIcon size={16} />
					{clips.length} skipped clip{clips.length !== 1 ? 's' : ''}
				</span>
				<button class="restore-all-btn" onclick={restoreAll} disabled={restoringAll}>
					{restoringAll ? 'Restoring...' : 'Restore all'}
				</button>
			</div>
			<div class="skipped-list">
				{#each visibleClips as clip (clip.id)}
					<div class="skipped-row">
						<div class="skipped-thumb">
							{#if clip.thumbnailPath}
								<img
									src="/api/thumbnails/{basename(clip.thumbnailPath)}"
									alt=""
									class="thumb-img"
								/>
							{:else}
								<div class="thumb-placeholder"></div>
							{/if}
						</div>
						<div class="skipped-info">
							<span class="skipped-title">{clip.title || 'Untitled'}</span>
							<span class="skipped-meta"
								>@{clip.addedByUsername} · {relativeTime(clip.createdAt)}</span
							>
						</div>
						<button
							class="restore-btn"
							onclick={() => restoreClip(clip.id)}
							disabled={restoring.has(clip.id)}
						>
							<ArrowCounterClockwiseIcon size={16} />
						</button>
					</div>
				{/each}
			</div>
			{#if totalPages > 1}
				<div class="pagination">
					{#each Array.from({ length: totalPages }, (_, i) => i + 1) as page (page)}
						<button
							class="page-btn"
							class:active={page === currentPage}
							onclick={() => (currentPage = page)}
						>
							{page}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.settings-section {
		margin-bottom: var(--space-lg);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		padding: 0 var(--space-xs) var(--space-sm);
		margin: 0;
	}

	.card {
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		padding: var(--space-lg);
	}

	.skipped-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-md);
	}

	.skipped-count {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.restore-all-btn {
		background: none;
		border: none;
		color: var(--accent-primary);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		transition: opacity 0.2s ease;
	}

	.restore-all-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.restore-all-btn:active:not(:disabled) {
		opacity: 0.7;
	}

	.skipped-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.skipped-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.skipped-thumb {
		width: 44px;
		height: 56px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
	}

	.thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-placeholder {
		width: 100%;
		height: 100%;
		background: var(--bg-surface);
	}

	.skipped-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.skipped-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.skipped-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.restore-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-surface);
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			transform 0.1s ease,
			color 0.2s ease;
	}

	.restore-btn:active:not(:disabled) {
		transform: scale(0.93);
	}

	.restore-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.pagination {
		display: flex;
		justify-content: center;
		gap: var(--space-xs);
		margin-top: var(--space-md);
	}

	.page-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-surface);
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.page-btn.active {
		background: var(--accent-primary);
		color: var(--bg-primary);
	}

	.page-btn:active:not(.active) {
		transform: scale(0.93);
	}
</style>

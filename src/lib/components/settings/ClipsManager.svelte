<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import ClipRow from './ClipRow.svelte';
	import { confirm } from '$lib/stores/confirm';
	import { toast } from '$lib/stores/toasts';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import { formatSize, groupClipsByMonth, fetchClipsList, deleteClips } from '$lib/clipsManager';
	import type { MonthGroup } from '$lib/clipsManager';
	import type { ClipSummary } from '$lib/types';

	const PAGE_SIZE = 30;

	let loading = $state(true);
	let clips = $state<ClipSummary[]>([]);
	let totalSizeMb = $state(0);
	let totalClips = $state(0);
	let sortBy = $state<'largest' | 'newest'>('largest');
	let selected = new SvelteSet<string>();
	let currentPage = $state(1);
	let prevSort = $state<'largest' | 'newest'>('largest');

	let totalPages = $derived(Math.max(1, Math.ceil(totalClips / PAGE_SIZE)));

	const monthGroups = $derived(() => groupClipsByMonth(clips));

	async function loadPage(page: number, showLoading = true) {
		if (showLoading) loading = true;
		selected.clear();
		const offset = (page - 1) * PAGE_SIZE;
		const data = await fetchClipsList(sortBy, PAGE_SIZE, offset);
		if (data) {
			clips = data.clips;
			totalSizeMb = data.totalSizeMb;
			totalClips = data.totalClips;
			currentPage = page;
		}
		loading = false;
	}

	$effect(() => {
		untrack(() => loadPage(1));
	});

	// Re-fetch when sort changes (skip initial run)
	$effect(() => {
		if (sortBy !== prevSort) {
			prevSort = sortBy;
			loadPage(1, false);
		}
	});

	function toggleSelect(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function selectAllInMonth(group: MonthGroup) {
		const allSelected = group.clips.every((c) => selected.has(c.id));
		if (allSelected) {
			for (const c of group.clips) selected.delete(c.id);
		} else {
			for (const c of group.clips) selected.add(c.id);
		}
	}

	async function handleDelete(ids: string[], message: string) {
		if (ids.length === 0) return;
		const confirmed = await confirm({
			title: 'Delete Clips',
			message,
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!confirmed) return;

		const ok = await deleteClips(ids);
		if (ok) {
			const deletedCount = ids.length;
			const deletedSet = new Set(ids);
			const deletedSize = clips
				.filter((c) => deletedSet.has(c.id))
				.reduce((sum, c) => sum + c.sizeMb, 0);
			totalSizeMb = Math.round((totalSizeMb - deletedSize) * 10) / 10;
			totalClips = Math.max(0, totalClips - deletedCount);
			for (const id of ids) selected.delete(id);
			const newTotalPages = Math.max(1, Math.ceil(totalClips / PAGE_SIZE));
			const targetPage = currentPage > newTotalPages ? newTotalPages : currentPage;
			await loadPage(targetPage, false);
			toast.success(`Deleted ${deletedCount} clip${deletedCount === 1 ? '' : 's'}`);
		} else {
			toast.error('Failed to delete clips');
		}
	}

	function updateCaption(id: string, title: string | null) {
		clips = clips.map((c) => (c.id === id ? { ...c, title } : c));
	}

	function deleteSingle(clip: ClipSummary) {
		handleDelete(
			[clip.id],
			`Delete "${clip.title || 'Untitled clip'}"? This will permanently remove the clip and free up ${formatSize(clip.sizeMb)}.`
		);
	}

	function deleteMonth(group: MonthGroup) {
		handleDelete(
			group.clips.map((c) => c.id),
			`Delete all ${group.clips.length} clips from ${group.label}? This will free up ${formatSize(group.totalSizeMb)}.`
		);
	}

	function deleteSelected() {
		const ids = [...selected];
		const total = clips.filter((c) => selected.has(c.id)).reduce((sum, c) => sum + c.sizeMb, 0);
		handleDelete(
			ids,
			`Delete ${selected.size} selected clip${selected.size === 1 ? '' : 's'}? This will free up ${formatSize(total)}.`
		);
	}
</script>

{#if loading}
	<div class="loading-state">
		<p>Loading clips...</p>
	</div>
{:else if clips.length === 0}
	<div class="empty-state">
		<p>No clips stored yet</p>
	</div>
{:else}
	<!-- Storage summary -->
	<div class="storage-summary">
		<div class="storage-header">
			<span class="storage-total">{formatSize(totalSizeMb)}</span>
			<span class="storage-label">{totalClips} clip{totalClips === 1 ? '' : 's'}</span>
		</div>
	</div>

	<!-- Sort controls -->
	<div class="sort-controls">
		<button
			class="sort-btn"
			class:active={sortBy === 'largest'}
			onclick={() => (sortBy = 'largest')}>Largest</button
		>
		<button class="sort-btn" class:active={sortBy === 'newest'} onclick={() => (sortBy = 'newest')}
			>Newest</button
		>
	</div>

	<!-- Clips by month -->
	<div class="clips-list">
		{#each monthGroups() as group (group.key)}
			<div class="month-group">
				<div class="month-header">
					<button class="month-select-btn" onclick={() => selectAllInMonth(group)}>
						<div class="checkbox" class:checked={group.clips.every((c) => selected.has(c.id))}>
							{#if group.clips.every((c) => selected.has(c.id))}
								<CheckIcon size={12} weight="bold" />
							{/if}
						</div>
					</button>
					<div class="month-info">
						<span class="month-label">{group.label}</span>
						<span class="month-meta"
							>{group.clips.length} clip{group.clips.length === 1 ? '' : 's'} &middot; {formatSize(
								group.totalSizeMb
							)}</span
						>
					</div>
					<button
						class="month-delete-btn"
						onclick={() => deleteMonth(group)}
						aria-label="Delete all clips from {group.label}"
					>
						<TrashIcon size={16} />
					</button>
				</div>

				{#each group.clips as clip (clip.id)}
					<ClipRow
						{clip}
						selected={selected.has(clip.id)}
						ontoggle={toggleSelect}
						ondelete={deleteSingle}
						oncaptionupdate={updateCaption}
					/>
				{/each}
			</div>
		{/each}

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="pagination">
				{#each Array.from({ length: totalPages }, (_, i) => i + 1) as page (page)}
					<button
						class="page-btn"
						class:active={page === currentPage}
						onclick={() => loadPage(page)}
					>
						{page}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Floating action bar when items selected -->
	{#if selected.size > 0}
		<div class="selection-bar">
			<span class="selection-count">{selected.size} selected</span>
			<button class="selection-delete-btn" onclick={deleteSelected}> Delete </button>
		</div>
	{/if}
{/if}

<style>
	.loading-state,
	.empty-state {
		padding: var(--space-xl) 0;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	/* Storage summary */
	.storage-summary {
		padding: var(--space-lg);
		background: var(--bg-surface);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-lg);
	}
	.storage-header {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.storage-total {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}
	.storage-label {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	/* Sort controls */
	.sort-controls {
		display: flex;
		gap: 2px;
		background: var(--bg-surface);
		border-radius: var(--radius-full);
		padding: 3px;
		margin-bottom: var(--space-lg);
	}
	.sort-btn {
		flex: 1;
		padding: var(--space-xs) var(--space-md);
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.sort-btn.active {
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	/* Month groups */
	.clips-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}
	.month-group {
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.month-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-md);
		border-bottom: 1px solid var(--bg-surface);
	}
	.month-select-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}
	.month-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.month-label {
		font-family: var(--font-display);
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.month-meta {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}
	.month-delete-btn {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition:
			color 0.2s ease,
			background 0.2s ease;
		padding: 0;
	}
	.month-delete-btn:hover {
		color: var(--error);
		background: color-mix(in srgb, var(--error) 10%, transparent);
	}
	.month-delete-btn :global(svg) {
		width: 16px;
		height: 16px;
	}

	/* Checkbox */
	.checkbox {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		border: 2px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}
	.checkbox.checked {
		background: var(--accent-primary);
		border-color: var(--accent-primary);
	}
	.checkbox :global(svg) {
		width: 12px;
		height: 12px;
		color: var(--bg-primary);
	}

	/* Pagination */
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

	/* Selection bar */
	.selection-bar {
		position: fixed;
		bottom: calc(var(--bottom-nav-height, 64px) + 8px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-sm) var(--space-sm) var(--space-lg);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		z-index: 50;
		animation: slide-up 0.2s ease;
	}
	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
	.selection-count {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
	}
	.selection-delete-btn {
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-full);
		border: none;
		background: var(--error);
		color: var(--text-primary);
		font-size: 0.8125rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 0.1s ease;
		white-space: nowrap;
	}
	.selection-delete-btn:active {
		transform: scale(0.97);
	}
</style>

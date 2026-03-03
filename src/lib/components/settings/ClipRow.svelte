<script lang="ts">
	import PlatformIcon from '$lib/components/PlatformIcon.svelte';
	import { formatSize, formatDate } from '$lib/clipsManager';
	import { basename } from '$lib/utils';
	import type { ClipSummary } from '$lib/types';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';

	let {
		clip,
		selected = false,
		ontoggle,
		ondelete
	}: {
		clip: ClipSummary;
		selected?: boolean;
		ontoggle: (id: string) => void;
		ondelete: (clip: ClipSummary) => void;
	} = $props();
</script>

<div class="clip-row" class:selected>
	<button class="clip-select-btn" onclick={() => ontoggle(clip.id)}>
		<div class="checkbox" class:checked={selected}>
			{#if selected}
				<CheckIcon size={12} weight="bold" />
			{/if}
		</div>
	</button>

	<div class="clip-thumb">
		{#if clip.thumbnailPath}
			<img src="/api/thumbnails/{basename(clip.thumbnailPath)}" alt="" />
		{:else}
			<div class="clip-thumb-placeholder">
				<PlatformIcon platform={clip.platform} size={16} />
			</div>
		{/if}
	</div>

	<div class="clip-info">
		<div class="clip-title-row">
			<span class="clip-title">{clip.title || 'Untitled'}</span>
			<PlatformIcon platform={clip.platform} size={12} />
		</div>
		<span class="clip-meta">
			{clip.addedByUsername} &middot; {formatDate(clip.createdAt)}
		</span>
	</div>

	<div class="clip-actions">
		<span class="clip-size">{formatSize(clip.sizeMb)}</span>
		<button class="clip-delete-btn" onclick={() => ondelete(clip)} aria-label="Delete clip">
			<XIcon size={14} />
		</button>
	</div>
</div>

<style>
	.clip-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--bg-surface);
		transition: background 0.15s ease;
	}
	.clip-row:last-child {
		border-bottom: none;
	}
	.clip-row.selected {
		background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
	}

	.clip-select-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
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

	.clip-thumb {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-surface);
	}
	.clip-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.clip-thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
	}

	.clip-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.clip-title-row {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.clip-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.clip-meta {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	.clip-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-shrink: 0;
	}

	.clip-size {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.clip-delete-btn {
		width: 28px;
		height: 28px;
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
	.clip-delete-btn:hover {
		color: var(--error);
		background: color-mix(in srgb, var(--error) 10%, transparent);
	}
	.clip-delete-btn :global(svg) {
		width: 14px;
		height: 14px;
	}
</style>

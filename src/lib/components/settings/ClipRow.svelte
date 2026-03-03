<script lang="ts">
	import PlatformIcon from '$lib/components/PlatformIcon.svelte';
	import { formatSize, formatDate } from '$lib/clipsManager';
	import { basename } from '$lib/utils';
	import { toast } from '$lib/stores/toasts';
	import type { ClipSummary } from '$lib/types';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';

	let {
		clip,
		selected = false,
		ontoggle,
		ondelete,
		oncaptionupdate
	}: {
		clip: ClipSummary;
		selected?: boolean;
		ontoggle: (id: string) => void;
		ondelete: (clip: ClipSummary) => void;
		oncaptionupdate?: (id: string, title: string | null) => void;
	} = $props();

	let expanded = $state(false);
	let editing = $state(false);
	let editValue = $state('');
	let saving = $state(false);
	let refetching = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);

	function startEdit() {
		editValue = clip.title || '';
		editing = true;
		requestAnimationFrame(() => inputEl?.focus());
	}

	function cancelEdit() {
		editing = false;
	}

	async function saveEdit() {
		if (!editing || saving) return;
		const newCaption = editValue.trim();
		if (newCaption === (clip.title || '').trim()) {
			editing = false;
			return;
		}

		saving = true;
		try {
			const res = await fetch(`/api/clips/${clip.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newCaption })
			});
			if (res.ok) {
				oncaptionupdate?.(clip.id, newCaption || null);
				toast.success('Caption saved');
			} else {
				toast.error('Failed to save caption');
			}
		} catch {
			toast.error('Failed to save caption');
		}
		saving = false;
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	}

	async function handleRefetch() {
		if (refetching) return;
		refetching = true;
		try {
			const res = await fetch(`/api/clips/${clip.id}/refetch`, { method: 'POST' });
			if (res.ok) {
				const data = await res.json();
				if (data.title) {
					oncaptionupdate?.(clip.id, data.title);
				}
				toast.success('Caption refreshed');
			} else {
				const data = await res.json().catch(() => null);
				toast.error(data?.error ?? 'Failed to refresh caption');
			}
		} catch {
			toast.error('Failed to refresh caption');
		}
		refetching = false;
	}
</script>

<div class="clip-row" class:selected class:expanded>
	<button
		class="clip-select-btn"
		onclick={(e) => {
			e.stopPropagation();
			ontoggle(clip.id);
		}}
	>
		<div class="checkbox" class:checked={selected}>
			{#if selected}
				<CheckIcon size={12} weight="bold" />
			{/if}
		</div>
	</button>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="clip-main" onclick={() => (expanded = !expanded)}>
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

		<div class="clip-end">
			<span class="clip-size">{formatSize(clip.sizeMb)}</span>
		</div>
	</div>

	<button
		class="clip-delete-btn"
		onclick={(e) => {
			e.stopPropagation();
			ondelete(clip);
		}}
		aria-label="Delete clip"
	>
		<TrashIcon size={14} />
	</button>
</div>

{#if expanded}
	<div class="clip-expanded">
		{#if editing}
			<div class="edit-area">
				<textarea
					bind:this={inputEl}
					bind:value={editValue}
					autocomplete="off"
					onkeydown={handleKeydown}
					onclick={(e) => e.stopPropagation()}
					maxlength={500}
					rows={2}
					placeholder="Add a caption…"
				></textarea>
				<div class="edit-hint">
					<span>Enter to save &middot; Esc to cancel</span>
				</div>
			</div>
		{:else}
			{#if clip.title}
				<p class="clip-caption">{clip.title}</p>
			{:else}
				<p class="clip-caption empty">No caption</p>
			{/if}
			<div class="clip-expanded-actions">
				<button class="expanded-action-btn" onclick={startEdit}>
					<PencilSimpleIcon size={13} />
					<span>Edit</span>
				</button>
				<button
					class="expanded-action-btn"
					class:refetching
					onclick={handleRefetch}
					disabled={refetching}
				>
					<ArrowsClockwiseIcon size={13} />
					<span>{refetching ? 'Refreshing…' : 'Refetch'}</span>
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.clip-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--bg-surface);
		transition: background 0.15s ease;
		cursor: pointer;
	}
	.clip-row:last-child:not(.expanded) {
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

	.clip-main {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1;
		min-width: 0;
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

	.clip-end {
		display: flex;
		align-items: center;
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

	/* Expanded area */
	.clip-expanded {
		padding: var(--space-sm) var(--space-md) var(--space-md);
		padding-left: calc(var(--space-md) + 20px + var(--space-sm));
		border-bottom: 1px solid var(--bg-surface);
		animation: expand-in 0.15s ease;
	}
	.clip-expanded:last-child {
		border-bottom: none;
	}

	@keyframes expand-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.clip-caption {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
		margin: 0 0 var(--space-sm);
		word-break: break-word;
	}
	.clip-caption.empty {
		color: var(--text-muted);
		font-style: italic;
	}

	.clip-expanded-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.expanded-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-full);
		border: 1px solid var(--border);
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.expanded-action-btn:hover {
		color: var(--text-primary);
		border-color: var(--text-muted);
	}
	.expanded-action-btn:active {
		transform: scale(0.97);
	}
	.expanded-action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.expanded-action-btn.refetching :global(svg) {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Inline edit */
	.edit-area {
		animation: expand-in 0.15s ease;
	}
	.edit-area textarea {
		width: 100%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.8125rem;
		line-height: 1.4;
		padding: var(--space-sm);
		resize: none;
		outline: none;
		font-family: var(--font-body);
	}
	.edit-area textarea::placeholder {
		color: var(--text-muted);
	}
	.edit-area textarea:focus {
		border-color: var(--accent-primary);
	}
	.edit-hint {
		margin-top: var(--space-xs);
	}
	.edit-hint span {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}
</style>

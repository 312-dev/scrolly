<script lang="ts">
	import { toast } from '$lib/stores/toasts';

	let {
		clipId,
		caption,
		canDelete,
		expanded,
		onexpandtoggle,
		ondelete,
		confirmingDelete = $bindable(false)
	}: {
		clipId: string;
		caption: string | null;
		canDelete: boolean;
		expanded: boolean;
		onexpandtoggle: () => void;
		ondelete?: (clipId: string) => void;
		confirmingDelete?: boolean;
	} = $props();

	let deleting = $state(false);

	async function handleDelete() {
		if (deleting) return;
		deleting = true;
		try {
			const res = await fetch(`/api/clips/${clipId}`, { method: 'DELETE' });
			if (res.ok) {
				ondelete?.(clipId);
			} else {
				toast.error('Failed to delete clip');
			}
		} catch {
			toast.error('Failed to delete clip');
		}
		deleting = false;
		confirmingDelete = false;
	}
</script>

{#if caption}
	<div class="caption-area">
		<button
			type="button"
			class="overlay-caption"
			class:expanded
			onclick={(e) => {
				e.stopPropagation();
				onexpandtoggle();
			}}
		>
			{caption}
		</button>
	</div>
{/if}
{#if confirmingDelete && canDelete}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="confirm-row"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<span class="confirm-label">Delete this clip?</span>
		<button class="host-action-btn confirm-yes" onclick={handleDelete} disabled={deleting}>
			{deleting ? 'Deleting...' : 'Yes'}
		</button>
		<span class="host-action-dot">·</span>
		<button class="host-action-btn" onclick={() => (confirmingDelete = false)}>No</button>
	</div>
{/if}

<style>
	.caption-area {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
	}
	.overlay-caption {
		margin: 0;
		padding: 0;
		background: none;
		border: none;
		font: inherit;
		text-align: left;
		font-size: 0.875rem;
		color: var(--reel-text-bright);
		text-shadow: 0 1px 4px var(--reel-text-shadow);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		cursor: pointer;
		flex: 1;
	}
	.overlay-caption.expanded {
		-webkit-line-clamp: unset;
		line-clamp: unset;
		display: block;
	}
	.confirm-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: var(--space-xs);
		animation: fade-in 0.15s ease;
	}
	.host-action-btn {
		background: none;
		border: none;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--reel-text-faint);
		cursor: pointer;
		padding: 0;
		text-shadow: 0 1px 3px var(--reel-text-shadow);
		transition: color 0.15s ease;
	}
	.host-action-btn:active {
		color: var(--reel-text-dim);
	}
	.host-action-btn.confirm-yes {
		color: var(--error);
	}
	.host-action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.host-action-dot {
		color: var(--reel-text-disabled);
		font-size: 0.6875rem;
		user-select: none;
	}
	.confirm-label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--reel-text-subtle);
		text-shadow: 0 1px 3px var(--reel-text-shadow);
		margin-right: 2px;
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

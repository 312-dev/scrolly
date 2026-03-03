<script lang="ts">
	import PlatformIcon from './PlatformIcon.svelte';
	import ReelOverlayActions from './ReelOverlayActions.svelte';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import { toast } from '$lib/stores/toasts';

	let {
		platform,
		creatorName = null,
		creatorUrl = null,
		contentType = 'video',
		caption,
		canDelete = false,
		canRefetch = false,
		canEditCaption = false,
		clipId = '',
		uiHidden = false,
		expanded = $bindable(false),
		oncaptionedit,
		ondelete
	}: {
		platform: string;
		creatorName?: string | null;
		creatorUrl?: string | null;
		contentType?: string;
		caption: string | null;
		canDelete?: boolean;
		canRefetch?: boolean;
		canEditCaption?: boolean;
		clipId?: string;
		uiHidden?: boolean;
		expanded?: boolean;
		oncaptionedit?: (clipId: string, newCaption: string | null) => void;
		ondelete?: (clipId: string) => void;
	} = $props();
	let confirmingDelete = $state(false);
	let editing = $state(false);
	let refetching = $state(false);

	async function handleRefetch() {
		if (refetching) return;
		refetching = true;
		try {
			const res = await fetch(`/api/clips/${clipId}/refetch`, { method: 'POST' });
			if (res.ok) {
				toast.success('Caption refreshed');
				// Reload the page to show updated caption
				window.location.reload();
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

<!-- eslint-disable svelte/no-navigation-without-resolve -- external creator URL -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="reel-overlay"
	class:ui-hidden={uiHidden}
	class:caption-expanded={expanded}
	onpointerdown={(e) => e.stopPropagation()}
	ontouchstart={(e) => e.stopPropagation()}
	ontouchmove={(e) => e.stopPropagation()}
	ontouchend={(e) => e.stopPropagation()}
>
	<div class="overlay-content">
		<div class="overlay-user">
			{#if contentType !== 'music' && creatorName}
				{#if creatorUrl}
					<a
						href={creatorUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="username"
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => e.stopPropagation()}>{creatorName}</a
					>
				{:else}
					<span class="username">{creatorName}</span>
				{/if}
				<span class="platform-badge"><PlatformIcon {platform} size={12} /></span>
			{/if}
			{#if (canDelete || canRefetch || canEditCaption) && !confirmingDelete && !editing}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="host-actions-inline"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					{#if canEditCaption}
						<button
							class="host-icon-btn"
							onclick={() => (editing = true)}
							aria-label="Edit caption"
						>
							<PencilSimpleIcon size={13} />
						</button>
					{/if}
					{#if canRefetch}
						<button
							class="host-icon-btn"
							class:refetching
							onclick={handleRefetch}
							disabled={refetching}
							aria-label="Refresh caption"
						>
							<ArrowsClockwiseIcon size={13} />
						</button>
					{/if}
					{#if canDelete}
						<button
							class="host-icon-btn delete"
							onclick={() => (confirmingDelete = true)}
							aria-label="Delete clip"
						>
							<TrashIcon size={13} />
						</button>
					{/if}
				</span>
			{/if}
		</div>

		<ReelOverlayActions
			{clipId}
			{caption}
			{canDelete}
			{expanded}
			onexpandtoggle={() => (expanded = !expanded)}
			{oncaptionedit}
			{ondelete}
			bind:editing
			bind:confirmingDelete
		/>
	</div>
</div>

<style>
	.reel-overlay {
		position: absolute;
		bottom: 70px;
		left: var(--space-lg);
		right: var(--space-lg);
		z-index: 5;
		transition: opacity 0.3s ease;
	}
	.reel-overlay.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}
	.reel-overlay.caption-expanded {
		z-index: 12;
	}
	.overlay-content {
		margin-right: 64px;
	}
	.overlay-user {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-xs);
	}
	.username {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.875rem;
		color: var(--reel-text);
		text-shadow: 0 1px 4px var(--reel-text-shadow);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.username:active {
		opacity: 0.7;
	}
	.platform-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: var(--radius-full);
		background: var(--reel-frosted-bg);
		color: var(--reel-text-medium);
		flex-shrink: 0;
	}
	.host-actions-inline {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.host-icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		border-radius: var(--radius-full);
		color: var(--reel-text-ghost);
		cursor: pointer;
		padding: 0;
		transition: color 0.15s ease;
	}
	.host-icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		filter: drop-shadow(0 1px 2px var(--reel-icon-shadow));
	}
	.host-icon-btn:active {
		color: var(--reel-text-dim);
		transform: scale(0.9);
	}
	.host-icon-btn.delete:active {
		color: var(--error);
	}
	.host-icon-btn.refetching {
		animation: spin 0.8s linear infinite;
		opacity: 0.6;
		pointer-events: none;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>

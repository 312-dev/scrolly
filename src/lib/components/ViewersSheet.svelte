<script lang="ts">
	import { relativeTime } from '$lib/utils';
	import BaseSheet from './BaseSheet.svelte';

	interface Viewer {
		userId: string;
		username: string;
		avatarPath: string | null;
		watchPercent: number;
		status: 'viewed' | 'skipped';
		watchedAt: string;
	}

	const {
		clipId,
		ondismiss
	}: {
		clipId: string;
		ondismiss: () => void;
	} = $props();

	let viewers = $state<Viewer[]>([]);
	let loading = $state(true);
	let sheetRef = $state<ReturnType<typeof BaseSheet> | null>(null);

	// Load viewers
	$effect(() => {
		loadViewers();
	});

	async function loadViewers() {
		loading = true;
		const res = await fetch(`/api/clips/${clipId}/views`);
		if (res.ok) {
			const data = await res.json();
			viewers = data.views;
		}
		loading = false;
	}
</script>

<div class="viewers-sheet-wrapper">
	<BaseSheet
		bind:this={sheetRef}
		title="Views{viewers.length > 0 ? ` (${viewers.length})` : ''}"
		sheetId="viewers"
		{ondismiss}
	>
		<div class="viewers-list">
			{#if loading}
				<p class="empty">Loading...</p>
			{:else if viewers.length === 0}
				<p class="empty">No views yet</p>
			{:else}
				{#each viewers as viewer (viewer.userId)}
					<div class="viewer-row">
						<div class="viewer-avatar">
							{#if viewer.avatarPath}
								<img src="/api/profile/avatar/{viewer.avatarPath}" alt="" class="avatar-img" />
							{:else}
								<span class="avatar-initial">{viewer.username.charAt(0).toUpperCase()}</span>
							{/if}
						</div>
						<div class="viewer-info">
							<span class="viewer-name">{viewer.username}</span>
							<span class="viewer-time">{relativeTime(viewer.watchedAt)}</span>
						</div>
						<span
							class="status-badge"
							class:viewed={viewer.status === 'viewed'}
							class:skipped={viewer.status === 'skipped'}
						>
							{viewer.status === 'viewed' ? 'Viewed' : 'Skipped'}
						</span>
					</div>
				{/each}
			{/if}
		</div>
	</BaseSheet>
</div>

<style>
	/* Override BaseSheet styles for viewers-specific look */
	.viewers-sheet-wrapper :global(.base-sheet) {
		height: 50vh;
	}
	.viewers-sheet-wrapper :global(.base-header) {
		border-bottom-color: var(--bg-subtle);
	}

	.viewers-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-md) var(--space-lg);
		padding-bottom: max(var(--space-md), env(safe-area-inset-bottom));
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
	}

	.empty {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-2xl);
		margin: 0;
	}

	.viewer-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
	}

	.viewer-avatar {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background: var(--accent-magenta);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-full);
		object-fit: cover;
	}

	.avatar-initial {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.875rem;
	}

	.viewer-info {
		flex: 1;
		min-width: 0;
	}

	.viewer-name {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.viewer-time {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.status-badge {
		padding: 3px 10px;
		border-radius: var(--radius-full);
		font-size: 0.6875rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.status-badge.viewed {
		background: rgba(56, 161, 105, 0.15);
		color: var(--success);
	}

	.status-badge.skipped {
		background: rgba(251, 191, 36, 0.15);
		color: var(--warning);
	}
</style>

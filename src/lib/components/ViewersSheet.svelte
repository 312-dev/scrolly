<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { relativeTime } from '$lib/utils';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon';

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
	let visible = $state(false);

	// Intercept back navigation to dismiss the panel without affecting parent history.
	// Unlike pushState/popstate, beforeNavigate cancels the navigation so stacked
	// popstate handlers (ClipOverlay, favorites reel, etc.) don't also fire.
	beforeNavigate(({ cancel, type }) => {
		if (type === 'popstate') {
			cancel();
			dismiss();
		}
	});

	// Animate in, lock scroll
	$effect(() => {
		requestAnimationFrame(() => {
			visible = true;
		});
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = '';
		};
	});

	// Load viewers on mount
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

	function dismiss() {
		visible = false;
		setTimeout(() => ondismiss(), 300);
	}
</script>

<div class="overlay" class:visible onclick={dismiss} onkeydown={() => {}} role="presentation"></div>

<div class="sheet" class:visible>
	<div class="header">
		<span class="header-title">Views{viewers.length > 0 ? ` (${viewers.length})` : ''}</span>
		<button class="close-btn" onclick={dismiss} aria-label="Close viewers">
			<XIcon size={18} />
		</button>
	</div>

	<div class="content">
		{#if loading}
			<div class="viewers-empty">
				<span class="spinner"></span>
			</div>
		{:else if viewers.length === 0}
			<div class="viewers-empty">
				<div class="empty-icon">
					<EyeIcon size={48} />
				</div>
				<p class="empty-title">No views yet</p>
				<p class="empty-sub">When others watch this clip, they'll show up here</p>
			</div>
		{:else}
			<div class="viewer-list">
				{#each viewers as viewer, i (viewer.userId)}
					<div class="viewer-row" style="animation-delay: {Math.min(i, 15) * 30}ms">
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
							{viewer.status === 'skipped' ? 'Skipped' : 'Viewed'}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 99;
		opacity: 0;
		transition: opacity 300ms ease;
	}

	.overlay.visible {
		opacity: 1;
	}

	.sheet {
		position: fixed;
		top: calc(56px + env(safe-area-inset-top));
		left: var(--space-lg);
		width: calc(100vw - 2 * var(--space-lg));
		max-width: 400px;
		max-height: 65vh;
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		z-index: 100;
		display: flex;
		flex-direction: column;
		transform-origin: top left;
		transform: scale(0.9);
		opacity: 0;
		transition:
			transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
			opacity 200ms ease;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
	}

	.sheet.visible {
		transform: scale(1);
		opacity: 1;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		position: relative;
	}

	.header-title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.0625rem;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}

	.close-btn {
		position: absolute;
		right: var(--space-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.close-btn:active {
		background: var(--bg-subtle);
	}

	.close-btn :global(svg) {
		width: 18px;
		height: 18px;
	}

	.content {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
		padding: 0 var(--space-sm) var(--space-lg);
	}

	.viewers-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-3xl) var(--space-lg);
		gap: var(--space-sm);
	}

	.empty-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		margin-bottom: var(--space-sm);
	}

	.empty-icon :global(svg) {
		width: 48px;
		height: 48px;
		opacity: 0.4;
	}

	.empty-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.empty-sub {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
		text-align: center;
		max-width: 240px;
		line-height: 1.4;
	}

	.viewer-list {
		display: flex;
		flex-direction: column;
	}

	.viewer-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-sm);
		border-radius: var(--radius-sm);
		animation: viewer-in 250ms cubic-bezier(0.32, 0.72, 0, 1) both;
	}

	@keyframes viewer-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.viewer-avatar {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-full);
		object-fit: cover;
	}

	.avatar-initial {
		color: var(--text-secondary);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1rem;
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

	.spinner {
		display: inline-block;
		width: 32px;
		height: 32px;
		border: 2.5px solid var(--bg-subtle);
		border-top-color: var(--text-primary);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

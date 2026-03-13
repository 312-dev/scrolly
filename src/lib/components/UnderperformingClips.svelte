<script lang="ts">
	import { slide } from 'svelte/transition';
	import { basename } from '$lib/utils';
	import PlatformIcon from './PlatformIcon.svelte';

	interface Underperformer {
		clipId: string;
		title: string | null;
		platform: string;
		originalUrl: string;
		thumbnailPath: string | null;
	}

	let { clips, ondismiss }: { clips: Underperformer[]; ondismiss: () => void } = $props();

	let expanded = $state(false);

	function clipTitle(clip: Underperformer): string {
		if (clip.title) return clip.title;
		try {
			return new URL(clip.originalUrl).hostname;
		} catch {
			return clip.originalUrl;
		}
	}
</script>

<div class="underperforming">
	<button class="expand-toggle" onclick={() => (expanded = !expanded)}>
		<span class="expand-label">Dragging your rank down</span>
		<span class="expand-count">{clips.length}</span>
		<span class="expand-chevron" class:open={expanded}>‹</span>
	</button>
	{#if expanded}
		<div class="clip-carousel" transition:slide={{ duration: 250 }}>
			{#each clips.slice(0, 8) as clip (clip.clipId)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="clip-card" href="/?clip={clip.clipId}" onclick={ondismiss}>
					<div class="clip-thumb">
						{#if clip.thumbnailPath}
							<img src="/api/thumbnails/{basename(clip.thumbnailPath)}" alt="" />
						{:else}
							<div class="thumb-placeholder">
								<PlatformIcon platform={clip.platform} size={20} />
							</div>
						{/if}
					</div>
					<span class="clip-caption">{clipTitle(clip)}</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.underperforming {
		border-top: 1px solid var(--border);
		padding-top: var(--space-lg);
		margin-left: calc(-1 * var(--space-xl));
		margin-right: calc(-1 * var(--space-xl));
		padding-left: var(--space-xl);
		padding-right: 0;
	}
	.clip-carousel {
		display: flex;
		gap: var(--space-md);
		overflow-x: auto;
		scroll-snap-type: x proximity;
		-webkit-overflow-scrolling: touch;
		padding-bottom: var(--space-sm);
		padding-right: var(--space-xl);
	}
	.clip-carousel::-webkit-scrollbar {
		display: none;
	}
	.clip-card {
		flex-shrink: 0;
		width: 88px;
		scroll-snap-align: start;
		text-decoration: none;
	}
	.clip-thumb {
		width: 100%;
		aspect-ratio: 9 / 14;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--bg-subtle);
		margin-bottom: var(--space-xs);
		position: relative;
	}
	.clip-thumb img {
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
	.expand-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		width: calc(100% - var(--space-xl));
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		margin-bottom: var(--space-sm);
	}
	.expand-toggle:active {
		background: var(--bg-surface);
	}
	.expand-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	.expand-count {
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--text-muted);
		background: var(--bg-surface);
		min-width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
	}
	.expand-chevron {
		font-size: 0.875rem;
		color: var(--text-muted);
		transition: transform 0.25s ease;
		transform: rotate(-90deg);
		margin-left: auto;
	}
	.expand-chevron.open {
		transform: rotate(0deg);
	}
	.clip-caption {
		font-size: 0.6875rem;
		color: var(--text-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.3;
	}
</style>

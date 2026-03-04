<script lang="ts">
	import { tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { basename } from '$lib/utils';
	import { createOverlayHistory } from '$lib/overlayHistory';
	import type { FeedClip } from '$lib/types';
	import ReelItem from './ReelItem.svelte';
	import ViewBadge from './ViewBadge.svelte';
	import ViewersSheet from './ViewersSheet.svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';

	const {
		clips,
		startIndex = 0,
		currentUserId,
		isHost,
		gifEnabled,
		onclose,
		onwatched,
		onfavorited,
		onreaction,
		onretry,
		ondelete
	}: {
		clips: FeedClip[];
		startIndex?: number;
		currentUserId: string;
		isHost: boolean;
		gifEnabled: boolean;
		onclose: () => void;
		onwatched: (clipId: string) => Promise<void>;
		onfavorited: (clipId: string) => Promise<void>;
		onreaction: (clipId: string, emoji: string) => Promise<void>;
		onretry: (clipId: string) => Promise<void>;
		ondelete: (clipId: string) => void;
	} = $props();

	let activeIndex = $state(startIndex);
	let reelContainer = $state<HTMLDivElement | null>(null);
	let showViewers = $state(false);
	const renderWindow = 2;
	let dismissed = false;

	$effect(() => {
		if (activeIndex >= 0) showViewers = false;
	});

	const overlay = createOverlayHistory('meReel', true);
	beforeNavigate(overlay.onBeforeNavigate);

	// Mount: push history state, scroll to start index
	$effect(() => {
		const cleanupHistory = overlay.attach(close);

		tick().then(() => {
			if (reelContainer) reelContainer.scrollTop = startIndex * reelContainer.clientHeight;
		});

		return cleanupHistory;
	});

	// Keyboard navigation for reels
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				scrollToIndex(activeIndex + 1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				scrollToIndex(activeIndex - 1);
			}
		}
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});

	// Intersection observer for active index
	$effect(() => {
		if (!reelContainer) return;
		// eslint-disable-next-line sonarjs/void-use -- re-run when clips change
		void clips.length;
		const slots = reelContainer.querySelectorAll('.reel-slot');
		if (slots.length === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
						const idx = Number((entry.target as HTMLElement).dataset.index);
						if (!isNaN(idx)) activeIndex = idx;
					}
				}
			},
			{ root: reelContainer, threshold: 0.5 }
		);
		slots.forEach((slot) => observer.observe(slot));
		return () => observer.disconnect();
	});

	function close() {
		if (dismissed) return;
		dismissed = true;
		onclose();
	}

	function scrollToIndex(index: number) {
		if (!reelContainer || index < 0) return;
		const slots = reelContainer.querySelectorAll('.reel-slot');
		if (index >= slots.length) return;
		(slots[index] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth' });
	}
</script>

<div class="me-reel">
	<div class="reel-topbar">
		<button class="reel-close" onclick={close} aria-label="Back to grid">
			<ArrowLeftIcon size={22} />
		</button>
		{#if clips[activeIndex]?.viewCount > 0}
			<ViewBadge viewCount={clips[activeIndex].viewCount} ontap={() => (showViewers = true)} />
		{/if}
	</div>
	<div class="reel-scroll" bind:this={reelContainer}>
		{#each clips as clip, i (clip.id)}
			<div class="reel-slot" data-index={i}>
				{#if Math.abs(i - activeIndex) <= renderWindow}
					<ReelItem
						{clip}
						{currentUserId}
						{isHost}
						active={i === activeIndex}
						index={i}
						autoScroll={false}
						{gifEnabled}
						seenByOthers={clip.seenByOthers}
						hideViewBadge={true}
						{onwatched}
						{onfavorited}
						{onreaction}
						{onretry}
						onended={() => scrollToIndex(i + 1)}
						{ondelete}
					/>
				{:else}
					<div class="reel-placeholder">
						{#if clip.thumbnailPath}
							<img
								src="/api/thumbnails/{basename(clip.thumbnailPath)}"
								alt=""
								class="placeholder-thumb"
								loading="lazy"
							/>
						{:else if clip.albumArt}
							<img
								src={clip.albumArt}
								alt=""
								class="placeholder-thumb placeholder-thumb-cover"
								loading="lazy"
							/>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

{#if showViewers && clips[activeIndex]}
	<ViewersSheet clipId={clips[activeIndex].id} ondismiss={() => (showViewers = false)} />
{/if}

<style>
	.me-reel {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: calc(var(--bottom-nav-height, 64px) - 1px);
		z-index: 40;
		background: var(--reel-bg);
		overscroll-behavior-x: none;
	}
	.reel-topbar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		padding: max(var(--space-md), env(safe-area-inset-top)) var(--space-lg) 0;
		z-index: 10;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		min-height: calc(max(var(--space-md), env(safe-area-inset-top)) + 40px);
		pointer-events: none;
	}
	.reel-close {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-full);
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: none;
		color: var(--reel-text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
		transition: transform 0.15s ease;
		pointer-events: auto;
	}
	.reel-close:active {
		transform: scale(0.93);
	}
	.reel-close :global(svg) {
		width: 22px;
		height: 22px;
	}
	.reel-topbar :global(.view-badge) {
		pointer-events: auto;
	}
	.reel-scroll {
		height: 100%;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: none;
		scrollbar-width: none;
		&::-webkit-scrollbar {
			display: none;
		}
	}
	.reel-slot {
		height: 100%;
		width: 100%;
		scroll-snap-align: start;
		scroll-snap-stop: always;
		position: relative;
		overflow: hidden;
	}
	.reel-placeholder {
		height: 100%;
		width: 100%;
		background: var(--bg-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.placeholder-thumb {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.placeholder-thumb-cover {
		object-fit: cover;
	}
</style>

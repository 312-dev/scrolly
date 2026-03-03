<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import type { FeedClip } from '$lib/types';
	import {
		fetchClips,
		markClipWatched,
		toggleClipFavorite,
		sendClipReaction,
		retryClipDownload
	} from '$lib/feed';
	import { fetchUnwatchedCount } from '$lib/stores/notifications';
	import { toast } from '$lib/stores/toasts';
	import ReelItem from '$lib/components/ReelItem.svelte';
	import ViewBadge from '$lib/components/ViewBadge.svelte';
	import ViewersSheet from '$lib/components/ViewersSheet.svelte';
	import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import FilmStripIcon from 'phosphor-svelte/lib/FilmStripIcon';
	import MusicNoteIcon from 'phosphor-svelte/lib/MusicNoteIcon';

	let clips = $state<FeedClip[]>([]);
	let loading = $state(true);
	let viewMode = $state<'grid' | 'reel'>('grid');
	let activeIndex = $state(0);
	let reelContainer: HTMLDivElement | null = $state(null);
	let showViewers = $state(false);

	// Push a history entry when reel opens so back gesture closes it, not navigates away.
	let reelClosedViaBack = false;
	let reelDismissed = false;

	function onReelPopState() {
		// Defer so page.state is updated before we inspect it. If favReel is still
		// set, a sheet on top closed — don't dismiss the reel. If gone, close it.
		setTimeout(() => {
			if (page.state.favReel || viewMode !== 'reel') return;
			reelClosedViaBack = true;
			closeReel();
		}, 0);
	}

	$effect(() => {
		// eslint-disable-next-line sonarjs/void-use -- read activeIndex to re-run on scroll
		void activeIndex;
		showViewers = false;
	});

	const currentUserId = $derived(page.data.user?.id ?? '');
	const gifEnabled = $derived(!!page.data.gifEnabled);
	const renderWindow = 2;

	async function loadFavorites() {
		loading = true;
		const data = await fetchClips('favorites', 50);
		if (data) clips = data.clips;
		loading = false;
	}

	async function openReel(index: number) {
		activeIndex = index;
		reelClosedViaBack = false;
		reelDismissed = false;
		viewMode = 'reel';
		pushState('', { favReel: true });
		window.addEventListener('popstate', onReelPopState);
		await tick();
		if (reelContainer) {
			reelContainer.scrollTop = index * reelContainer.clientHeight;
		}
	}

	async function closeReel() {
		if (reelDismissed) return;
		reelDismissed = true;
		window.removeEventListener('popstate', onReelPopState);
		if (!reelClosedViaBack) history.back();
		viewMode = 'grid';
		// Re-fetch to remove any clips un-favorited while browsing the reel
		await loadFavorites();
	}

	async function markWatched(clipId: string) {
		const clip = clips.find((c) => c.id === clipId);
		const wasUnwatched = clip && !clip.watched;
		await markClipWatched(clipId);
		clips = clips.map((c) =>
			c.id === clipId
				? { ...c, watched: true, viewCount: c.watched ? c.viewCount : c.viewCount + 1 }
				: c
		);
		if (wasUnwatched) fetchUnwatchedCount();
	}

	async function handleFavorite(clipId: string) {
		const data = await toggleClipFavorite(clipId);
		if (data) {
			clips = clips.map((c) => (c.id === clipId ? { ...c, favorited: data.favorited } : c));
		} else {
			toast.error('Failed to update favorite');
		}
	}

	async function handleReaction(clipId: string, emoji: string) {
		const data = await sendClipReaction(clipId, emoji);
		if (data) {
			clips = clips.map((c) => (c.id === clipId ? { ...c, reactions: data.reactions } : c));
		} else {
			toast.error('Failed to send reaction');
		}
	}

	function handleDelete(clipId: string) {
		const idx = clips.findIndex((c) => c.id === clipId);
		clips = clips.filter((c) => c.id !== clipId);
		if (activeIndex >= clips.length && clips.length > 0) activeIndex = clips.length - 1;
		else if (idx < activeIndex) activeIndex = Math.max(0, activeIndex - 1);
	}

	function handleCaptionEdit(clipId: string, newCaption: string) {
		clips = clips.map((c) => (c.id === clipId ? { ...c, title: newCaption } : c));
	}

	async function handleRetry(clipId: string) {
		const ok = await retryClipDownload(clipId);
		if (ok) {
			clips = clips.map((c) => (c.id === clipId ? { ...c, status: 'downloading' } : c));
		} else {
			toast.error('Failed to retry download');
		}
	}

	function scrollToIndex(index: number) {
		if (!reelContainer || index < 0) return;
		const slots = reelContainer.querySelectorAll('.reel-slot');
		if (index >= slots.length) return;
		const slot = slots[index] as HTMLElement | undefined;
		if (slot) slot.scrollIntoView({ behavior: 'smooth' });
	}

	$effect(() => {
		if (viewMode !== 'reel' || !reelContainer) return;
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

	function getThumbnailSrc(clip: FeedClip): string | null {
		if (clip.thumbnailPath) {
			return `/api/thumbnails/${clip.thumbnailPath.split('/').pop()}`;
		}
		if (clip.albumArt) return clip.albumArt;
		return null;
	}

	onMount(loadFavorites);
</script>

<div class="faves-page">
	{#if loading}
		<div class="loading-state">
			<span class="spinner"></span>
		</div>
	{:else if clips.length === 0}
		<div class="empty-state">
			<span class="empty-icon"><HeartIcon size={52} /></span>
			<p class="empty-title">No favorites yet</p>
			<p class="empty-sub">Heart a clip to save it here</p>
		</div>
	{:else}
		<div class="grid">
			{#each clips as clip, i (clip.id)}
				<button class="grid-cell" onclick={() => openReel(i)} aria-label={clip.title ?? 'Clip'}>
					{#if getThumbnailSrc(clip)}
						<img src={getThumbnailSrc(clip)} alt="" class="grid-thumb" loading="lazy" />
					{:else}
						<div class="grid-thumb-placeholder"></div>
					{/if}
					<span class="grid-content-type">
						{#if clip.contentType === 'music'}
							<MusicNoteIcon size={18} weight="fill" />
						{:else}
							<FilmStripIcon size={18} weight="fill" />
						{/if}
					</span>
					<span class="grid-avatar">
						{#if clip.addedByAvatar}
							<img
								src="/api/profile/avatar/{clip.addedByAvatar}"
								alt={clip.addedByUsername}
								class="grid-avatar-img"
							/>
						{:else}
							<span class="grid-avatar-initials">{clip.addedByUsername[0].toUpperCase()}</span>
						{/if}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if viewMode === 'reel'}
	<div class="faves-reel">
		<div class="reel-topbar">
			<button class="reel-close" onclick={closeReel} aria-label="Back to grid">
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
							active={i === activeIndex}
							index={i}
							autoScroll={false}
							{gifEnabled}
							canEditCaption={clip.addedBy === currentUserId}
							seenByOthers={clip.seenByOthers}
							hideViewBadge={true}
							onwatched={markWatched}
							onfavorited={handleFavorite}
							onreaction={handleReaction}
							onretry={handleRetry}
							onended={() => scrollToIndex(i + 1)}
							oncaptionedit={handleCaptionEdit}
							ondelete={handleDelete}
						/>
					{:else}
						<div class="reel-placeholder">
							{#if clip.thumbnailPath}
								<img
									src="/api/thumbnails/{clip.thumbnailPath.split('/').pop()}"
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
{/if}

{#if showViewers && clips[activeIndex]}
	<ViewersSheet clipId={clips[activeIndex].id} ondismiss={() => (showViewers = false)} />
{/if}

<style>
	.faves-page {
		margin-left: calc(-1 * var(--space-sm));
		margin-right: calc(-1 * var(--space-sm));
		margin-top: calc(-1 * var(--space-lg));
		min-height: calc(100dvh - var(--bottom-nav-height, 64px));
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
	}

	.grid-cell {
		position: relative;
		aspect-ratio: 1 / 1;
		overflow: hidden;
		background: var(--bg-elevated);
		border: none;
		padding: 0;
		cursor: pointer;
		display: block;
	}

	.grid-cell:active {
		opacity: 0.85;
	}
	.grid-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.grid-thumb-placeholder {
		width: 100%;
		height: 100%;
		background: var(--bg-surface);
	}
	.grid-content-type {
		position: absolute;
		bottom: var(--space-xs);
		left: var(--space-xs);
		display: flex;
		align-items: center;
		color: rgba(255, 255, 255, 0.85);
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
	}
	.grid-avatar {
		position: absolute;
		top: var(--space-xs);
		right: var(--space-xs);
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		overflow: hidden;
		border: 1.5px solid rgba(255, 255, 255, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-surface);
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
	}
	.grid-avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.grid-avatar-initials {
		font-size: 0.5625rem;
		font-weight: 700;
		color: var(--text-secondary);
		line-height: 1;
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.loading-state {
		height: 50dvh;
	}
	.empty-state {
		gap: var(--space-sm);
		padding: var(--space-3xl) var(--space-lg);
		min-height: 60dvh;
		text-align: center;
	}
	.empty-icon {
		color: var(--text-muted);
		opacity: 0.4;
		margin-bottom: var(--space-xs);
	}
	.empty-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.empty-sub {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
		max-width: 200px;
	}
	.spinner {
		display: inline-block;
		width: 28px;
		height: 28px;
		border: 2.5px solid var(--border);
		border-top-color: var(--accent-primary);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.faves-reel {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: var(--bottom-nav-height, 64px);
		z-index: 40;
		background: var(--bg-primary);
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
		color: #fff;
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

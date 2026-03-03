<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { basename } from '$lib/utils';
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
	import AvatarCropModal from '$lib/components/AvatarCropModal.svelte';
	import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import FilmStripIcon from 'phosphor-svelte/lib/FilmStripIcon';
	import MusicNoteIcon from 'phosphor-svelte/lib/MusicNoteIcon';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';

	const user = $derived(page.data.user);
	const group = $derived(page.data.group);
	const currentUserId = $derived(user?.id ?? '');
	const isHost = $derived(group?.createdBy === user?.id);
	const gifEnabled = $derived(!!page.data.gifEnabled);

	let stats = $state<{ uploads: number; saves: number; minutesWatched: number } | null>(null);

	async function loadStats() {
		try {
			const res = await fetch('/api/profile/stats');
			if (res.ok) stats = await res.json();
		} catch {
			/* non-critical */
		}
	}

	function formatWatchTime(minutes: number | null | undefined): string {
		if (minutes === null || minutes === undefined) return '--';
		if (minutes < 1) return '<1m';
		if (minutes < 60) return `${Math.round(minutes)}m`;
		return `${(minutes / 60).toFixed(1)}h`;
	}

	let avatarCropImage = $state<string | null>(null);
	let avatarOverride = $state<string | null | undefined>(undefined);
	let avatarCacheBust = $state(0);
	let avatarFileInput = $state<HTMLInputElement | null>(null);
	const avatarPath = $derived(
		avatarOverride !== undefined ? avatarOverride : (user?.avatarPath ?? null)
	);
	const avatarUrl = $derived(
		avatarPath ? `/api/profile/avatar/${avatarPath}?v=${avatarCacheBust}` : null
	);

	function handleAvatarFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) avatarCropImage = URL.createObjectURL(file);
		input.value = '';
	}
	function handleAvatarUploaded(path: string) {
		avatarOverride = path;
		avatarCacheBust = Date.now();
		avatarCropImage = null;
	}
	async function handleRemoveAvatar() {
		const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
		if (res.ok) avatarOverride = null;
	}

	let activeTab = $state<'faves' | 'uploads'>('faves');
	let faveClips = $state<FeedClip[]>([]);
	let uploadClips = $state<FeedClip[]>([]);
	let favesLoading = $state(true);
	let uploadsLoading = $state(false);
	let uploadsLoaded = $state(false);
	const displayClips = $derived(activeTab === 'faves' ? faveClips : uploadClips);
	const isLoading = $derived(activeTab === 'faves' ? favesLoading : uploadsLoading);

	async function loadFaves() {
		favesLoading = true;
		const data = await fetchClips('favorites', 100);
		if (data) faveClips = data.clips;
		favesLoading = false;
	}
	async function loadUploads() {
		uploadsLoading = true;
		const data = await fetchClips('uploads', 100);
		if (data) uploadClips = data.clips;
		uploadsLoading = false;
		uploadsLoaded = true;
	}
	function switchTab(tab: 'faves' | 'uploads') {
		activeTab = tab;
		if (tab === 'uploads' && !uploadsLoaded) loadUploads();
	}

	let viewMode = $state<'grid' | 'reel'>('grid');
	let activeIndex = $state(0);
	let reelContainer: HTMLDivElement | null = $state(null);
	let showViewers = $state(false);
	const renderWindow = 2;
	let reelClosedViaBack = false;
	let reelDismissed = false;

	function onReelPopState() {
		setTimeout(() => {
			if (page.state.meReel || viewMode !== 'reel') return;
			reelClosedViaBack = true;
			closeReel();
		}, 0);
	}
	$effect(() => {
		// eslint-disable-next-line sonarjs/void-use -- read activeIndex to re-run on scroll
		void activeIndex;
		showViewers = false;
	});

	async function openReel(index: number) {
		activeIndex = index;
		reelClosedViaBack = false;
		reelDismissed = false;
		viewMode = 'reel';
		pushState('', { meReel: true });
		window.addEventListener('popstate', onReelPopState);
		await tick();
		if (reelContainer) reelContainer.scrollTop = index * reelContainer.clientHeight;
	}
	async function closeReel() {
		if (reelDismissed) return;
		reelDismissed = true;
		window.removeEventListener('popstate', onReelPopState);
		if (!reelClosedViaBack) history.back();
		viewMode = 'grid';
		if (activeTab === 'faves') await loadFaves();
		else await loadUploads();
		loadStats();
	}

	function updateClip(clipId: string, updater: (c: FeedClip) => FeedClip) {
		if (activeTab === 'faves') faveClips = faveClips.map((c) => (c.id === clipId ? updater(c) : c));
		else uploadClips = uploadClips.map((c) => (c.id === clipId ? updater(c) : c));
	}
	async function markWatched(clipId: string) {
		const clip = displayClips.find((c) => c.id === clipId);
		const wasUnwatched = clip && !clip.watched;
		await markClipWatched(clipId);
		updateClip(clipId, (c) => ({
			...c,
			watched: true,
			viewCount: c.watched ? c.viewCount : c.viewCount + 1
		}));
		if (wasUnwatched) fetchUnwatchedCount();
	}
	async function handleFavorite(clipId: string) {
		const data = await toggleClipFavorite(clipId);
		if (data) updateClip(clipId, (c) => ({ ...c, favorited: data.favorited }));
		else toast.error('Failed to update favorite');
	}
	async function handleReaction(clipId: string, emoji: string) {
		const data = await sendClipReaction(clipId, emoji);
		if (data) updateClip(clipId, (c) => ({ ...c, reactions: data.reactions }));
		else toast.error('Failed to send reaction');
	}
	function handleDelete(clipId: string) {
		const idx = displayClips.findIndex((c) => c.id === clipId);
		if (activeTab === 'faves') faveClips = faveClips.filter((c) => c.id !== clipId);
		else uploadClips = uploadClips.filter((c) => c.id !== clipId);
		const remaining = activeTab === 'faves' ? faveClips : uploadClips;
		if (activeIndex >= remaining.length && remaining.length > 0) activeIndex = remaining.length - 1;
		else if (idx < activeIndex) activeIndex = Math.max(0, activeIndex - 1);
	}
	async function handleRetry(clipId: string) {
		const ok = await retryClipDownload(clipId);
		if (ok) updateClip(clipId, (c) => ({ ...c, status: 'downloading' }));
		else toast.error('Failed to retry download');
	}
	function scrollToIndex(index: number) {
		if (!reelContainer || index < 0) return;
		const slots = reelContainer.querySelectorAll('.reel-slot');
		if (index >= slots.length) return;
		(slots[index] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth' });
	}

	$effect(() => {
		if (viewMode !== 'reel' || !reelContainer) return;
		// eslint-disable-next-line sonarjs/void-use -- re-run when clips change
		void displayClips.length;
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
		if (clip.thumbnailPath) return `/api/thumbnails/${basename(clip.thumbnailPath)}`;
		if (clip.albumArt) return clip.albumArt;
		return null;
	}

	onMount(() => {
		loadFaves();
		loadStats();
	});
</script>

<svelte:head>
	<title>Me · {page.data.group?.name ?? 'scrolly'} · scrolly</title>
</svelte:head>

<div class="me-page">
	<div class="profile-section">
		<div class="profile-header">
			<input
				bind:this={avatarFileInput}
				type="file"
				accept="image/*"
				onchange={handleAvatarFileSelect}
				style="position:absolute;opacity:0;pointer-events:none;"
			/>
			<button class="avatar-btn" onclick={() => avatarFileInput?.click()}>
				{#if avatarUrl}
					<img src={avatarUrl} alt="Profile" class="avatar-large avatar-img" />
				{:else}
					<div class="avatar-large avatar-initials">
						{user?.username?.charAt(0)?.toUpperCase() ?? '?'}
					</div>
				{/if}
				<span class="avatar-edit-badge"><CameraIcon size={14} /></span>
			</button>
			{#if avatarPath}
				<button class="remove-photo-btn" onclick={handleRemoveAvatar}>Remove photo</button>
			{/if}
			<span class="profile-username">@{user?.username}</span>
		</div>
		<div class="stats-row">
			<div class="stat">
				<span class="stat-value">{stats?.uploads ?? '--'}</span><span class="stat-label"
					>Uploads</span
				>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{stats?.saves ?? '--'}</span><span class="stat-label">Saves</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{formatWatchTime(stats?.minutesWatched)}</span><span
					class="stat-label">Watched</span
				>
			</div>
		</div>
		<div class="tab-bar">
			<div
				class="tab-bg"
				style="transform: translateX({activeTab === 'faves' ? '0%' : '100%'})"
			></div>
			<button class="tab" class:active={activeTab === 'faves'} onclick={() => switchTab('faves')}
				>Faves</button
			>
			<button
				class="tab"
				class:active={activeTab === 'uploads'}
				onclick={() => switchTab('uploads')}>Uploads</button
			>
		</div>
	</div>
	{#if isLoading}
		<div class="loading-state"><span class="spinner"></span></div>
	{:else if displayClips.length === 0}
		<div class="empty-state">
			{#if activeTab === 'faves'}
				<span class="empty-icon"><HeartIcon size={48} /></span>
				<p class="empty-title">No favorites yet</p>
				<p class="empty-sub">Heart a clip to save it here</p>
			{:else}
				<span class="empty-icon"><UploadSimpleIcon size={48} /></span>
				<p class="empty-title">No uploads yet</p>
				<p class="empty-sub">Share a link to add your first clip</p>
			{/if}
		</div>
	{:else}
		<div class="grid">
			{#each displayClips as clip, i (clip.id)}
				{@const thumbSrc = getThumbnailSrc(clip)}
				<button class="grid-cell" onclick={() => openReel(i)} aria-label={clip.title ?? 'Clip'}>
					{#if thumbSrc}
						<img src={thumbSrc} alt="" class="grid-thumb" loading="lazy" />
					{:else}
						<div class="grid-thumb-placeholder"></div>
					{/if}
					<span class="grid-content-type">
						{#if clip.contentType === 'music'}<MusicNoteIcon size={18} weight="fill" />
						{:else}<FilmStripIcon size={18} weight="fill" />{/if}
					</span>
					{#if activeTab === 'faves'}
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
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if viewMode === 'reel'}
	<div class="me-reel">
		<div class="reel-topbar">
			<button class="reel-close" onclick={closeReel} aria-label="Back to grid"
				><ArrowLeftIcon size={22} /></button
			>
			{#if displayClips[activeIndex]?.viewCount > 0}
				<ViewBadge
					viewCount={displayClips[activeIndex].viewCount}
					ontap={() => (showViewers = true)}
				/>
			{/if}
		</div>
		<div class="reel-scroll" bind:this={reelContainer}>
			{#each displayClips as clip, i (clip.id)}
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
							onwatched={markWatched}
							onfavorited={handleFavorite}
							onreaction={handleReaction}
							onretry={handleRetry}
							onended={() => scrollToIndex(i + 1)}
							ondelete={handleDelete}
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
{/if}

{#if showViewers && displayClips[activeIndex]}
	<ViewersSheet clipId={displayClips[activeIndex].id} ondismiss={() => (showViewers = false)} />
{/if}

{#if avatarCropImage}
	<AvatarCropModal
		imageUrl={avatarCropImage}
		ondismiss={() => {
			if (avatarCropImage) URL.revokeObjectURL(avatarCropImage);
			avatarCropImage = null;
		}}
		onuploaded={handleAvatarUploaded}
	/>
{/if}

<style>
	.me-page {
		margin: calc(-1 * var(--space-lg)) calc(-1 * var(--space-sm)) 0;
		min-height: calc(100dvh - var(--bottom-nav-height, 64px));
	}
	.profile-section {
		padding: var(--space-lg) var(--space-lg) 0;
	}
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		padding-bottom: var(--space-lg);
	}
	.avatar-btn {
		position: relative;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		margin-bottom: var(--space-xs);
	}
	.avatar-btn:active {
		transform: scale(0.97);
	}
	.avatar-large {
		width: 80px;
		height: 80px;
		border-radius: var(--radius-full);
	}
	.avatar-initials {
		background: var(--bg-surface);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.75rem;
	}
	.avatar-img {
		object-fit: cover;
		display: block;
	}
	.avatar-edit-badge {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		background: var(--accent-primary);
		color: var(--bg-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.remove-photo-btn {
		border: none;
		background: none;
		color: var(--error);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
	.profile-username {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}
	.stats-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xl);
		padding: var(--space-sm) 0 var(--space-lg);
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.stat-value {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}
	.stat-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-secondary);
	}
	.stat-divider {
		width: 1px;
		height: 28px;
		background: var(--border);
	}
	.tab-bar {
		display: flex;
		gap: 2px;
		background: var(--bg-surface);
		border-radius: var(--radius-full);
		padding: 3px;
		margin-bottom: var(--space-lg);
		position: relative;
	}
	.tab-bg {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc(50% - 3px);
		background: var(--text-primary);
		border-radius: var(--radius-full);
		transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
		z-index: 0;
	}
	.tab {
		flex: 1;
		padding: var(--space-sm) var(--space-lg);
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-display);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.2s ease;
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tab.active {
		color: var(--bg-primary);
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
		height: 30dvh;
	}
	.empty-state {
		gap: var(--space-sm);
		padding: var(--space-3xl) var(--space-lg);
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
	.me-reel {
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

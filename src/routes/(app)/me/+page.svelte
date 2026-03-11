<script lang="ts">
	import { onMount } from 'svelte';
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
	import MeReelView from '$lib/components/MeReelView.svelte';
	import MeGrid from '$lib/components/MeGrid.svelte';
	import AvatarCropModal from '$lib/components/AvatarCropModal.svelte';
	import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
	import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import { cloutChange } from '$lib/stores/cloutChange';

	const user = $derived(page.data.user);
	const group = $derived(page.data.group);
	const currentUserId = $derived(user?.id ?? '');
	const isHost = $derived(group?.createdBy === user?.id);
	const gifEnabled = $derived(!!page.data.gifEnabled);

	let stats = $state<{ uploads: number; saves: number; minutesWatched: number } | null>(null);
	let clout = $state<{
		enabled: boolean;
		tier?: string;
		tierName?: string;
		icon?: string;
		cooldownMinutes?: number;
		burstSize?: number;
		queueLimit?: number | null;
	} | null>(null);

	async function loadStats() {
		try {
			const res = await fetch('/api/profile/stats');
			if (res.ok) stats = await res.json();
		} catch {
			/* non-critical */
		}
	}

	async function loadClout() {
		try {
			const res = await fetch('/api/clout');
			if (res.ok) clout = await res.json();
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

	function showCloutModal() {
		if (!clout?.enabled || !clout.tier || !clout.tierName) return;
		cloutChange.set({
			previousTier: clout.tier,
			newTier: clout.tier,
			previousTierName: clout.tierName,
			newTierName: clout.tierName,
			cooldownMinutes: clout.cooldownMinutes ?? 0,
			burstSize: clout.burstSize ?? 1,
			queueLimit: clout.queueLimit ?? null
		});
	}

	// Avatar state
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

	// Tab + clip state
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

	// Reel state
	let showReel = $state(false);
	let reelStartIndex = $state(0);

	function openReel(index: number) {
		reelStartIndex = index;
		showReel = true;
	}
	async function closeReel() {
		showReel = false;
		if (activeTab === 'faves') await loadFaves();
		else await loadUploads();
		loadStats();
	}

	// Clip interaction handlers
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
		if (activeTab === 'faves') faveClips = faveClips.filter((c) => c.id !== clipId);
		else uploadClips = uploadClips.filter((c) => c.id !== clipId);
	}
	async function handleRetry(clipId: string) {
		const ok = await retryClipDownload(clipId);
		if (ok) updateClip(clipId, (c) => ({ ...c, status: 'downloading' }));
		else toast.error('Failed to retry download');
	}

	onMount(() => {
		loadFaves();
		loadStats();
		loadClout();
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
			<div class="name-row">
				<span class="profile-username">{user?.username}</span>
				{#if clout?.enabled && clout.tier && clout.icon}
					<button class="rank-badge" onclick={showCloutModal} aria-label={clout.tierName}>
						<img src={clout.icon} alt={clout.tierName} class="rank-icon" />
					</button>
				{/if}
			</div>
		</div>
		<div class="stats-row">
			<div class="stat">
				<span class="stat-value">{stats?.uploads ?? '--'}</span>
				<span class="stat-label">Uploads</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{stats?.saves ?? '--'}</span>
				<span class="stat-label">Saves</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{formatWatchTime(stats?.minutesWatched)}</span>
				<span class="stat-label">Watched</span>
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
		<MeGrid clips={displayClips} showAvatars={activeTab === 'faves'} ontap={openReel} />
	{/if}
</div>

{#if showReel}
	<MeReelView
		clips={displayClips}
		startIndex={reelStartIndex}
		{currentUserId}
		{isHost}
		{gifEnabled}
		onclose={closeReel}
		onwatched={markWatched}
		onfavorited={handleFavorite}
		onreaction={handleReaction}
		onretry={handleRetry}
		ondelete={handleDelete}
	/>
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
	.name-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.profile-username {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}
	.rank-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
	}
	.rank-badge:active {
		transform: scale(0.93);
	}
	.rank-icon {
		width: 22px;
		height: 22px;
		object-fit: contain;
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
</style>

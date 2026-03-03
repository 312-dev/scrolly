<script lang="ts">
	/* eslint-disable max-lines */
	import { onMount, onDestroy } from 'svelte';
	import { isPointerFine } from '$lib/gestures';
	import { fetchUnreadCount } from '$lib/stores/notifications';
	import { openCommentsSignal } from '$lib/stores/toasts';
	import { globalMuted } from '$lib/stores/mute';

	import { connectNormalizer } from '$lib/audio/normalizer';
	import {
		setupDesktopGestures,
		setupMobileGestures,
		setupReelKeyboard
	} from '$lib/reelInteractions';
	import {
		trackVideoTime,
		sendWatchPercent,
		flashIndicator,
		startPeriodicWatchUpdate
	} from '$lib/reelPlayback';
	import { feedUiHidden } from '$lib/stores/uiHidden';
	import { groupMembers } from '$lib/stores/members';
	import ReelVideo from './ReelVideo.svelte';
	import ReelMusic from './ReelMusic.svelte';
	import ActionSidebar from './ActionSidebar.svelte';
	import ReelOverlay from './ReelOverlay.svelte';
	import ReactionPicker from './ReactionPicker.svelte';
	import CommentPrompt from './CommentPrompt.svelte';
	import EmojiShower from './EmojiShower.svelte';
	import CommentsSheet from './CommentsSheet.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import ViewBadge from './ViewBadge.svelte';
	import ViewersSheet from './ViewersSheet.svelte';
	import ReelIndicators from './ReelIndicators.svelte';

	import type { FeedClip } from '$lib/types';

	const {
		clip,
		currentUserId,
		active,
		index,
		autoScroll,
		gifEnabled = false,
		canEditCaption = false,
		seenByOthers = false,
		hideViewBadge = false,
		onwatched,
		onfavorited,
		onreaction,
		onretry,
		onended,
		oncaptionedit,
		ondelete
	}: {
		clip: FeedClip;
		currentUserId: string;
		active: boolean;
		index: number;
		autoScroll: boolean;
		gifEnabled?: boolean;
		canEditCaption?: boolean;
		seenByOthers?: boolean;
		hideViewBadge?: boolean;
		onwatched: (id: string) => void;
		onfavorited: (id: string) => void;
		onreaction: (clipId: string, emoji: string) => Promise<void>;
		onretry: (id: string) => void;
		onended: () => void;
		oncaptionedit?: (clipId: string, newCaption: string) => void;
		ondelete?: (clipId: string) => void;
	} = $props();

	let itemEl: HTMLDivElement | null = $state(null);
	let hasMarkedWatched = $state(false);
	let muted = $derived($globalMuted);
	let showMuteIndicator = $state(false);
	let muteIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
	let showSpeedIndicator = $state(false);

	let isDesktop = $state(false);
	let videoEl: HTMLVideoElement | null = $state(null);
	let audioEl: HTMLAudioElement | null = $state(null);
	let paused = $state(false);
	let showPlayIndicator = $state(false);
	let playIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
	let currentTime = $state(0);
	let duration = $state(0);
	let uiHidden = $state(false);
	let showPicker = $state(false);
	let pickerDragMode = $state(false);
	let pickerX = $state(0);
	let pickerY = $state(0);
	let showerEmoji = $state('');
	let showerX = $state(0);
	let showerY = $state(0);
	let showShower = $state(false);
	let showComments = $state(false);
	let commentsAutoFocus = $state(false);
	let unreadOverride = $state<number | null>(null);
	const localUnreadCount = $derived(
		unreadOverride !== null ? unreadOverride : clip.unreadCommentCount
	);
	let extraCommentCount = $state(0);
	const localCommentCount = $derived(clip.commentCount + extraCommentCount);
	const isOwn = $derived(clip.addedBy === currentUserId);
	const reactedEmoji = $derived(
		Object.entries(clip.reactions).find(([, v]) => v.reacted)?.[0] ?? null
	);
	let showViewers = $state(false);
	let maxPercent = $state(0);
	let wasActive = $state(false);

	// Auto-scroll engagement deferral
	let pendingAutoScroll = $state(false);
	let postEngagementTimer: ReturnType<typeof setTimeout> | null = null;
	const POST_ENGAGEMENT_DELAY = 3000;

	const isEngaged = $derived(showComments || showPicker || showViewers);
	// Keep looping while we're waiting to auto-scroll (engaged or post-engagement cooldown)
	const forceLoop = $derived(isEngaged || pendingAutoScroll);

	function handleEnded() {
		if (!autoScroll) return;
		if (isEngaged) {
			pendingAutoScroll = true;
		} else {
			onended();
		}
	}

	$effect(() => {
		if (isEngaged) {
			// User is engaging — cancel any pending post-engagement timer
			if (postEngagementTimer) {
				clearTimeout(postEngagementTimer);
				postEngagementTimer = null;
			}
		} else if (pendingAutoScroll && active) {
			// Engagement ended — wait a beat then scroll
			postEngagementTimer = setTimeout(() => {
				postEngagementTimer = null;
				if (pendingAutoScroll && active) {
					pendingAutoScroll = false;
					onended();
				}
			}, POST_ENGAGEMENT_DELAY);
		}
		return () => {
			if (postEngagementTimer) {
				clearTimeout(postEngagementTimer);
				postEngagementTimer = null;
			}
		};
	});

	$effect(() => {
		if (!active) {
			// Reel is no longer visible — cancel everything
			pendingAutoScroll = false;
			if (postEngagementTimer) {
				clearTimeout(postEngagementTimer);
				postEngagementTimer = null;
			}
		}
	});
	const SCRUBBER_IDLE_TIMEOUT = 3000;
	let scrubberTimerId: ReturnType<typeof setTimeout> | null = null;
	let scrubberHidden = $state(false);

	onMount(() => {
		isDesktop = isPointerFine();
	});
	onDestroy(() => {
		if (muteIndicatorTimer) clearTimeout(muteIndicatorTimer);
		if (playIndicatorTimer) clearTimeout(playIndicatorTimer);
		if (scrubberTimerId) clearTimeout(scrubberTimerId);
		if (postEngagementTimer) clearTimeout(postEngagementTimer);
		scrubSeekedCleanup?.();
		sendWatchPercent(clip.id, maxPercent);
	});

	$effect(() => {
		if (active) feedUiHidden.set(uiHidden);
	});
	$effect(() => {
		if (!active || clip.watched || hasMarkedWatched) return;
		const timer = setTimeout(() => {
			hasMarkedWatched = true;
			onwatched(clip.id);
		}, 3000);
		return () => clearTimeout(timer);
	});
	let hasMarkedReactionsRead = $state(false);
	$effect(() => {
		if (!active || hasMarkedReactionsRead) return;
		const timer = setTimeout(() => {
			hasMarkedReactionsRead = true;
			fetch('/api/notifications/mark-read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clipId: clip.id, type: 'reaction' })
			})
				.then(() => fetchUnreadCount())
				.catch(() => {});
		}, 3000);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		if (active) {
			wasActive = true;
		} else if (wasActive) {
			wasActive = false;
			sendWatchPercent(clip.id, maxPercent);
			maxPercent = 0;
		}
	});
	// Send watch percent to server periodically while active
	$effect(() => {
		if (!active) return;
		return startPeriodicWatchUpdate(clip.id, () => maxPercent);
	});
	// Deep-link: open comments sheet when signaled (e.g., from push notification)
	$effect(() => {
		const target = $openCommentsSignal;
		if (target === clip.id && active) {
			openCommentsSignal.set(null);
			showComments = true;
		}
	});

	$effect(() => {
		const el = videoEl ?? audioEl;
		if (!el) return;
		return trackVideoTime(
			el,
			(t, d, p) => {
				currentTime = t;
				duration = d;
				paused = p;
			},
			(d) => {
				duration = d;
			},
			(pct) => {
				if (pct > maxPercent) maxPercent = pct;
			}
		);
	});

	function startScrubberTimer() {
		if (scrubberTimerId) clearTimeout(scrubberTimerId);
		scrubberTimerId = setTimeout(() => {
			scrubberHidden = true;
		}, SCRUBBER_IDLE_TIMEOUT);
	}
	function resetScrubberTimer() {
		scrubberHidden = false;
		if (scrubberTimerId) clearTimeout(scrubberTimerId);
		scrubberTimerId = null;
		if (active && !paused) startScrubberTimer();
	}

	$effect(() => {
		if (!active || paused) {
			if (scrubberTimerId) clearTimeout(scrubberTimerId);
			scrubberTimerId = null;
			scrubberHidden = false;
			return;
		}
		startScrubberTimer();
		return () => {
			if (scrubberTimerId) clearTimeout(scrubberTimerId);
			scrubberTimerId = null;
		};
	});

	$effect(() => {
		if (!itemEl || !active) return;
		const handleActivity = () => resetScrubberTimer();
		itemEl.addEventListener('pointermove', handleActivity);
		itemEl.addEventListener('pointerdown', handleActivity);
		document.addEventListener('keydown', handleActivity);
		return () => {
			itemEl!.removeEventListener('pointermove', handleActivity);
			itemEl!.removeEventListener('pointerdown', handleActivity);
			document.removeEventListener('keydown', handleActivity);
		};
	});

	function togglePlayPause() {
		const el = videoEl ?? audioEl;
		if (!el) return;
		if (el.paused) el.play().catch(() => {});
		else el.pause();
		playIndicatorTimer = flashIndicator((v) => (showPlayIndicator = v), playIndicatorTimer);
	}
	function toggleMute() {
		globalMuted.set(!muted);
		if (videoEl) connectNormalizer(videoEl);
		muteIndicatorTimer = flashIndicator((v) => (showMuteIndicator = v), muteIndicatorTimer);
	}
	// Scrub-seek state — "seek on seeked" pattern prevents mobile seek queue buildup
	// while keeping the video playing so frames visually update during drag.
	let isScrubbing = false;
	let scrubSeeking = false;
	let scrubPendingTime: number | null = null;
	let scrubSeekedCleanup: (() => void) | null = null;

	function seekMedia(time: number, relative = false) {
		const el = videoEl ?? audioEl;
		if (!el) return;
		const t = Math.max(0, Math.min(relative ? el.currentTime + time : time, duration));
		if (isScrubbing && scrubSeeking) {
			// A seek is already in flight — queue the latest target, drop older ones
			scrubPendingTime = t;
		} else {
			if (isScrubbing) scrubSeeking = true;
			el.currentTime = t;
		}
	}

	function handleScrubStart() {
		isScrubbing = true;
		scrubSeeking = false;
		scrubPendingTime = null;
		const el = videoEl ?? audioEl;
		if (!el) return;
		const mediaEl = el;
		// When each seek completes, immediately issue the next pending seek
		function onSeeked() {
			if (scrubPendingTime !== null) {
				const t = scrubPendingTime;
				scrubPendingTime = null;
				mediaEl.currentTime = t;
			} else {
				scrubSeeking = false;
			}
		}
		mediaEl.addEventListener('seeked', onSeeked);
		scrubSeekedCleanup = () => mediaEl.removeEventListener('seeked', onSeeked);
	}

	function handleScrubEnd() {
		isScrubbing = false;
		scrubSeeking = false;
		scrubPendingTime = null;
		scrubSeekedCleanup?.();
		scrubSeekedCleanup = null;
	}
	function fireHeartReaction(cx: number, cy: number) {
		if (isOwn) return;
		showerEmoji = '❤️';
		showerX = cx;
		showerY = cy;
		showShower = true;
		if (!clip.reactions['❤️']?.reacted) onreaction(clip.id, '❤️');
		if (!clip.favorited) onfavorited(clip.id);
	}
	function toggleUiVisibility() {
		uiHidden = !uiHidden;
	}

	$effect(() => {
		if (!itemEl) return;
		const callbacks = { togglePlayPause, fireHeartReaction, toggleUiVisibility };
		const suppress = () => showPicker;
		return isDesktop
			? setupDesktopGestures(itemEl, callbacks, suppress)
			: setupMobileGestures(itemEl, callbacks, suppress);
	});

	$effect(() => {
		if (!active) return;
		return setupReelKeyboard(
			{
				toggleMute,
				togglePlayPause,
				seek: (s: number) => seekMedia(s, true)
			},
			() => showComments || showPicker
		);
	});

	const NEGATIVE_EMOJIS = new Set(['👎', '❓']);

	function handlePickEmoji(emoji: string) {
		showPicker = false;
		if (isOwn) return;
		showerEmoji = emoji;
		showerX = pickerX;
		showerY = pickerY;
		showShower = true;
		if (!clip.reactions[emoji]?.reacted) onreaction(clip.id, emoji);
		if (!clip.favorited && !NEGATIVE_EMOJIS.has(emoji)) onfavorited(clip.id);
	}
	function triggerReactionPickerHold(bx: number, by: number) {
		if (isOwn) return;
		pickerX = bx;
		pickerY = by;
		pickerDragMode = true;
		showPicker = true;
	}
</script>

<div class="reel-item" data-index={index} bind:this={itemEl}>
	<div class="top-left-row" class:ui-hidden={uiHidden}>
		{#if !hideViewBadge && clip.viewCount > 0}
			<ViewBadge
				viewCount={clip.viewCount}
				ontap={() => {
					sendWatchPercent(clip.id, maxPercent);
					showViewers = true;
				}}
			/>
		{/if}
	</div>

	{#if clip.contentType === 'music'}
		<ReelMusic
			{clip}
			{active}
			{muted}
			{autoScroll}
			{forceLoop}
			{onretry}
			onended={handleEnded}
			bind:audioEl
		/>
	{:else}
		<ReelVideo
			{clip}
			{active}
			{muted}
			{autoScroll}
			{forceLoop}
			{onretry}
			onended={handleEnded}
			bind:videoEl
		/>
	{/if}

	<ReelIndicators
		{showSpeedIndicator}
		speed={1}
		{showMuteIndicator}
		{muted}
		{showPlayIndicator}
		{paused}
	/>

	{#if duration > 0}
		<ProgressBar
			{currentTime}
			{duration}
			{isDesktop}
			{active}
			onseek={seekMedia}
			onscrubstart={handleScrubStart}
			onscrubend={handleScrubEnd}
			uiHidden={uiHidden || scrubberHidden}
		/>
	{/if}

	<!-- Centered content frame for overlay + sidebar -->
	<div class="reel-content-frame">
		<ReelOverlay
			username={clip.addedByUsername}
			avatarPath={clip.addedByAvatar}
			platform={clip.platform}
			creatorName={clip.creatorName}
			creatorUrl={clip.creatorUrl}
			contentType={clip.contentType}
			caption={clip.title}
			{canEditCaption}
			{seenByOthers}
			clipId={clip.id}
			{oncaptionedit}
			{ondelete}
			{uiHidden}
		/>
	</div>

	<!-- Shared bottom row: comment prompt grows left, music disc anchors right -->
	<div class="bottom-row" class:ui-hidden={uiHidden}>
		{#if active}
			<CommentPrompt
				commentCount={localCommentCount}
				onclick={(e) => {
					e.stopPropagation();
					commentsAutoFocus = true;
					showComments = true;
				}}
			/>
		{/if}
	</div>

	<ActionSidebar
		favorited={clip.favorited}
		{reactedEmoji}
		reactionCount={clip.favoriteCount}
		commentCount={localCommentCount}
		unreadCommentCount={localUnreadCount}
		originalUrl={clip.originalUrl}
		{muted}
		{uiHidden}
		{isOwn}
		albumArt={clip.contentType === 'music' ? (clip.albumArt ?? null) : null}
		spotifyUrl={clip.spotifyUrl ?? null}
		appleMusicUrl={clip.appleMusicUrl ?? null}
		youtubeMusicUrl={clip.youtubeMusicUrl ?? null}
		{active}
		{paused}
		onsave={() => {
			showPicker = false;
			onfavorited(clip.id);
		}}
		oncomment={() => {
			commentsAutoFocus = false;
			showComments = true;
		}}
		onreactionhold={triggerReactionPickerHold}
		onmute={toggleMute}
	/>
</div>

{#if showPicker}
	<ReactionPicker
		x={pickerX}
		y={pickerY}
		dragMode={pickerDragMode}
		onpick={handlePickEmoji}
		ondismiss={() => (showPicker = false)}
	/>
{/if}
{#if showShower}
	<EmojiShower
		emoji={showerEmoji}
		x={showerX}
		y={showerY}
		oncomplete={() => (showShower = false)}
	/>
{/if}
{#if showComments}
	<CommentsSheet
		clipId={clip.id}
		{currentUserId}
		{gifEnabled}
		autoFocus={commentsAutoFocus}
		members={$groupMembers}
		ondismiss={() => {
			showComments = false;
			unreadOverride = 0;
		}}
		oncommentposted={() => {
			extraCommentCount += 1;
		}}
	/>
{/if}
{#if showViewers}
	<ViewersSheet clipId={clip.id} ondismiss={() => (showViewers = false)} />
{/if}

<style>
	.reel-item {
		height: 100%;
		width: 100%;
		position: relative;
		overflow: hidden;
		background: var(--bg-primary);
	}
	.reel-content-frame {
		position: absolute;
		inset: 0;
		max-width: 480px;
		margin: 0 auto;
		z-index: 5;
		pointer-events: none;
	}
	.reel-content-frame > :global(*) {
		pointer-events: auto;
	}
	.top-left-row {
		position: absolute;
		top: max(var(--space-md), env(safe-area-inset-top));
		left: var(--space-lg);
		z-index: 6;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 40px;
		transition: opacity 0.3s ease;
	}
	.top-left-row.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}
	.bottom-row {
		position: absolute;
		bottom: 14px;
		left: var(--space-lg);
		right: var(--space-lg);
		z-index: 7;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		transition: opacity 0.3s ease;
	}
	.bottom-row.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}
</style>

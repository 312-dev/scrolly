<script lang="ts" module>
	// Module-level: track last active contributor across all ReelItem instances
	let lastActiveContributor = '';

	export function resetLastContributor() {
		lastActiveContributor = '';
	}
</script>

<script lang="ts">
	/* eslint-disable max-lines */
	import { onMount, onDestroy } from 'svelte';
	import { isPointerFine } from '$lib/gestures';
	import { fetchUnreadCount } from '$lib/stores/notifications';
	import { openCommentsSignal } from '$lib/stores/toasts';
	import { globalMuted } from '$lib/stores/mute';

	import { connectNormalizer } from '$lib/audio/normalizer';
	import { fetchComments } from '$lib/commentsApi';
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
	import { feedUiHidden, filterBarDimmed } from '$lib/stores/uiHidden';
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
	import ContributorPill from './ContributorPill.svelte';

	import type { FeedClip } from '$lib/types';

	const {
		clip,
		currentUserId,
		active,
		index,
		autoScroll,
		gifEnabled = false,
		seenByOthers = false,
		hideViewBadge = false,
		deferWatched = false,
		onwatched,
		onfavorited,
		onreaction,
		onretry,
		onended,
		ondelete
	}: {
		clip: FeedClip;
		currentUserId: string;
		active: boolean;
		index: number;
		autoScroll: boolean;
		gifEnabled?: boolean;
		seenByOthers?: boolean;
		hideViewBadge?: boolean;
		deferWatched?: boolean;
		onwatched: (id: string) => void;
		onfavorited: (id: string) => void;
		onreaction: (clipId: string, emoji: string) => Promise<void>;
		onretry: (id: string) => void;
		onended: () => void;
		ondelete?: (clipId: string) => void;
	} = $props();

	let itemEl: HTMLDivElement | null = $state(null);
	let hasMarkedWatched = $state(false);
	let muted = $derived($globalMuted);
	let showMuteIndicator = $state(false);
	let muteIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
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

	// Comment previews for cycling prompt bar
	let commentPreviews = $state<{ username: string; text: string }[]>([]);
	let commentPreviewsLoaded = $state(false);

	// Contributor pill expand/collapse
	let pillExpanded = $state(false);
	let pillTimer: ReturnType<typeof setTimeout> | null = null;
	let pillEl: HTMLDivElement | null = $state(null);

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
		if (pillTimer) clearTimeout(pillTimer);
		scrubSeekedCleanup?.();
		if (!deferWatched || hasMarkedWatched) {
			sendWatchPercent(clip.id, maxPercent);
		}
	});

	function checkPillOverlap() {
		if (!pillEl) return;
		const filterBar = document.querySelector('.filter-tabs');
		if (!filterBar) return;
		const pillRect = pillEl.getBoundingClientRect();
		const barRect = filterBar.getBoundingClientRect();
		const overlaps =
			pillRect.right > barRect.left &&
			pillRect.left < barRect.right &&
			pillRect.bottom > barRect.top &&
			pillRect.top < barRect.bottom;
		filterBarDimmed.set(overlaps);
	}

	// Contributor pill: expand when a different contributor's clip becomes active
	$effect(() => {
		if (!active) {
			if (pillTimer) {
				clearTimeout(pillTimer);
				pillTimer = null;
			}
			pillExpanded = false;
			filterBarDimmed.set(false);
			return;
		}
		const contributor = clip.addedByUsername;
		if (contributor !== lastActiveContributor) {
			lastActiveContributor = contributor;
			pillTimer = setTimeout(() => {
				pillExpanded = true;
				// Check overlap after transition completes
				setTimeout(checkPillOverlap, 1050);
				pillTimer = setTimeout(() => {
					pillExpanded = false;
					filterBarDimmed.set(false);
					pillTimer = null;
				}, 4500);
			}, 1000);
		} else {
			pillExpanded = false;
			filterBarDimmed.set(false);
		}
		return () => {
			if (pillTimer) {
				clearTimeout(pillTimer);
				pillTimer = null;
			}
			filterBarDimmed.set(false);
		};
	});

	$effect(() => {
		if (active) feedUiHidden.set(uiHidden);
	});
	$effect(() => {
		if (!active || clip.watched || hasMarkedWatched || deferWatched) return;
		const timer = setTimeout(() => {
			hasMarkedWatched = true;
			onwatched(clip.id);
		}, 3000);
		return () => clearTimeout(timer);
	});
	// Deferred watch: mark watched when 50% or 10s threshold is met
	$effect(() => {
		if (!deferWatched || !active || clip.watched || hasMarkedWatched) return;
		if ((duration > 0 && currentTime / duration >= 0.5) || currentTime >= 10) {
			hasMarkedWatched = true;
			onwatched(clip.id);
		}
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
			if (!deferWatched || hasMarkedWatched) {
				sendWatchPercent(clip.id, maxPercent);
			}
			maxPercent = 0;
		}
	});
	// Send watch percent to server periodically while active
	$effect(() => {
		if (!active || (deferWatched && !hasMarkedWatched)) return;
		return startPeriodicWatchUpdate(clip.id, () => maxPercent);
	});
	// Fetch comment previews for cycling prompt bar
	$effect(() => {
		if (!active || localCommentCount === 0 || commentPreviewsLoaded) return;
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const { comments } = await fetchComments(clip.id);
				if (cancelled) return;
				commentPreviews = comments
					.filter((c) => !c.parentId && c.text.trim())
					.map((c) => ({ username: c.username, text: c.text }));
				commentPreviewsLoaded = true;
			} catch {
				// silently fail — just show default text
			}
		}, 500);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
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
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="top-left-row"
		class:ui-hidden={uiHidden}
		bind:this={pillEl}
		onpointerdown={(e) => e.stopPropagation()}
		ontouchstart={(e) => e.stopPropagation()}
		ontouchmove={(e) => e.stopPropagation()}
		ontouchend={(e) => e.stopPropagation()}
	>
		<ContributorPill
			username={clip.addedByUsername}
			avatarPath={clip.addedByAvatar}
			expanded={pillExpanded}
			ontap={() => {
				if (pillTimer) {
					clearTimeout(pillTimer);
					pillTimer = null;
				}
				pillExpanded = !pillExpanded;
			}}
		/>
	</div>

	{#if !hideViewBadge && clip.viewCount > 0}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="top-right-row"
			class:ui-hidden={uiHidden}
			onpointerdown={(e) => e.stopPropagation()}
			ontouchstart={(e) => e.stopPropagation()}
			ontouchmove={(e) => e.stopPropagation()}
			ontouchend={(e) => e.stopPropagation()}
		>
			<ViewBadge
				viewCount={clip.viewCount}
				ontap={() => {
					sendWatchPercent(clip.id, maxPercent);
					showViewers = true;
				}}
			/>
		</div>
	{/if}

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

	<ReelIndicators {showMuteIndicator} {muted} {showPlayIndicator} {paused} />

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

	<ReelOverlay
		platform={clip.platform}
		creatorName={clip.creatorName}
		creatorUrl={clip.creatorUrl}
		contentType={clip.contentType}
		caption={clip.title}
		canDelete={clip.addedBy === currentUserId && !seenByOthers}
		clipId={clip.id}
		{ondelete}
		{uiHidden}
	/>

	<!-- Shared bottom row: comment prompt grows left, music disc anchors right -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="bottom-row"
		class:ui-hidden={uiHidden}
		onpointerdown={(e) => e.stopPropagation()}
		ontouchstart={(e) => e.stopPropagation()}
		ontouchmove={(e) => e.stopPropagation()}
		ontouchend={(e) => e.stopPropagation()}
	>
		{#if active}
			<CommentPrompt
				commentCount={localCommentCount}
				previews={commentPreviews}
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
	.top-right-row {
		position: absolute;
		top: max(var(--space-md), env(safe-area-inset-top));
		right: calc(var(--space-sm) + 44px);
		z-index: 6;
		display: flex;
		align-items: center;
		min-height: 44px;
		transition: opacity 0.3s ease;
	}
	.top-right-row.ui-hidden {
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

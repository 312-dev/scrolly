<script lang="ts">
	import { pushState } from '$app/navigation';
	import { fetchUnwatchedCount } from '$lib/stores/notifications';
	import { openCommentsSignal } from '$lib/stores/toasts';
	import {
		fetchSingleClip,
		markClipWatched,
		toggleClipFavorite,
		sendClipReaction,
		retryClipDownload
	} from '$lib/feed';
	import type { FeedClip } from '$lib/types';
	import ReelItem from './ReelItem.svelte';
	import ViewBadge from './ViewBadge.svelte';
	import ViewersSheet from './ViewersSheet.svelte';
	import SkeletonReel from './SkeletonReel.svelte';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';

	const {
		clipId,
		currentUserId,
		autoScroll,
		gifEnabled = false,
		openComments = false,
		ondismiss
	}: {
		clipId: string;
		currentUserId: string;
		autoScroll: boolean;
		gifEnabled?: boolean;
		openComments?: boolean;
		ondismiss: () => void;
	} = $props();

	let clip = $state<FeedClip | null>(null);
	let loading = $state(true);
	let error = $state(false);

	// Swipe-to-dismiss
	let overlayEl: HTMLDivElement | null = $state(null);
	let swipeX = $state(0);
	let swipeAnimating = $state(false);

	// Viewers sheet (rendered here since ViewBadge is in our top bar)
	let showViewers = $state(false);

	// History management
	let closedViaBack = false;
	let dismissed = false;

	function handleDismiss() {
		if (dismissed) return;
		dismissed = true;
		ondismiss();
	}

	// Load clip data
	$effect(() => {
		(async () => {
			const data = await fetchSingleClip(clipId);
			if (data) {
				clip = data;
			} else {
				error = true;
			}
			loading = false;

			// Open comments after clip loads if requested
			if (openComments && data) {
				// Short delay for ReelItem to mount
				setTimeout(() => openCommentsSignal.set(clipId), 100);
			}
		})();
	});

	// History: push state on mount, pop on dismiss
	$effect(() => {
		pushState('', { clipOverlay: clipId });
		const handlePopState = () => {
			closedViaBack = true;
			handleDismiss();
		};
		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
			if (!closedViaBack) history.back();
		};
	});

	// Swipe-to-dismiss gesture (swipe left)
	$effect(() => {
		if (!overlayEl) return;
		const el = overlayEl;
		let startX = 0;
		let startY = 0;
		let tracking = false;
		let decided = false;
		let isHorizontal = false;

		function onTouchStart(e: TouchEvent) {
			if (swipeAnimating) return;
			const target = e.target as HTMLElement;
			// Don't interfere with progress bar or interactive elements
			if (target.closest('.progress-bar') || target.closest('.base-sheet')) return;
			tracking = true;
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			decided = false;
			isHorizontal = false;
		}

		function onTouchMove(e: TouchEvent) {
			if (!tracking || swipeAnimating) return;
			const dx = e.touches[0].clientX - startX;
			const dy = e.touches[0].clientY - startY;

			if (!decided) {
				if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
				decided = true;
				isHorizontal = Math.abs(dx) > Math.abs(dy);
				if (!isHorizontal) return;
			}

			if (!isHorizontal) return;
			e.preventDefault();

			// Only allow leftward swipe to dismiss; rightward gets rubber-band damping
			swipeX = dx > 0 ? dx * 0.15 : dx;
		}

		function onTouchEnd() {
			if (!tracking || !isHorizontal) {
				tracking = false;
				decided = false;
				return;
			}
			tracking = false;
			decided = false;

			const vw = window.innerWidth;
			const threshold = vw * 0.2;

			// Dismiss if swiped left far enough
			if (swipeX < -threshold) {
				swipeAnimating = true;
				swipeX = -vw;
				setTimeout(() => {
					swipeAnimating = false;
					handleDismiss();
				}, 300);
				return;
			}

			// Snap back
			swipeAnimating = true;
			swipeX = 0;
			setTimeout(() => {
				swipeAnimating = false;
			}, 250);
		}

		el.addEventListener('touchstart', onTouchStart, { passive: true });
		el.addEventListener('touchmove', onTouchMove, { passive: false });
		el.addEventListener('touchend', onTouchEnd, { passive: true });
		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
			el.removeEventListener('touchend', onTouchEnd);
		};
	});

	// Interaction handlers (local state updates)
	async function handleWatched(id: string) {
		await markClipWatched(id);
		if (clip)
			clip = {
				...clip,
				watched: true,
				viewCount: clip.watched ? clip.viewCount : clip.viewCount + 1
			};
		fetchUnwatchedCount();
	}

	async function handleFavorite(id: string) {
		const data = await toggleClipFavorite(id);
		if (data && clip) clip = { ...clip, favorited: data.favorited };
	}

	async function handleReaction(id: string, emoji: string) {
		const data = await sendClipReaction(id, emoji);
		if (data && clip) clip = { ...clip, reactions: data.reactions };
	}

	async function handleRetry(id: string) {
		const ok = await retryClipDownload(id);
		if (ok && clip) clip = { ...clip, status: 'downloading' };
	}

	function handleCaptionEdit(id: string, newCaption: string) {
		if (clip) clip = { ...clip, title: newCaption };
	}

	function handleDelete() {
		handleDismiss();
	}
</script>

<div
	class="clip-overlay"
	class:animating={swipeAnimating}
	style:transform={swipeX !== 0 ? `translateX(${swipeX}px)` : undefined}
	bind:this={overlayEl}
>
	<!-- Top bar: back button + view badge -->
	<div class="overlay-top-bar">
		<button class="back-btn" onclick={handleDismiss} aria-label="Go back">
			<CaretLeftIcon size={22} weight="bold" />
		</button>
		{#if clip && clip.viewCount > 0}
			<ViewBadge
				viewCount={clip.viewCount}
				ontap={() => {
					showViewers = true;
				}}
			/>
		{/if}
	</div>

	{#if loading}
		<SkeletonReel />
	{:else if error || !clip}
		<div class="overlay-error">
			<WarningCircleIcon size={48} />
			<p class="error-title">Clip not found</p>
			<button class="error-btn" onclick={handleDismiss}>Go back</button>
		</div>
	{:else}
		<div class="overlay-reel">
			<ReelItem
				{clip}
				{currentUserId}
				active={true}
				index={0}
				{autoScroll}
				{gifEnabled}
				canEditCaption={clip.addedBy === currentUserId && !clip.seenByOthers}
				seenByOthers={clip.seenByOthers}
				hideViewBadge={true}
				onwatched={handleWatched}
				onfavorited={handleFavorite}
				onreaction={handleReaction}
				onretry={handleRetry}
				onended={() => {}}
				oncaptionedit={handleCaptionEdit}
				ondelete={handleDelete}
			/>
		</div>
	{/if}
</div>

{#if showViewers}
	<ViewersSheet {clipId} ondismiss={() => (showViewers = false)} />
{/if}

<style>
	.clip-overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: var(--bg-primary);
	}

	.clip-overlay.animating {
		transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.overlay-top-bar {
		position: absolute;
		top: max(var(--space-md), env(safe-area-inset-top));
		left: var(--space-lg);
		z-index: 6;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 40px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: none;
		border-radius: var(--radius-full);
		color: var(--reel-text);
		cursor: pointer;
		transition: transform 0.1s ease;
	}

	.back-btn:active {
		transform: scale(0.93);
	}

	.back-btn :global(svg) {
		filter: drop-shadow(0 1px 2px var(--reel-text-shadow));
	}

	.overlay-reel {
		height: 100dvh;
		width: 100%;
	}

	.overlay-error {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		color: var(--text-muted);
	}

	.overlay-error :global(svg) {
		opacity: 0.4;
	}

	.error-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.error-btn {
		margin-top: var(--space-md);
		padding: 10px 24px;
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}

	.error-btn:active {
		transform: scale(0.97);
	}
</style>

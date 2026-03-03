<script lang="ts">
	import { pushState, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
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
		isHost = false,
		autoScroll,
		gifEnabled = false,
		openComments = false,
		ondismiss
	}: {
		clipId: string;
		currentUserId: string;
		isHost?: boolean;
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
	let isEntering = $state(true);

	$effect(() => {
		const t = setTimeout(() => {
			isEntering = false;
		}, 300);
		return () => clearTimeout(t);
	});

	// Viewers sheet (rendered here since ViewBadge is in our top bar)
	let showViewers = $state(false);

	// History management
	let closedViaBack = false;
	let dismissed = false;

	// Prevent history.back() in cleanup when a real navigation or reload occurs
	beforeNavigate(() => {
		closedViaBack = true;
	});

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
			setTimeout(() => {
				if (page.state?.clipOverlay) return;
				closedViaBack = true;
				handleDismiss();
			}, 0);
		};
		const handleBeforeUnload = () => {
			closedViaBack = true;
		};
		window.addEventListener('popstate', handlePopState);
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('popstate', handlePopState);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			if (!closedViaBack) history.back();
		};
	});

	// Swipe-to-dismiss gesture (swipe right — back the way the overlay came)
	$effect(() => {
		if (!overlayEl) return;
		const el = overlayEl;
		let startX = 0;
		let startY = 0;
		let tracking = false;
		let decided = false;
		let isHorizontal = false;

		// Block the browser's native edge-swipe-back gesture (iOS Safari, Chrome Android).
		// Must be non-passive so preventDefault() is honoured.
		function onTouchStart(e: TouchEvent) {
			if (e.touches.length === 1 && e.touches[0].clientX < 30) {
				e.preventDefault();
			}
		}

		function onPointerDown(e: PointerEvent) {
			if (swipeAnimating || isEntering) return;
			const target = e.target as HTMLElement;
			// Don't interfere with progress bar or interactive elements
			if (target.closest('.progress-bar') || target.closest('.base-sheet')) return;
			tracking = true;
			startX = e.clientX;
			startY = e.clientY;
			decided = false;
			isHorizontal = false;
		}

		function onPointerMove(e: PointerEvent) {
			if (!tracking || swipeAnimating) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			if (!decided) {
				if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
				decided = true;
				isHorizontal = Math.abs(dx) > Math.abs(dy);
				if (isHorizontal) {
					// Capture the pointer so the browser can't steal the gesture mid-swipe
					try {
						el.setPointerCapture(e.pointerId);
					} catch {
						// setPointerCapture not supported — swipe still works, just without capture
					}
				}
				if (!isHorizontal) return;
			}

			if (!isHorizontal) return;

			// Only allow rightward swipe to dismiss; leftward gets rubber-band damping
			swipeX = dx < 0 ? dx * 0.15 : dx;
		}

		function onPointerUp() {
			if (!tracking || !isHorizontal) {
				tracking = false;
				decided = false;
				return;
			}
			tracking = false;
			decided = false;

			const vw = window.innerWidth;
			const threshold = vw * 0.2;

			// Dismiss if swiped right far enough
			if (swipeX > threshold) {
				swipeAnimating = true;
				swipeX = vw;
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

		el.addEventListener('touchstart', onTouchStart, { passive: false });
		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerUp);
		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerUp);
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
		<div class="overlay-top-row">
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
				{isHost}
				active={true}
				index={0}
				{autoScroll}
				{gifEnabled}
				seenByOthers={clip.seenByOthers}
				hideViewBadge={true}
				onwatched={handleWatched}
				onfavorited={handleFavorite}
				onreaction={handleReaction}
				onretry={handleRetry}
				onended={() => {}}
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
		top: 0;
		left: 0;
		right: 0;
		bottom: var(--bottom-nav-height, 64px);
		z-index: 40;
		background: var(--bg-primary);
		touch-action: pan-y;
		overscroll-behavior-x: none;
		animation: slide-in-right 0.28s cubic-bezier(0.32, 0.72, 0, 1) both;
	}

	@keyframes slide-in-right {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.clip-overlay.animating {
		animation: none;
		transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.overlay-top-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		padding-top: max(var(--space-md), env(safe-area-inset-top));
		padding-left: var(--space-lg);
		padding-right: var(--space-lg);
		z-index: 6;
		pointer-events: none;
	}
	.overlay-top-row {
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		height: 40px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: none;
		border-radius: var(--radius-full);
		color: var(--reel-text);
		cursor: pointer;
		transition: transform 0.1s ease;
		pointer-events: auto;
	}

	.back-btn:active {
		transform: scale(0.93);
	}

	.back-btn :global(svg) {
		filter: drop-shadow(0 1px 2px var(--reel-text-shadow));
	}

	/* ViewBadge sits in the pointer-events:none bar — re-enable for its button */
	.overlay-top-bar :global(.view-badge) {
		pointer-events: auto;
	}

	.overlay-reel {
		height: 100%;
		width: 100%;
	}

	.overlay-error {
		height: 100%;
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

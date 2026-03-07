<script lang="ts">
	/* eslint-disable max-lines */
	import ReelItem, { resetLastContributor } from '$lib/components/ReelItem.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SkeletonReel from '$lib/components/SkeletonReel.svelte';
	import LinkIcon from 'phosphor-svelte/lib/LinkIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import FilmSlateIcon from 'phosphor-svelte/lib/FilmSlateIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { addVideoModalOpen } from '$lib/stores/addVideoModal';
	import ClipOverlay from '$lib/components/ClipOverlay.svelte';
	import ShortcutUpgradeBanner from '$lib/components/ShortcutUpgradeBanner.svelte';
	import { addToast, toast, clipReadySignal, clipOverlaySignal } from '$lib/stores/toasts';
	import {
		isStandalone,
		showInstallBanner,
		showIosInstallBanner,
		triggerInstall
	} from '$lib/stores/pwa';
	import { isPushSupported, getExistingSubscription, subscribeToPush } from '$lib/push';
	import { homeTapSignal } from '$lib/stores/homeTap';
	import { unwatchedCount, fetchUnwatchedCount } from '$lib/stores/notifications';
	import { catchUpDismissalExpired, dismissCatchUp } from '$lib/stores/catchUpModal';
	import CatchUpModal from '$lib/components/CatchUpModal.svelte';
	import { feedUiHidden } from '$lib/stores/uiHidden';
	import { anySheetOpen } from '$lib/stores/sheetOpen';
	import { get } from 'svelte/store';
	import { page } from '$app/state';
	import { basename } from '$lib/utils';
	import type { FeedClip } from '$lib/types';
	import type { FeedFilter, FeedSort } from '$lib/feed';
	import {
		fetchClips,
		markClipWatched,
		toggleClipFavorite,
		retryClipDownload,
		sendClipReaction,
		fetchSingleClip,
		submitClipUrl,
		extractDroppedUrl,
		extractShareTargetUrl
	} from '$lib/feed';

	let clips = $state<FeedClip[]>([]);
	let filter = $state<FeedFilter>('unwatched');
	let sort = $state<FeedSort>((page.data.user?.feedSortOrder as FeedSort) || 'oldest');
	let loading = $state(true);
	let activeIndex = $state(0);
	let scrollContainer: HTMLDivElement | null = $state(null);

	let hasMore = $state(true);
	let loadingMore = $state(false);
	let currentOffset = $state(0);
	const PAGE_SIZE = 20;
	const LOAD_MORE_THRESHOLD = 5;

	let isDesktopFeed = $state(false);
	const renderWindow = $derived(isDesktopFeed ? 3 : 2);

	// Defer watched marking for the last unwatched clip
	const isLastUnwatched = $derived(
		filter === 'unwatched' &&
			!hasMore &&
			clips.length > 0 &&
			clips.filter((c) => !c.watched).length === 1
	);

	// Defer watched marking for the first loaded clip until 40% watched or swiped past
	let firstClipId = $state<string | null>(null);

	// Clip overlay (dedicated single-clip view)
	let overlayClipId = $state<string | null>(null);
	let overlayOpenComments = $state(false);
	const overlayActive = $derived(overlayClipId !== null);

	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let pullSnapping = $state(false);
	let touchStartY = 0;
	let isPullingActive = false;
	const PULL_THRESHOLD = 80;

	function endPull(triggerRefresh: boolean) {
		if (triggerRefresh) {
			refresh();
		} else {
			pullSnapping = true;
			pullDistance = 0;
			setTimeout(() => {
				pullSnapping = false;
			}, 250);
		}
	}

	let isDragging = $state(false);
	let dragCounter = 0;

	// Horizontal swipe state
	const FILTERS: FeedFilter[] = ['unwatched', 'watched'];
	let swipeX = $state(0);
	let swipeAnimating = $state(false);
	let isHorizontalSwiping = $state(false);
	let feedWrapper: HTMLDivElement | null = $state(null);
	const filterIndex = $derived(FILTERS.indexOf(filter));
	const swipeProgress = $derived(
		swipeX !== 0 && typeof window !== 'undefined' ? -swipeX / window.innerWidth : 0
	);

	function computePullY(dist: number, refreshing: boolean): number {
		if (dist > 0) return dist;
		return refreshing ? 48 : 0;
	}
	const pullY = $derived(computePullY(pullDistance, isRefreshing));
	const currentUserId = $derived(page.data.user?.id ?? '');
	const isHost = $derived(page.data.group?.createdBy === page.data.user?.id);
	const autoScroll = $derived(page.data.user?.autoScroll ?? false);
	const gifEnabled = $derived(!!page.data.gifEnabled);
	const vapidPublicKey = $derived(page.data.vapidPublicKey as string);
	const lastLegacyShareAt = $derived(page.data.user?.lastLegacyShareAt ?? null);
	const usedNewShareFlow = $derived(page.data.user?.usedNewShareFlow ?? false);
	const shortcutUrl = $derived(page.data.group?.shortcutUrl ?? null);

	let pushSupported = $state(false);
	let pushEnabled = $state(false);
	let pushEnabling = $state(false);

	// Catch-up modal state
	let showCatchUp = $state(false);
	let catchUpResolved = $state(false);

	async function loadInitialClips() {
		loading = true;
		currentOffset = 0;
		hasMore = true;
		const data = await fetchClips(filter, PAGE_SIZE, sort);
		if (data) {
			resetLastContributor();
			clips = data.clips;
			hasMore = data.hasMore;
			currentOffset = data.clips.length;
			firstClipId = data.clips.length > 0 ? data.clips[0].id : null;
		} else {
			toast.error('Failed to load clips');
		}
		loading = false;
	}

	async function loadMore() {
		if (loadingMore || !hasMore || loading) return;
		loadingMore = true;
		const data = await fetchClips(filter, PAGE_SIZE, sort, currentOffset);
		if (data) {
			const existingIds = new Set(clips.map((c) => c.id));
			const newClips = data.clips.filter((c) => !existingIds.has(c.id));
			clips = [...clips, ...newClips];
			hasMore = data.hasMore;
			currentOffset += data.clips.length;
		}
		loadingMore = false;
	}

	async function markWatched(clipId: string) {
		const wasUnwatched = clips.find((c) => c.id === clipId && !c.watched);
		await markClipWatched(clipId);
		clips = clips.map((c) =>
			c.id === clipId
				? { ...c, watched: true, viewCount: c.watched ? c.viewCount : c.viewCount + 1 }
				: c
		);
		if (wasUnwatched) fetchUnwatchedCount();
	}

	async function toggleFavorite(clipId: string) {
		const data = await toggleClipFavorite(clipId);
		if (data) {
			clips = clips.map((c) =>
				c.id === clipId
					? {
							...c,
							favorited: data.favorited,
							favoriteCount: c.favoriteCount + (data.favorited ? 1 : -1)
						}
					: c
			);
		} else {
			toast.error('Failed to update favorite');
		}
	}

	async function retryDownload(clipId: string) {
		const ok = await retryClipDownload(clipId);
		if (ok) {
			clips = clips.map((c) => (c.id === clipId ? { ...c, status: 'downloading' } : c));
		} else {
			toast.error('Failed to retry download');
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

	function scrollToIndex(index: number) {
		if (!scrollContainer || index < 0) return;
		const slots = scrollContainer.querySelectorAll('.reel-slot');
		if (index >= slots.length) return;
		const slot = slots[index] as HTMLElement | undefined;
		if (slot) slot.scrollIntoView({ behavior: 'smooth' });
	}

	function setFilter(f: FeedFilter) {
		if (f === filter || swipeAnimating) return;
		const newIndex = FILTERS.indexOf(f);
		if (newIndex === -1) return;
		const goingNext = newIndex > filterIndex;
		completeSwipe(goingNext, newIndex);
	}

	function completeSwipe(goingNext: boolean, newIndex: number) {
		const vw = window.innerWidth;
		// Clear pull-snapping to prevent its CSS transition from overriding the swipe animation
		pullSnapping = false;
		swipeAnimating = true;
		swipeX = goingNext ? -vw : vw;

		setTimeout(() => {
			swipeAnimating = false;
			swipeX = goingNext ? vw * 0.35 : -vw * 0.35;

			filter = FILTERS[newIndex];
			activeIndex = 0;
			currentOffset = 0;
			hasMore = true;
			if (scrollContainer) scrollContainer.scrollTop = 0;
			loadInitialClips();

			requestAnimationFrame(() => {
				swipeAnimating = true;
				swipeX = 0;
				setTimeout(() => {
					swipeAnimating = false;
				}, 300);
			});
		}, 250);
	}

	// Pull-to-refresh: attach to feedWrapper so it works on empty state too.
	// Uses scrollContainer for scroll position when it exists, otherwise treats as top.
	$effect(() => {
		if (!feedWrapper) return;
		const el = feedWrapper;
		const getScrollTop = () => scrollContainer?.scrollTop ?? 0;

		function handlePointerDown(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;
			if (get(anySheetOpen)) return;
			if (getScrollTop() <= 0 && !isRefreshing) {
				touchStartY = e.clientY;
				isPullingActive = true;
			}
		}

		function handlePointerMove(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;
			if (!isPullingActive || isRefreshing || isHorizontalSwiping) return;
			if (getScrollTop() > 0) {
				isPullingActive = false;
				pullDistance = 0;
				return;
			}
			const delta = e.clientY - touchStartY;
			if (delta > 0) {
				pullDistance = Math.min(delta * 0.4, 120);
			} else {
				pullDistance = 0;
			}
		}

		function handlePointerUp(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;
			if (pullDistance > 0) endPull(pullDistance >= PULL_THRESHOLD && !isRefreshing);
			isPullingActive = false;
		}

		// Wheel-based pull-to-refresh for desktop (trackpad / mouse wheel)
		let wheelAccum = 0;
		let wheelTimer: ReturnType<typeof setTimeout> | null = null;

		function handleWheel(e: WheelEvent) {
			if (isRefreshing) return;
			if (getScrollTop() > 0) {
				wheelAccum = 0;
				pullDistance = 0;
				return;
			}

			if (e.deltaY < 0) {
				// Scrolling up — accumulate pull distance
				wheelAccum += Math.abs(e.deltaY);
				pullDistance = Math.min(wheelAccum * 0.3, 120);
				if (pullDistance > 10) e.preventDefault();
			} else if (e.deltaY > 0 && wheelAccum > 0) {
				// Scrolling back down — allow cancelling
				wheelAccum = Math.max(0, wheelAccum - Math.abs(e.deltaY));
				pullDistance = Math.min(wheelAccum * 0.3, 120);
				if (pullDistance > 0) e.preventDefault();
			}

			// Trigger or cancel after user stops scrolling
			if (wheelTimer) clearTimeout(wheelTimer);
			wheelTimer = setTimeout(() => {
				if (pullDistance > 0) endPull(pullDistance >= PULL_THRESHOLD && !isRefreshing);
				wheelAccum = 0;
			}, 150);
		}

		el.addEventListener('pointerdown', handlePointerDown);
		el.addEventListener('pointermove', handlePointerMove);
		el.addEventListener('pointerup', handlePointerUp);
		el.addEventListener('pointercancel', handlePointerUp);
		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => {
			el.removeEventListener('pointerdown', handlePointerDown);
			el.removeEventListener('pointermove', handlePointerMove);
			el.removeEventListener('pointerup', handlePointerUp);
			el.removeEventListener('pointercancel', handlePointerUp);
			el.removeEventListener('wheel', handleWheel);
			if (wheelTimer) clearTimeout(wheelTimer);
		};
	});

	// Horizontal swipe gesture detection
	$effect(() => {
		if (!feedWrapper) return;
		const el = feedWrapper;
		let startX = 0;
		let startY = 0;
		let tracking = false;
		let decided = false;
		let isHorizontal = false;

		// Touch-level gesture blocking — prevents Android Chrome's back-swipe
		// and iOS Safari's edge-swipe from stealing horizontal gestures.
		// Must run at the touch level (not pointer) because the browser decides
		// whether to claim the gesture during touchmove, BEFORE firing pointermove.
		// Both listeners must be non-passive so preventDefault() is honoured.
		let touchStartX2 = 0;
		let touchStartY2 = 0;
		let touchDecided = false;
		let touchIsHorizontal = false;

		function onTouchStart(e: TouchEvent) {
			if (e.touches.length !== 1) return;
			const t = e.touches[0];
			touchStartX2 = t.clientX;
			touchStartY2 = t.clientY;
			touchDecided = false;
			touchIsHorizontal = false;
			// Block edge swipes immediately
			if (t.clientX < 30) e.preventDefault();
		}

		function onTouchMove(e: TouchEvent) {
			if (e.touches.length !== 1 || swipeAnimating) return;
			const t = e.touches[0];
			const dx = t.clientX - touchStartX2;
			const dy = t.clientY - touchStartY2;

			if (!touchDecided) {
				if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
				touchDecided = true;
				touchIsHorizontal = Math.abs(dx) > Math.abs(dy);
			}

			// Claim horizontal gestures so the browser doesn't fire pointercancel
			if (touchIsHorizontal) e.preventDefault();
		}

		function onPointerDown(e: PointerEvent) {
			if (swipeAnimating) return;
			const target = e.target as HTMLElement;
			if (target.closest('.progress-bar')) {
				tracking = false;
				return;
			}
			tracking = true;
			startX = e.clientX;
			startY = e.clientY;
			decided = false;
			isHorizontal = false;
			isHorizontalSwiping = false;
		}

		function tryCapture(e: PointerEvent) {
			try {
				el.setPointerCapture(e.pointerId);
			} catch {
				// setPointerCapture not supported — swipe still works, just without capture
			}
		}

		function onPointerMove(e: PointerEvent) {
			if (!tracking || swipeAnimating) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			if (!decided) {
				if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
				decided = true;
				isHorizontal = Math.abs(dx) > Math.abs(dy);
				if (isHorizontal) tryCapture(e);
				if (!isHorizontal) return;
				isHorizontalSwiping = true;
				// Reset pull-to-refresh state so its CSS transition doesn't
				// compete with the swipe animation on pointerup
				pullDistance = 0;
				isPullingActive = false;
			}

			if (!isHorizontal) return;

			const atFirst = filterIndex === 0 && dx > 0;
			const atLast = filterIndex === FILTERS.length - 1 && dx < 0;
			swipeX = atFirst || atLast ? dx * 0.15 : dx;
		}

		function onPointerUp() {
			if (!tracking || !isHorizontal || swipeX === 0) {
				tracking = false;
				decided = false;
				isHorizontal = false;
				isHorizontalSwiping = false;
				return;
			}

			tracking = false;
			decided = false;
			isHorizontal = false;
			isHorizontalSwiping = false;

			const vw = window.innerWidth;
			const threshold = vw * 0.2;

			if (Math.abs(swipeX) > threshold) {
				const goingNext = swipeX < 0;
				const newIndex = filterIndex + (goingNext ? 1 : -1);
				if (newIndex >= 0 && newIndex < FILTERS.length) {
					completeSwipe(goingNext, newIndex);
					return;
				}
			}

			// Snap back
			swipeAnimating = true;
			swipeX = 0;
			setTimeout(() => {
				swipeAnimating = false;
			}, 250);
		}

		el.addEventListener('touchstart', onTouchStart, { passive: false });
		el.addEventListener('touchmove', onTouchMove, { passive: false });
		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerUp);
		el.addEventListener('pointerleave', onPointerUp);
		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerUp);
			el.removeEventListener('pointerleave', onPointerUp);
		};
	});

	async function refresh() {
		isRefreshing = true;
		const previousIds = new Set(clips.map((c) => c.id));
		const data = await fetchClips(filter, PAGE_SIZE, sort);
		if (data) {
			clips = data.clips;
			hasMore = data.hasMore;
			currentOffset = data.clips.length;
			const hasNew = data.clips.some((c) => !previousIds.has(c.id));
			if (hasNew) {
				activeIndex = 0;
				if (scrollContainer) scrollContainer.scrollTop = 0;
			}
		} else {
			toast.error('Failed to refresh feed');
		}
		isRefreshing = false;
		pullSnapping = true;
		pullDistance = 0;
		setTimeout(() => {
			pullSnapping = false;
		}, 250);
		fetchUnwatchedCount();
	}

	// Intercept wheel events on the scroll container to enforce one-reel-at-a-time scrolling.
	// Trackpad inertia generates a long stream of wheel events — we scroll once on the first
	// event, then swallow everything until the events fully stop (200ms gap = gesture over).
	$effect(() => {
		if (!scrollContainer) return;
		const el = scrollContainer;
		let scrollLocked = false;
		let idleTimer: ReturnType<typeof setTimeout> | null = null;

		function handleWheel(e: WheelEvent) {
			e.preventDefault();
			if (clips.length === 0) return;

			// Reset the idle timer on every event — unlock only after events stop
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				scrollLocked = false;
			}, 200);

			if (scrollLocked) return;
			scrollLocked = true;
			const direction = e.deltaY > 0 ? 1 : -1;
			const target = activeIndex + direction;
			if (target < 0 || target >= clips.length) return;
			scrollToIndex(target);
		}

		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => {
			el.removeEventListener('wheel', handleWheel);
			if (idleTimer) clearTimeout(idleTimer);
		};
	});

	$effect(() => {
		if (!scrollContainer) return;
		// eslint-disable-next-line sonarjs/void-use -- triggers $effect re-run when clips change
		void clips.length;
		const slots = scrollContainer.querySelectorAll('.reel-slot');
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
			{ root: scrollContainer, threshold: 0.5 }
		);
		slots.forEach((slot) => observer.observe(slot));
		return () => observer.disconnect();
	});

	$effect(() => {
		if (
			clips.length > 0 &&
			hasMore &&
			!loadingMore &&
			!loading &&
			!isRefreshing &&
			activeIndex >= clips.length - LOAD_MORE_THRESHOLD
		)
			loadMore();
	});

	// Mark deferred last clip as watched when user swipes to end slide
	$effect(() => {
		if (filter === 'unwatched' && !hasMore && activeIndex === clips.length && clips.length > 0) {
			const lastClip = clips[clips.length - 1];
			if (!lastClip.watched) markWatched(lastClip.id);
		}
	});

	// Mark first clip as watched when user swipes past it
	$effect(() => {
		if (firstClipId && activeIndex > 0) {
			const firstClip = clips.find((c) => c.id === firstClipId);
			if (firstClip && !firstClip.watched) markWatched(firstClipId);
			firstClipId = null;
		}
	});

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

	$effect(() => {
		const readyClipId = $clipReadySignal;
		if (!readyClipId) return;
		(async () => {
			if (clips.some((c) => c.id === readyClipId)) {
				const data = await fetchSingleClip(readyClipId);
				if (data) {
					clips = clips.map((c) =>
						c.id === readyClipId
							? {
									...c,
									status: data.status,
									videoPath: data.videoPath ?? c.videoPath,
									audioPath: data.audioPath ?? c.audioPath,
									thumbnailPath: data.thumbnailPath ?? c.thumbnailPath,
									title: data.title ?? c.title,
									artist: data.artist ?? c.artist,
									albumArt: data.albumArt ?? c.albumArt
								}
							: c
					);
				}
			} else {
				// New clip not yet in feed — reload to include it
				await loadInitialClips();
			}
		})();
		clipReadySignal.set(null);
	});

	$effect(() => {
		const targetClipId = $clipOverlaySignal;
		if (!targetClipId) return;
		console.log('[Feed] clipOverlaySignal fired:', targetClipId, 'setting overlayClipId');
		clipOverlaySignal.set(null);
		overlayClipId = targetClipId;
	});

	$effect(() => {
		const tap = $homeTapSignal;
		if (tap > 0) {
			homeTapSignal.set(0);
			if (overlayClipId) {
				handleOverlayDismiss();
			} else if (filter !== 'unwatched') {
				setFilter('unwatched');
			} else {
				activeIndex = 0;
				if (scrollContainer) scrollContainer.scrollTop = 0;
			}
		}
	});

	// Catch-up modal: show when 30+ unwatched clips and not recently dismissed
	$effect(() => {
		if (catchUpResolved) return;
		const count = $unwatchedCount;
		// Wait for real data (count starts at 0 before fetch resolves)
		if (count === 0 || loading) return;
		if (filter === 'unwatched' && !overlayActive && count >= 30 && get(catchUpDismissalExpired)) {
			showCatchUp = true;
		} else {
			catchUpResolved = true;
		}
	});

	async function handleCatchUpChoice(choice: 'all' | 'best') {
		showCatchUp = false;
		catchUpResolved = true;
		dismissCatchUp();

		if (choice === 'best') {
			loading = true;
			currentOffset = 0;
			const data = await fetchClips('unwatched', 30, 'best');
			if (data) {
				resetLastContributor();
				clips = data.clips;
				hasMore = false; // No pagination in best mode
				currentOffset = data.clips.length;

				// Dismiss all other unwatched clips (not in the best 30)
				const keepIds = data.clips.map((c) => c.id);
				fetch('/api/clips/dismiss', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ keepIds })
				}).then(() => fetchUnwatchedCount());

				addToast({
					type: 'success',
					message: 'Skipped clips can be found in Settings any time',
					autoDismiss: 5000
				});
			} else {
				toast.error('Failed to load clips');
			}
			loading = false;
		}
		// 'all' — normal feed already loaded, do nothing
	}

	function handleOverlayDismiss() {
		console.log('[Feed] handleOverlayDismiss, was:', overlayClipId);
		overlayClipId = null;
		overlayOpenComments = false;
		// Refresh feed to reflect any changes made in the overlay
		loadInitialClips();
		fetchUnwatchedCount();
	}

	function handleDelete(clipId: string) {
		const idx = clips.findIndex((c) => c.id === clipId);
		clips = clips.filter((c) => c.id !== clipId);
		currentOffset = Math.max(0, currentOffset - 1);
		if (activeIndex >= clips.length && clips.length > 0) activeIndex = clips.length - 1;
		else if (idx < activeIndex) activeIndex = Math.max(0, activeIndex - 1);
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
		isDragging = true;
	}
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}
	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			isDragging = false;
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		isDragging = false;
		const url = extractDroppedUrl(e.dataTransfer);
		if (!url) {
			addToast({ type: 'error', message: 'No link found', autoDismiss: 3000 });
			return;
		}
		try {
			const result = await submitClipUrl(url);
			if ('error' in result) {
				addToast({ type: 'error', message: result.error, autoDismiss: 4000 });
				return;
			}
			addToast({
				type: 'processing',
				message: `Adding ${result.clip.contentType === 'music' ? 'song' : 'video'} to feed...`,
				clipId: result.clip.id,
				contentType: result.clip.contentType,
				autoDismiss: 0
			});
			loadInitialClips();
		} catch {
			addToast({ type: 'error', message: 'Something went wrong', autoDismiss: 4000 });
		}
	}

	async function enablePush() {
		if (pushEnabling || !vapidPublicKey) return;
		pushEnabling = true;
		try {
			const sub = await subscribeToPush(vapidPublicKey);
			pushEnabled = !!sub;
			if (sub) addToast({ type: 'success', message: 'Notifications enabled', autoDismiss: 3000 });
		} finally {
			pushEnabling = false;
		}
	}

	$effect(() => {
		isDesktopFeed = matchMedia('(pointer: fine)').matches;
		const shareUrl = extractShareTargetUrl();
		if (shareUrl) {
			(async () => {
				try {
					const result = await submitClipUrl(shareUrl);
					if ('error' in result) {
						addToast({ type: 'error', message: result.error, autoDismiss: 4000 });
						return;
					}
					addToast({
						type: 'processing',
						message: `Adding ${result.clip.contentType === 'music' ? 'song' : 'video'} to feed...`,
						clipId: result.clip.id,
						contentType: result.clip.contentType,
						autoDismiss: 0
					});
				} catch {
					addToast({ type: 'error', message: 'Something went wrong', autoDismiss: 4000 });
				}
			})();
		}

		// Deep-link: open a specific clip in the overlay (and optionally open comments)
		const params = new URLSearchParams(window.location.search);
		const deepClipId = params.get('clip');
		const deepComments = params.get('comments') === 'true';
		console.log('[Feed] deep-link check:', {
			deepClipId,
			deepComments,
			search: window.location.search
		});
		if (deepClipId) {
			console.log(
				'[Feed] deep-link: opening overlay for clip',
				deepClipId,
				'comments:',
				deepComments
			);
			overlayOpenComments = deepComments;
			clipOverlaySignal.set(deepClipId);
			// Clean URL without triggering navigation
			const clean = new URL(window.location.href);
			clean.searchParams.delete('clip');
			clean.searchParams.delete('comments');
			history.replaceState(null, '', clean.pathname + clean.search || '/');
		}

		loadInitialClips();

		// Check push notification state for end-slide banner
		pushSupported = isPushSupported();
		if (pushSupported) {
			getExistingSubscription().then((sub) => {
				pushEnabled = !!sub;
			});
		}

		// Mark <html> so the body background matches the reel context — this makes the iOS
		// black-translucent status bar show a dark background rather than the light-mode white.
		document.documentElement.classList.add('feed-context');

		return () => {
			feedUiHidden.set(false);
			document.documentElement.classList.remove('feed-context');
		};
	});
</script>

<svelte:head>
	<title>{page.data.group?.name ?? 'scrolly'} · scrolly</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="drop-target"
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if isDragging}
		<div class="drop-overlay">
			<div class="drop-zone">
				<span class="drop-icon"><LinkIcon size={48} /></span>
				<p class="drop-text">Drop link to add</p>
			</div>
		</div>
	{/if}

	<FilterBar
		{filter}
		onfilter={setFilter}
		{swipeProgress}
		swiping={isHorizontalSwiping}
		hidden={$feedUiHidden}
		unwatchedCount={$unwatchedCount}
		pullOffset={pullY}
	/>

	{#if pullDistance > 0 || isRefreshing}
		<div
			class="pull-indicator"
			style="opacity: {isRefreshing || pullDistance >= PULL_THRESHOLD
				? 1
				: Math.min(pullDistance / PULL_THRESHOLD, 1)}"
		>
			{#if isRefreshing || pullDistance >= PULL_THRESHOLD}
				<span class="pull-spinner"></span>
			{:else}
				<span class="pull-arrow">
					<ArrowDownIcon size={24} weight="bold" />
				</span>
			{/if}
		</div>
	{/if}

	<div
		class="feed-slide"
		class:animating={swipeAnimating}
		class:pull-snapping={pullSnapping}
		style:transform={(() => {
			const parts: string[] = [];
			if (swipeX !== 0) parts.push(`translateX(${swipeX}px)`);
			if (pullY > 0 || pullSnapping) parts.push(`translateY(${pullY}px)`);
			return parts.length > 0 ? parts.join(' ') : undefined;
		})()}
		bind:this={feedWrapper}
	>
		{#if loading}
			<SkeletonReel />
		{:else if clips.length === 0}
			<div class="reel-empty">
				<span class="empty-icon"><FilmSlateIcon size={56} /></span>
				<p class="empty-title">All caught up</p>
				<p class="empty-sub">Drop a clip to kick things off</p>
				<button class="empty-cta" onclick={() => addVideoModalOpen.set(true)}>
					Add something
				</button>
			</div>
		{:else}
			<div class="reel-scroll" bind:this={scrollContainer}>
				{#each clips as clip, i (clip.id)}
					<div class="reel-slot" data-index={i}>
						{#if Math.abs(i - activeIndex) <= renderWindow}
							<ReelItem
								{clip}
								{currentUserId}
								{isHost}
								active={i === activeIndex && !overlayActive}
								index={i}
								{autoScroll}
								{gifEnabled}
								seenByOthers={clip.seenByOthers}
								deferWatched={isLastUnwatched && !clip.watched}
								deferFirstClip={clip.id === firstClipId && !clip.watched}
								onwatched={markWatched}
								onfavorited={toggleFavorite}
								onreaction={handleReaction}
								onretry={retryDownload}
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
				{#if loadingMore}
					<div class="reel-slot loading-more-slot">
						<div class="reel-placeholder"><span class="spinner"></span></div>
					</div>
				{:else if !hasMore}
					<div class="reel-slot end-slide" data-index={clips.length}>
						<div class="end-slide-content">
							<span class="end-slide-icon">
								<CheckCircleIcon size={56} weight="duotone" />
							</span>
							<p class="end-slide-title">
								{filter === 'unwatched' ? "You're all caught up!" : "That's all, folks!"}
							</p>
							<p class="end-slide-sub">
								{#if filter === 'unwatched'}
									Check back later for new clips
								{:else if filter === 'watched'}
									All your watched clips are above
								{:else}
									Your favorite clips are above
								{/if}
							</p>
							{#if $isStandalone && pushSupported && !pushEnabled}
								<button class="end-slide-banner" onclick={enablePush} disabled={pushEnabling}>
									🔔 {pushEnabling ? 'Enabling…' : 'Enable notifications'}
								</button>
							{:else if !$isStandalone && ($showInstallBanner || $showIosInstallBanner)}
								<button
									class="end-slide-banner"
									onclick={async () => {
										if ($showInstallBanner) await triggerInstall();
									}}
								>
									📲 Add scrolly to your home screen
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if !overlayActive}
	<ShortcutUpgradeBanner {lastLegacyShareAt} {usedNewShareFlow} {shortcutUrl} />
{/if}

{#if overlayClipId}
	<ClipOverlay
		clipId={overlayClipId}
		{currentUserId}
		{isHost}
		{autoScroll}
		{gifEnabled}
		openComments={overlayOpenComments}
		ondismiss={handleOverlayDismiss}
	/>
{/if}

{#if showCatchUp}
	<CatchUpModal unwatchedCount={$unwatchedCount} onchoice={handleCatchUpChoice} />
{/if}

<style>
	.pull-indicator {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 19;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: max(var(--space-sm), env(safe-area-inset-top));
		height: 48px;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}
	.pull-arrow {
		display: inline-flex;
		color: var(--reel-text-dim);
	}
	.pull-spinner {
		display: inline-block;
		width: 22px;
		height: 22px;
		border: 2.5px solid var(--reel-spinner-track);
		border-top-color: var(--accent-primary);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}
	.reel-scroll {
		height: calc(100dvh - var(--bottom-nav-height, 64px));
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		overscroll-behavior-y: none;
		scrollbar-width: none;
	}
	.reel-scroll::-webkit-scrollbar {
		display: none;
	}
	.reel-slot {
		height: calc(100dvh - var(--bottom-nav-height, 64px));
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
	.loading-more-slot {
		height: auto;
		min-height: 80px;
		scroll-snap-align: none;
	}
	.reel-empty {
		height: calc(100dvh - var(--bottom-nav-height, 64px));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		background: var(--reel-bg);
		animation: empty-in 400ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	@keyframes empty-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.empty-icon {
		color: var(--reel-text-subtle);
		opacity: 0.5;
		margin-bottom: var(--space-xs);
	}
	.empty-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--reel-text);
		margin: 0;
	}
	.empty-sub {
		color: var(--reel-text-subtle);
		font-size: 0.875rem;
		margin: 0 0 var(--space-md);
	}
	.empty-cta {
		padding: 10px 24px;
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.empty-cta:active {
		transform: scale(0.97);
	}
	.spinner {
		display: inline-block;
		width: 32px;
		height: 32px;
		border: 2.5px solid var(--reel-spinner-track);
		border-top-color: var(--reel-text);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.feed-slide {
		height: 100%;
		touch-action: pan-y;
		overscroll-behavior-x: none;
	}
	.feed-slide.animating {
		transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
	}
	.feed-slide.pull-snapping {
		transition: transform 0.25s ease;
	}
	.drop-target {
		height: calc(100dvh - var(--bottom-nav-height, 64px));
		position: relative;
		overflow: hidden;
	}
	.drop-overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: var(--reel-gradient-heavy);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fade-in 0.15s ease;
	}
	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-3xl);
		border: 2px dashed var(--accent-primary);
		border-radius: var(--radius-xl);
	}
	.drop-icon {
		color: var(--accent-primary);
	}
	.drop-text {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}
	.end-slide {
		background: var(--reel-bg);
	}
	.end-slide-content {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		animation: empty-in 400ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	.end-slide-icon {
		color: var(--accent-primary);
		opacity: 0.7;
		margin-bottom: var(--space-xs);
	}
	.end-slide-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--reel-text);
		margin: 0;
	}
	.end-slide-sub {
		color: var(--reel-text-subtle);
		font-size: 0.875rem;
		margin: 0;
	}
	.end-slide-banner {
		margin-top: var(--space-lg);
		padding: var(--space-sm) var(--space-xl);
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-full);
		color: var(--reel-text);
		font-family: var(--font-display);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}
	.end-slide-banner:active {
		transform: scale(0.97);
		background: rgba(255, 255, 255, 0.16);
	}
	.end-slide-banner:disabled {
		opacity: 0.6;
		cursor: default;
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

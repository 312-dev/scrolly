<script lang="ts">
	/* eslint-disable max-lines */
	import ReelItem from '$lib/components/ReelItem.svelte';
	import AddVideoModal from '$lib/components/AddVideoModal.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SkeletonReel from '$lib/components/SkeletonReel.svelte';
	import LinkIcon from 'phosphor-svelte/lib/LinkIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import FilmSlateIcon from 'phosphor-svelte/lib/FilmSlateIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import { addVideoModalOpen } from '$lib/stores/addVideoModal';
	import ClipOverlay from '$lib/components/ClipOverlay.svelte';
	import { addToast, toast, clipReadySignal, clipOverlaySignal } from '$lib/stores/toasts';
	import { homeTapSignal } from '$lib/stores/homeTap';
	import { unwatchedCount, fetchUnwatchedCount } from '$lib/stores/notifications';
	import { feedUiHidden } from '$lib/stores/uiHidden';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import type { FeedClip } from '$lib/types';
	import type { FeedFilter, FeedSort } from '$lib/feed';
	import {
		fetchClips,
		fetchMoreClips,
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
	const FILTERS: FeedFilter[] = ['unwatched', 'watched', 'favorites'];
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
	const autoScroll = $derived(page.data.user?.autoScroll ?? false);
	const gifEnabled = $derived(!!page.data.gifEnabled);

	async function loadInitialClips() {
		loading = true;
		currentOffset = 0;
		hasMore = true;
		const data = await fetchClips(filter, PAGE_SIZE, sort);
		if (data) {
			clips = data.clips;
			hasMore = data.hasMore;
			currentOffset = data.clips.length;
		} else {
			toast.error('Failed to load clips');
		}
		loading = false;
	}

	async function loadMore() {
		if (loadingMore || !hasMore || loading) return;
		loadingMore = true;
		const data = await fetchMoreClips(filter, currentOffset, PAGE_SIZE, sort);
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
			clips = clips.map((c) => (c.id === clipId ? { ...c, favorited: data.favorited } : c));
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

		function handleTouchStart(e: TouchEvent) {
			if (getScrollTop() <= 0 && !isRefreshing) {
				touchStartY = e.touches[0].clientY;
				isPullingActive = true;
			}
		}

		function handleTouchMove(e: TouchEvent) {
			if (!isPullingActive || isRefreshing || isHorizontalSwiping) return;
			if (getScrollTop() > 0) {
				isPullingActive = false;
				pullDistance = 0;
				return;
			}
			const delta = e.touches[0].clientY - touchStartY;
			if (delta > 0) {
				pullDistance = Math.min(delta * 0.4, 120);
				if (pullDistance > 10) e.preventDefault();
			} else {
				pullDistance = 0;
			}
		}

		function handleTouchEnd() {
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

		el.addEventListener('touchstart', handleTouchStart, { passive: true });
		el.addEventListener('touchmove', handleTouchMove, { passive: false });
		el.addEventListener('touchend', handleTouchEnd, { passive: true });
		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => {
			el.removeEventListener('touchstart', handleTouchStart);
			el.removeEventListener('touchmove', handleTouchMove);
			el.removeEventListener('touchend', handleTouchEnd);
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

		function onTouchStart(e: TouchEvent) {
			if (swipeAnimating) return;
			const target = e.target as HTMLElement;
			if (target.closest('.progress-bar')) {
				tracking = false;
				return;
			}
			tracking = true;
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
			decided = false;
			isHorizontal = false;
			isHorizontalSwiping = false;
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
				isHorizontalSwiping = true;
			}

			if (!isHorizontal) return;
			e.preventDefault();

			const atFirst = filterIndex === 0 && dx > 0;
			const atLast = filterIndex === FILTERS.length - 1 && dx < 0;
			swipeX = atFirst || atLast ? dx * 0.15 : dx;
		}

		function onTouchEnd() {
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

		el.addEventListener('touchstart', onTouchStart, { passive: true });
		el.addEventListener('touchmove', onTouchMove, { passive: false });
		el.addEventListener('touchend', onTouchEnd, { passive: true });
		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
			el.removeEventListener('touchend', onTouchEnd);
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

	function handleOverlayDismiss() {
		overlayClipId = null;
		overlayOpenComments = false;
		// Refresh feed to reflect any changes made in the overlay
		loadInitialClips();
		fetchUnwatchedCount();
	}

	function handleCaptionEdit(clipId: string, newCaption: string) {
		clips = clips.map((c) => (c.id === clipId ? { ...c, title: newCaption } : c));
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

	onMount(() => {
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
		if (deepClipId) {
			overlayOpenComments = deepComments;
			clipOverlaySignal.set(deepClipId);
			// Clean URL without triggering navigation
			const clean = new URL(window.location.href);
			clean.searchParams.delete('clip');
			clean.searchParams.delete('comments');
			history.replaceState(null, '', clean.pathname + clean.search || '/');
		}

		loadInitialClips();
	});

	onDestroy(() => {
		feedUiHidden.set(false);
	});
</script>

<svelte:head>
	<title>scrolly</title>
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
								active={i === activeIndex && !overlayActive}
								index={i}
								{autoScroll}
								{gifEnabled}
								canEditCaption={clip.addedBy === currentUserId}
								seenByOthers={clip.seenByOthers}
								onwatched={markWatched}
								onfavorited={toggleFavorite}
								onreaction={handleReaction}
								onretry={retryDownload}
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
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if overlayClipId}
	<ClipOverlay
		clipId={overlayClipId}
		{currentUserId}
		{autoScroll}
		{gifEnabled}
		openComments={overlayOpenComments}
		ondismiss={handleOverlayDismiss}
	/>
{/if}

{#if $addVideoModalOpen}
	<AddVideoModal ondismiss={() => addVideoModalOpen.set(false)} />
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
		height: 100dvh;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: none;
		scrollbar-width: none;
	}
	.reel-scroll::-webkit-scrollbar {
		display: none;
	}
	.reel-slot {
		height: 100dvh;
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
		height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		background: var(--bg-primary);
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
		color: var(--text-muted);
		opacity: 0.5;
		margin-bottom: var(--space-xs);
	}
	.empty-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}
	.empty-sub {
		color: var(--text-muted);
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
	}
	.feed-slide.animating {
		transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
	}
	.feed-slide.pull-snapping {
		transition: transform 0.25s ease;
	}
	.drop-target {
		height: 100dvh;
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
		background: var(--bg-primary);
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
		color: var(--text-primary);
		margin: 0;
	}
	.end-slide-sub {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
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

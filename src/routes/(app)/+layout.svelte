<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { addVideoModalOpen } from '$lib/stores/addVideoModal';
	import { activitySheetOpen } from '$lib/stores/activitySheet';
	import { homeTapSignal } from '$lib/stores/homeTap';
	import { unreadCount, startPolling, stopPolling } from '$lib/stores/notifications';
	import { globalMuted } from '$lib/stores/mute';
	import { initAudioContext } from '$lib/audio/normalizer';
	import { feedUiHidden } from '$lib/stores/uiHidden';
	import { fetchGroupMembers } from '$lib/stores/members';
	import ActivitySheet from '$lib/components/ActivitySheet.svelte';
	import AddVideoModal from '$lib/components/AddVideoModal.svelte';
	import BellIcon from 'phosphor-svelte/lib/BellIcon';
	import HouseIcon from 'phosphor-svelte/lib/HouseIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
	import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
	const { children }: { children: Snippet } = $props();

	let bottomTabsEl: HTMLElement | undefined = $state();
	const isFeed = $derived(page.url.pathname === '/');
	const isSettings = $derived(page.url.pathname === '/settings');
	const isFaves = $derived(page.url.pathname === '/favorites');

	const pageTitle = $derived.by(() => {
		if (isSettings) return 'Settings';
		if (isFaves) return 'Faves';
		return '';
	});

	onMount(() => {
		startPolling();
		fetchGroupMembers();

		// Measure actual bottom nav height and expose as CSS variable.
		// This adapts to the real safe-area insets on each device instead of
		// hardcoding 80px + env(safe-area-inset-bottom) everywhere.
		const updateNavHeight = () => {
			if (bottomTabsEl) {
				const h = bottomTabsEl.offsetHeight;
				document.documentElement.style.setProperty('--bottom-nav-height', `${h}px`);
			}
		};
		const navObserver = new ResizeObserver(updateNavHeight);
		if (bottomTabsEl) {
			navObserver.observe(bottomTabsEl);
			updateNavHeight();
		}

		// Initialize mute state from user preference
		const user = page.data?.user;
		if (user) {
			globalMuted.set(user.mutedByDefault ?? true);
		}

		// Initialize AudioContext on first user interaction (for volume normalization)
		function handleFirstInteraction() {
			initAudioContext();
			document.removeEventListener('click', handleFirstInteraction, true);
			document.removeEventListener('touchstart', handleFirstInteraction, true);
		}
		document.addEventListener('click', handleFirstInteraction, true);
		document.addEventListener('touchstart', handleFirstInteraction, true);

		// Lock to portrait orientation (works in installed PWA / fullscreen contexts)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lock() not in all TS lib defs
		(screen.orientation as any)?.lock?.('portrait-primary').catch(() => {});

		// Sync theme-color meta tags with current theme for PWA chrome blending
		const themeObserver = new MutationObserver(() => syncThemeColor());
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
		const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
		darkMq.addEventListener('change', syncThemeColor);

		return () => {
			stopPolling();
			navObserver.disconnect();
			themeObserver.disconnect();
			darkMq.removeEventListener('change', syncThemeColor);
			document.documentElement.style.removeProperty('--bottom-nav-height');
		};
	});

	function syncThemeColor() {
		const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
		const cs = getComputedStyle(document.documentElement);
		// On the feed, use --reel-bg so the iOS status bar matches the dark reel context.
		// On all other pages, use --bg-primary to match the app shell theme.
		const color = isFeed
			? cs.getPropertyValue('--reel-bg').trim()
			: cs.getPropertyValue('--bg-primary').trim();
		metas.forEach((m) => m.setAttribute('content', color));
	}

	// Re-sync when navigating between feed and other pages
	$effect(() => {
		// eslint-disable-next-line sonarjs/void-use -- reading isFeed to trigger effect re-run
		void isFeed;
		syncThemeColor();
	});
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- static routes, resolve() unnecessary -->
<div class="app-shell">
	{#if isFeed}
		<!-- Feed: notification bell floats top-right -->
		<button
			class="feed-notif-btn"
			class:ui-hidden={$feedUiHidden}
			onclick={() => activitySheetOpen.set(true)}
		>
			<BellIcon size={22} />
			{#if $unreadCount > 0}
				<span class="notif-badge">{$unreadCount > 99 ? '99+' : $unreadCount}</span>
			{/if}
		</button>
	{:else}
		<!-- Non-feed pages: top bar with title -->
		<nav class="top-bar">
			<span class="top-title">{pageTitle}</span>
			{#if !isSettings}
				<button class="top-bar-action" onclick={() => activitySheetOpen.set(true)}>
					<BellIcon size={20} />
					{#if $unreadCount > 0}
						<span class="notif-badge">{$unreadCount > 99 ? '99+' : $unreadCount}</span>
					{/if}
				</button>
			{/if}
		</nav>
	{/if}
	<main class:immersive={isFeed}>
		{@render children()}
	</main>
	<nav
		class="bottom-tabs"
		class:overlay-mode={isFeed}
		class:ui-hidden={isFeed && $feedUiHidden}
		bind:this={bottomTabsEl}
	>
		{#if isFeed}
			<button class="tab active" onclick={() => homeTapSignal.update((n) => n + 1)}>
				<HouseIcon size={24} weight="fill" />
				<span>Home</span>
			</button>
		{:else}
			<a href="/" class="tab">
				<HouseIcon size={24} />
				<span>Home</span>
			</a>
		{/if}
		<button class="tab add-tab" onclick={() => addVideoModalOpen.set(true)}>
			<div class="add-icon">
				<PlusIcon size={18} weight="bold" />
			</div>
			<span>Add</span>
		</button>
		<a href="/favorites" class="tab" class:active={isFaves}>
			<HeartIcon size={24} weight={isFaves ? 'fill' : 'regular'} />
			<span>Faves</span>
		</a>
		<a href="/settings" class="tab" class:active={isSettings}>
			<GearSixIcon size={24} weight={isSettings ? 'fill' : 'regular'} />
			<span>Settings</span>
		</a>
	</nav>
</div>

{#if $activitySheetOpen}
	<ActivitySheet ondismiss={() => activitySheetOpen.set(false)} />
{/if}

{#if $addVideoModalOpen}
	<AddVideoModal ondismiss={() => addVideoModalOpen.set(false)} />
{/if}

<style>
	.app-shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	/* Feed: floating notification bell (top-right) */
	.feed-notif-btn {
		position: fixed;
		top: calc(max(var(--space-md), env(safe-area-inset-top)) - 1px);
		right: var(--space-sm);
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 34px;
		border-radius: var(--radius-full);
		color: var(--reel-text);
		background: none;
		border: none;
		cursor: pointer;
		filter: drop-shadow(0 1px 3px var(--reel-text-shadow));
		transition: opacity 0.3s ease;
	}

	.feed-notif-btn.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.feed-notif-btn :global(svg) {
		width: 22px;
		height: 22px;
	}

	.notif-badge {
		position: absolute;
		top: 2px;
		right: 2px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: var(--accent-magenta);
		color: var(--constant-white);
		font-size: 0.625rem;
		font-weight: 700;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		animation: badge-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes badge-pop {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}

	/* Non-feed: top bar with title */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: calc(var(--space-md) + env(safe-area-inset-top)) var(--space-lg) var(--space-md);
		background: var(--bg-primary);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.top-title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.0625rem;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}

	.top-bar-action {
		position: absolute;
		right: var(--space-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		color: var(--text-secondary);
		background: none;
		border: none;
		cursor: pointer;
	}

	.top-bar-action :global(svg) {
		width: 20px;
		height: 20px;
	}

	main {
		flex: 1;
		padding: var(--space-lg) var(--space-sm);
		padding-bottom: var(--bottom-nav-height, 64px);
	}

	main.immersive {
		padding: 0;
		overflow: hidden;
	}

	/* Bottom tab bar — 3 tabs: Home, Add, Settings */
	.bottom-tabs {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		background: color-mix(in srgb, var(--bg-elevated) 30%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
		padding: var(--space-xs) 0;
		padding-bottom: max(var(--space-xs), env(safe-area-inset-bottom));
		z-index: 10;
		transition: opacity 0.3s ease;
	}

	.bottom-tabs.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.bottom-tabs.overlay-mode {
		background: var(--reel-bg-elevated);
		border-top-color: transparent;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		z-index: 50;
	}

	.tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		text-decoration: none;
		color: var(--text-muted);
		font-size: 0.625rem;
		font-family: var(--font-body);
		padding: 2px 0;
		transition: color 0.2s ease;
		background: none;
		border: none;
		cursor: pointer;
	}

	.overlay-mode .tab {
		color: var(--reel-text-subtle);
	}

	.tab.active {
		color: var(--text-primary);
	}

	.overlay-mode .tab.active {
		color: var(--reel-text);
	}

	.tab :global(svg) {
		width: 24px;
		height: 24px;
	}

	.add-tab:active .add-icon {
		transform: scale(0.93);
	}

	.add-icon {
		transition: transform 100ms ease;
		width: 36px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent-primary);
		border-radius: 6px;
		color: var(--bg-primary);
	}

	.add-icon :global(svg) {
		width: 18px;
		height: 18px;
	}
</style>

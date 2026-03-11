<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { updateFavicon } from '$lib/iconSvg';
	import { clipOverlaySignal, openCommentsSignal } from '$lib/stores/toasts';
	import ToastStack from '$lib/components/ToastStack.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import InstallBanner from '$lib/components/InstallBanner.svelte';
	import SwUpdateToast from '$lib/components/SwUpdateToast.svelte';
	import CloutChangeModal from '$lib/components/CloutChangeModal.svelte';
	import {
		isStandalone,
		detectStandaloneMode,
		initInstallPrompt,
		initSwUpdateListener
	} from '$lib/stores/pwa';

	const { children } = $props();

	const NOTIFICATION_CLICK_CACHE = 'notification-click';
	const NOTIFICATION_CLICK_KEY = '/__notification_url';

	/** Shared handler for notification deep-link URLs (used by postMessage and visibilitychange). */
	function handleNotificationUrl(url: string) {
		const parsed = new URL(url, window.location.origin);
		const clipId = parsed.searchParams.get('clip');
		const comments = parsed.searchParams.get('comments') === 'true';

		if (clipId && window.location.pathname === '/') {
			console.log('[Layout] on feed, opening overlay via signal:', clipId);
			clipOverlaySignal.set(clipId);
			if (comments) {
				setTimeout(() => openCommentsSignal.set(clipId), 150);
			}
		} else {
			console.log('[Layout] navigating to feed with deep link:', url);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() expects route ID, not URL with query params
			goto(url);
		}
	}

	/** Clear the notification URL stash (called after successful postMessage delivery). */
	async function clearNotificationStash() {
		try {
			const cache = await caches.open(NOTIFICATION_CLICK_CACHE);
			await cache.delete(NOTIFICATION_CLICK_KEY);
		} catch {
			/* ignore */
		}
	}

	/**
	 * Check for a stashed notification URL from the service worker.
	 * Covers frozen/backgrounded PWA clients where postMessage was silently lost.
	 */
	async function checkStashedNotification() {
		try {
			const cache = await caches.open(NOTIFICATION_CLICK_CACHE);
			const res = await cache.match(NOTIFICATION_CLICK_KEY);
			if (!res) return;
			const { url, ts } = await res.json();
			await cache.delete(NOTIFICATION_CLICK_KEY);
			if (Date.now() - ts > 30_000) return;
			console.log('[Layout] found stashed notification URL:', url);
			handleNotificationUrl(url);
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		isStandalone.set(detectStandaloneMode());
		initInstallPrompt();
		initSwUpdateListener();

		// Set dynamic favicon with the current accent color
		const accent = getComputedStyle(document.documentElement)
			.getPropertyValue('--accent-primary')
			.trim();
		if (accent) updateFavicon(accent);

		// Listen for push notification clicks forwarded by the service worker.
		// Uses postMessage for smooth in-app navigation when the app is active.
		function handleSwMessage(event: MessageEvent) {
			if (event.data?.type !== 'NOTIFICATION_CLICK') return;
			const url = event.data.url || '/';
			console.log('[Layout] NOTIFICATION_CLICK received, url:', url);
			clearNotificationStash();
			handleNotificationUrl(url);
		}

		// Fallback for frozen/backgrounded PWA clients: when the page becomes
		// visible again, check if the SW stashed a notification URL in the Cache API.
		function handleVisibilityChange() {
			if (document.visibilityState === 'visible') {
				checkStashedNotification();
			}
		}

		navigator.serviceWorker?.addEventListener('message', handleSwMessage);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Also check on mount — covers the case where the app was just opened
		// from a killed state via openWindow and the stash wasn't cleared yet.
		// Delay slightly so the feed page's own deep-link handler (which reads
		// ?clip= and clears the stash) has time to run first, avoiding duplicates.
		setTimeout(() => checkStashedNotification(), 100);

		return () => {
			navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

{@render children()}
<ToastStack />
<ConfirmDialog />
<InstallBanner />
<SwUpdateToast />
<CloutChangeModal />

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}

	/* Dark theme (default) */
	:global(:root) {
		font-size: 18px;
		--bg-primary: #000000;
		--bg-elevated: #111111;
		--bg-surface: #1a1a1a;
		--bg-subtle: #222222;

		--text-primary: #ffffff;
		--text-secondary: #999999;
		--text-muted: #666666;

		--border: #333333;

		--accent-primary: #ff6b35;
		--accent-primary-dark: #d4551f;
		--accent-magenta: #ff2d78;
		--accent-blue: #4a9eff;

		--success: #38a169;
		--error: #e53e3e;
		--warning: #fbbf24;

		--bg-sky: #7ec8e3;
		--bg-sky-light: #b8dfee;

		--picker-bg: rgba(30, 30, 30, 0.9);
		--overlay-btn: rgba(255, 255, 255, 0.15);
		--overlay-btn-active: rgba(255, 255, 255, 0.25);
		--overlay-text: rgba(255, 255, 255, 0.6);
		--overlay-track: rgba(255, 255, 255, 0.2);

		/* Reel/feed background — always dark regardless of theme (used for empty/end states in the feed) */
		--reel-bg: #0d0d0d;
		--reel-bg-elevated: #1a1a1a;

		/* Reel/feed overlay gradients & shadows */
		--reel-gradient-heavy: rgba(0, 0, 0, 0.85);
		--reel-gradient-medium: rgba(0, 0, 0, 0.7);
		--reel-gradient-soft: rgba(0, 0, 0, 0.6);
		--reel-gradient-faint: rgba(0, 0, 0, 0.3);
		--reel-text-shadow: rgba(0, 0, 0, 0.6);
		--reel-icon-shadow: rgba(0, 0, 0, 0.4);

		/* Reel overlay text (constant across themes — always over video) */
		--reel-text: #fff;
		--reel-text-bright: rgba(255, 255, 255, 0.9);
		--reel-text-medium: rgba(255, 255, 255, 0.8);
		--reel-text-dim: rgba(255, 255, 255, 0.7);
		--reel-text-subtle: rgba(255, 255, 255, 0.5);
		--reel-text-faint: rgba(255, 255, 255, 0.45);
		--reel-text-ghost: rgba(255, 255, 255, 0.35);
		--reel-text-placeholder: rgba(255, 255, 255, 0.3);
		--reel-text-disabled: rgba(255, 255, 255, 0.25);

		/* Reel overlay surfaces (constant across themes) */
		--reel-avatar-border: rgba(255, 255, 255, 0.25);
		--reel-frosted-bg: rgba(255, 255, 255, 0.15);
		--reel-frosted-bg-active: rgba(255, 255, 255, 0.2);
		--reel-glass-border: rgba(255, 255, 255, 0.15);
		--reel-glass-pill-bg: rgba(255, 255, 255, 0.12);
		--reel-icon-circle-bg: rgba(30, 30, 30, 0.55);
		--reel-icon-circle-active: rgba(50, 50, 50, 0.7);
		--reel-input-bg: rgba(0, 0, 0, 0.5);
		--reel-input-border: rgba(255, 255, 255, 0.2);
		--reel-picker-bg: rgba(0, 0, 0, 0.65);
		--reel-picker-border: rgba(255, 255, 255, 0.12);
		--reel-picker-hover: rgba(255, 255, 255, 0.08);
		--reel-picker-active: rgba(255, 255, 255, 0.12);
		--reel-spinner-track: rgba(255, 255, 255, 0.2);
		--reel-spinner-head: rgba(255, 255, 255, 0.7);

		/* Constant white — used for toggle thumbs, badge text, and other elements that stay white in both themes */
		--constant-white: #fff;

		--radius-sm: 8px;
		--radius-md: 12px;
		--radius-lg: 16px;
		--radius-xl: 20px;
		--radius-full: 9999px;

		--space-xs: 0.25rem;
		--space-sm: 0.5rem;
		--space-md: 0.75rem;
		--space-lg: 1rem;
		--space-xl: 1.5rem;
		--space-2xl: 2rem;
		--space-3xl: 3rem;

		--font-display: 'Sora', system-ui, sans-serif;
		--font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
	}

	/* System preference: light (when no manual override to dark) */
	@media (prefers-color-scheme: light) {
		:global(:root:not([data-theme='dark'])) {
			--bg-primary: #ffffff;
			--bg-elevated: #f5f5f5;
			--bg-surface: #eeeeee;
			--bg-subtle: #e0e0e0;
			--text-primary: #000000;
			--text-secondary: #555555;
			--text-muted: #999999;
			--border: #dddddd;
			--picker-bg: rgba(255, 255, 255, 0.9);
			--overlay-btn: rgba(0, 0, 0, 0.1);
			--overlay-btn-active: rgba(0, 0, 0, 0.15);
			--overlay-text: rgba(0, 0, 0, 0.5);
			--overlay-track: rgba(0, 0, 0, 0.15);
			--reel-bg: #1c1c1c;
			--reel-bg-elevated: #262626;
			--reel-gradient-heavy: rgba(0, 0, 0, 0.55);
			--reel-gradient-medium: rgba(0, 0, 0, 0.45);
			--reel-gradient-soft: rgba(0, 0, 0, 0.3);
			--reel-gradient-faint: rgba(0, 0, 0, 0.12);
			--reel-text-shadow: rgba(0, 0, 0, 0.35);
			--reel-icon-shadow: rgba(0, 0, 0, 0.25);
		}
	}

	/* Manual override: light */
	:global(:root[data-theme='light']) {
		--bg-primary: #ffffff;
		--bg-elevated: #f5f5f5;
		--bg-surface: #eeeeee;
		--bg-subtle: #e0e0e0;
		--text-primary: #000000;
		--text-secondary: #555555;
		--text-muted: #999999;
		--border: #dddddd;
		--picker-bg: rgba(255, 255, 255, 0.9);
		--overlay-btn: rgba(0, 0, 0, 0.1);
		--overlay-btn-active: rgba(0, 0, 0, 0.15);
		--overlay-text: rgba(0, 0, 0, 0.5);
		--overlay-track: rgba(0, 0, 0, 0.15);
		--reel-bg: #1c1c1c;
		--reel-bg-elevated: #262626;
		--reel-gradient-heavy: rgba(0, 0, 0, 0.55);
		--reel-gradient-medium: rgba(0, 0, 0, 0.45);
		--reel-gradient-soft: rgba(0, 0, 0, 0.3);
		--reel-gradient-faint: rgba(0, 0, 0, 0.12);
		--reel-text-shadow: rgba(0, 0, 0, 0.35);
		--reel-icon-shadow: rgba(0, 0, 0, 0.25);
	}

	/* Feed context: override body background so the iOS black-translucent status bar
	   shows the reel bg color rather than the light-mode white */
	:global(html.feed-context),
	:global(html.feed-context body) {
		background: var(--reel-bg);
	}

	:global(body) {
		margin: 0;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: var(--font-body);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		overscroll-behavior: none;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}

	:global(input, textarea, [contenteditable]) {
		-webkit-touch-callout: default;
		-webkit-user-select: text;
		user-select: text;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*, *::before, *::after) {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
			scroll-behavior: auto !important;
		}
	}
</style>

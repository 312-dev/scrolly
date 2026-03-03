import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import { showInstallBanner } from './pwa';

const DISMISS_KEY = 'scrolly_shortcut_upgrade_dismissed_at';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getDismissedAt(): number {
	if (!browser) return 0;
	const val = localStorage.getItem(DISMISS_KEY);
	return val ? parseInt(val, 10) : 0;
}

function isAppleDevice(): boolean {
	if (!browser) return false;
	return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

const dismissedAt = writable(getDismissedAt());

const dismissalExpired = derived(dismissedAt, ($ts) => {
	if ($ts === 0) return true; // never dismissed
	return Date.now() - $ts > SEVEN_DAYS_MS;
});

/**
 * Client-side conditions for showing the shortcut upgrade banner.
 * Server-side conditions (lastLegacyShareAt, usedNewShareFlow) are
 * checked in the component via props from page.data.user.
 */
export const showShortcutUpgrade = derived(
	[dismissalExpired, showInstallBanner],
	([$expired, $showInstall]) => isAppleDevice() && $expired && !$showInstall
);

export function dismissShortcutUpgrade(): void {
	const now = Date.now();
	dismissedAt.set(now);
	if (browser) {
		localStorage.setItem(DISMISS_KEY, String(now));
	}
}

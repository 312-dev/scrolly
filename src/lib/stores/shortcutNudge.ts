import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import { showInstallBanner } from './pwa';

const STORAGE_KEY = 'scrolly_shortcut_nudge_dismissed';

function getInitial(): boolean {
	if (!browser) return false;
	return localStorage.getItem(STORAGE_KEY) === 'true';
}

function isAppleDevice(): boolean {
	if (!browser) return false;
	return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

const shortcutNudgeDismissed = writable(getInitial());

/** Show the shortcut nudge on Apple devices (iOS + Mac), when install banner is not visible and nudge hasn't been dismissed */
export const showShortcutNudge = derived(
	[shortcutNudgeDismissed, showInstallBanner],
	([$dismissed, $showInstall]) => isAppleDevice() && !$dismissed && !$showInstall
);

export function dismissShortcutNudge(): void {
	shortcutNudgeDismissed.set(true);
	if (browser) {
		localStorage.setItem(STORAGE_KEY, 'true');
	}
}

import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';

const DISMISS_KEY = 'scrolly_catchup_dismissed_at';
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function getDismissedAt(): number {
	if (!browser) return 0;
	const val = localStorage.getItem(DISMISS_KEY);
	if (!val) return 0;
	const ts = parseInt(val, 10);
	if (isNaN(ts)) return 0;
	// Clean up expired entries
	if (Date.now() - ts > TWELVE_HOURS_MS) {
		localStorage.removeItem(DISMISS_KEY);
		return 0;
	}
	return ts;
}

const dismissedAt = writable(getDismissedAt());

/** True when the catch-up modal has never been dismissed or the 12h cooldown has expired. */
export const catchUpDismissalExpired = derived(dismissedAt, ($ts) => {
	if ($ts === 0) return true;
	return Date.now() - $ts > TWELVE_HOURS_MS;
});

/** Record that the user dismissed the catch-up modal (hides it for 12 hours). */
export function dismissCatchUp(): void {
	const now = Date.now();
	dismissedAt.set(now);
	if (browser) {
		localStorage.setItem(DISMISS_KEY, String(now));
	}
}

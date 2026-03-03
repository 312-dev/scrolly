import { writable } from 'svelte/store';

export const unreadCount = writable<number>(0);
export const unwatchedCount = writable<number>(0);

let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function fetchUnreadCount(): Promise<void> {
	try {
		const res = await fetch('/api/notifications/unread-count');
		if (res.ok) {
			const data = await res.json();
			unreadCount.set(data.count);
		}
	} catch (err) {
		console.warn('[notifications]', err);
	}
}

export async function fetchUnwatchedCount(): Promise<void> {
	try {
		const res = await fetch('/api/clips/unwatched-count');
		if (res.ok) {
			const data = await res.json();
			unwatchedCount.set(data.count);
			updateAppBadge(data.count);
		}
	} catch (err) {
		console.warn('[unwatched-count]', err);
	}
}

function updateAppBadge(count: number): void {
	if (!('setAppBadge' in navigator)) return;
	if (count > 0) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Badge API not in lib.dom.d.ts
		(navigator as any).setAppBadge(count).catch((err: unknown) => console.warn('[app-badge]', err));
	} else {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Badge API not in lib.dom.d.ts
		(navigator as any).clearAppBadge().catch((err: unknown) => console.warn('[app-badge]', err));
	}
}

export function startPolling(intervalMs = 30000): void {
	fetchUnreadCount();
	fetchUnwatchedCount();
	if (pollInterval) clearInterval(pollInterval);
	pollInterval = setInterval(() => {
		fetchUnreadCount();
		fetchUnwatchedCount();
	}, intervalMs);
}

export function stopPolling(): void {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
}

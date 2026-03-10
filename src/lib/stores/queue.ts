import { writable } from 'svelte/store';

export const queueCount = writable<number>(0);

export async function fetchQueueCount(): Promise<void> {
	try {
		const res = await fetch('/api/queue/count');
		if (res.ok) {
			const data = await res.json();
			queueCount.set(data.count);
		}
	} catch (err) {
		console.warn('[queue-count]', err);
	}
}

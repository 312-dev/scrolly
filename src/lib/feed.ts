import type { FeedClip } from '$lib/types';
import { fetchUnwatchedCount } from '$lib/stores/notifications';
import { clearPushNotifications } from '$lib/push';

export type FeedFilter = 'all' | 'unwatched' | 'watched' | 'favorites' | 'uploads';
export type FeedSort = 'oldest' | 'round-robin' | 'best';

export function buildClipParams(
	filter: FeedFilter,
	offset: number,
	pageSize: number,
	sort?: FeedSort
): URLSearchParams {
	const params = new URLSearchParams();
	if (filter !== 'all') params.set('filter', filter);
	if (sort && sort !== 'oldest') params.set('sort', sort);
	params.set('limit', String(pageSize));
	params.set('offset', String(offset));
	return params;
}

export async function fetchClips(
	filter: FeedFilter,
	pageSize: number,
	sort?: FeedSort,
	offset = 0
): Promise<{ clips: FeedClip[]; hasMore: boolean } | null> {
	try {
		const params = buildClipParams(filter, offset, pageSize, sort);
		const res = await fetch(`/api/clips?${params}`);
		if (res.ok) return res.json();
		return null;
	} catch (err) {
		console.warn('[feed]', err);
		return null;
	}
}

export async function markClipWatched(clipId: string): Promise<void> {
	await fetch(`/api/clips/${clipId}/watched`, { method: 'POST' });
	fetchUnwatchedCount();
	clearPushNotifications(`new-clip-${clipId}`);
}

export async function toggleClipFavorite(clipId: string): Promise<{ favorited: boolean } | null> {
	try {
		const res = await fetch(`/api/clips/${clipId}/favorite`, { method: 'POST' });
		if (res.ok) return res.json();
		return null;
	} catch (err) {
		console.warn('[feed]', err);
		return null;
	}
}

export async function retryClipDownload(clipId: string): Promise<boolean> {
	const res = await fetch(`/api/clips/${clipId}/retry`, { method: 'POST' });
	return res.ok;
}

export async function sendClipReaction(
	clipId: string,
	emoji: string
): Promise<{ reactions: Record<string, { count: number; reacted: boolean }> } | null> {
	try {
		const res = await fetch(`/api/clips/${clipId}/reactions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ emoji })
		});
		if (res.ok) return res.json();
		return null;
	} catch (err) {
		console.warn('[feed]', err);
		return null;
	}
}

export async function fetchSingleClip(clipId: string): Promise<FeedClip | null> {
	try {
		const res = await fetch(`/api/clips/${clipId}`);
		if (res.ok) return res.json();
		return null;
	} catch (err) {
		console.warn('[feed]', err);
		return null;
	}
}

export async function submitClipUrl(
	url: string
): Promise<{ clip: { id: string; contentType: string } } | { error: string }> {
	const res = await fetch('/api/clips', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url })
	});
	const data = await res.json();
	if (!res.ok) return { error: data.error || 'Failed to add' };
	return data;
}

export function extractDroppedUrl(dataTransfer: DataTransfer | null): string | null {
	const data = dataTransfer?.getData('text/uri-list') || dataTransfer?.getData('text/plain') || '';
	const url = data
		.split('\n')
		.find((line) => line.trim().startsWith('http'))
		?.trim();
	return url || null;
}

export function extractShareTargetUrl(): string | null {
	if (globalThis.window === undefined) return null;
	const params = new URLSearchParams(window.location.search);
	const sharedUrl = params.get('shared_url');
	const sharedText = params.get('shared_text');

	if (sharedUrl || sharedText) {
		const clean = new URL(window.location.href);
		clean.searchParams.delete('shared_url');
		clean.searchParams.delete('shared_text');
		clean.searchParams.delete('shared_title');
		history.replaceState(null, '', clean.pathname);
	}

	return (
		sharedUrl?.trim() ||
		sharedText
			?.split(/\s+/)
			.find((t) => t.startsWith('http'))
			?.trim() ||
		null
	);
}

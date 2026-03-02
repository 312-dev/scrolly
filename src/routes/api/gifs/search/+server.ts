import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { withAuth, safeInt } from '$lib/server/api-utils';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

// Placeholder GIFs for dev mode when no GIPHY API key is configured
function generateDevGifs(count: number) {
	const colors = [
		'E74C3C',
		'3498DB',
		'2ECC71',
		'F39C12',
		'9B59B6',
		'1ABC9C',
		'E91E63',
		'00BCD4',
		'FF5722',
		'795548'
	];
	const widths = [200, 200, 200, 200, 200];
	const heights = [200, 150, 250, 180, 220];
	return Array.from({ length: count }, (_, i) => {
		const w = widths[i % widths.length];
		const h = heights[i % heights.length];
		const color = colors[i % colors.length];
		const url = `https://placehold.co/${w}x${h}/${color}/white?text=GIF+${i + 1}`;
		return {
			id: `dev-${i}`,
			title: `Dev GIF ${i + 1}`,
			url,
			stillUrl: url,
			shareUrl: url,
			width: w,
			height: h
		};
	});
}

export const GET: RequestHandler = withAuth(async ({ url }, _auth) => {
	const apiKey = env.GIPHY_API_KEY;
	if (!apiKey) {
		if (dev) return json({ gifs: generateDevGifs(20) });
		return json({ error: 'GIF search not configured' }, { status: 503 });
	}

	const q = url.searchParams.get('q')?.trim();
	const limit = safeInt(url.searchParams.get('limit'), 20, 30);
	const offset = safeInt(url.searchParams.get('offset'), 0);

	const endpoint = q
		? `${GIPHY_BASE}/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&rating=r`
		: `${GIPHY_BASE}/trending?api_key=${apiKey}&limit=${limit}&offset=${offset}&rating=r`;

	const res = await fetch(endpoint);
	if (!res.ok) return json({ error: 'GIF search failed' }, { status: 502 });

	const data = await res.json();

	const gifs = (data.data || []).map(
		(g: {
			id: string;
			title: string;
			images: {
				fixed_width: { url: string; webp: string; width: string; height: string };
				fixed_width_still: { url: string; width: string; height: string };
				downsized: { url: string; width: string; height: string };
			};
		}) => ({
			id: g.id,
			title: g.title,
			// Use WEBP for grid preview (smaller, faster than GIF)
			url: g.images.fixed_width.webp || g.images.fixed_width.url,
			stillUrl: g.images.fixed_width_still.url,
			// Larger rendition for sharing in comments
			shareUrl: g.images.downsized?.url || g.images.fixed_width.url,
			width: parseInt(g.images.fixed_width.width),
			height: parseInt(g.images.fixed_width.height)
		})
	);

	return json({ gifs });
});

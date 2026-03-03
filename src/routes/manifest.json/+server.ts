import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const manifest = {
		name: 'scrolly',
		short_name: 'scrolly',
		description: 'Private video sharing for your friend group',
		id: '/',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		orientation: 'portrait',
		lang: 'en',
		categories: ['social', 'entertainment'],
		background_color: '#000000',
		theme_color: '#000000',
		icons: [
			{
				src: '/icons/icon-192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'any'
			},
			{
				src: '/icons/icon-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'any'
			},
			{
				src: '/icons/icon-maskable-192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'maskable'
			},
			{
				src: '/icons/icon-maskable-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'maskable'
			},
			{
				src: '/icons/badge-72.png',
				sizes: '72x72',
				type: 'image/png',
				purpose: 'monochrome'
			}
		],
		share_target: {
			action: '/share',
			method: 'GET',
			enctype: 'application/x-www-form-urlencoded',
			params: {
				url: 'url',
				text: 'text',
				title: 'title'
			}
		}
	};

	return new Response(JSON.stringify(manifest, null, '\t'), {
		headers: {
			'Content-Type': 'application/manifest+json',
			'Cache-Control': 'private, no-cache',
			Vary: 'Cookie'
		}
	});
};

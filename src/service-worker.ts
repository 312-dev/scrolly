/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE_NAME = `scrolly-${version}`;
const OFFLINE_URL = '/offline';
const NOTIFICATION_CLICK_CACHE = 'notification-click';
const NOTIFICATION_CLICK_KEY = '/__notification_url';

// Assets to cache on install (app shell)
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then(async (cache) => {
			await cache.addAll(ASSETS);
			// Precache offline fallback page
			await cache.add(OFFLINE_URL);
		})
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

// Listen for skip-waiting message from client (safe update flow)
sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		sw.skipWaiting();
	}
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET requests
	if (event.request.method !== 'GET') return;

	// Skip API calls and video serving — always go to network
	if (url.pathname.startsWith('/api/')) return;

	// For app shell assets, serve from cache first
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
		return;
	}

	// For everything else, network first with cache fallback
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			})
			.catch(() =>
				caches.match(event.request).then((cached) => {
					if (cached) return cached;
					// For navigation requests, show offline page; for others return 503
					if (event.request.mode === 'navigate') {
						return caches
							.match(OFFLINE_URL)
							.then((offlinePage) => offlinePage || new Response('Offline', { status: 503 }));
					}
					return new Response('Offline', { status: 503 });
				})
			)
	);
});

sw.addEventListener('push', (event) => {
	if (!event.data) return;

	const data = event.data.json();
	const { title, body, icon, url, tag, image, badgeCount } = data;

	const notificationOptions: NotificationOptions & { image?: string } = {
		body: body || '',
		icon: icon || '/icons/icon-192.png',
		badge: '/icons/badge-72.png',
		tag: tag || undefined,
		data: { url: url || '/' }
	};
	if (image) notificationOptions.image = image;

	event.waitUntil(
		Promise.all([
			sw.registration.showNotification(title || 'scrolly', notificationOptions),
			// Set app badge with unwatched count from server payload
			typeof badgeCount === 'number'
				? (sw.navigator as unknown as { setAppBadge?: (n: number) => Promise<void> })
						.setAppBadge?.(badgeCount)
						?.catch?.(() => {})
				: (sw.navigator as unknown as { setAppBadge?: () => Promise<void> })
						.setAppBadge?.()
						?.catch?.(() => {})
		])
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = event.notification.data?.url || '/';
	console.log('[SW notificationclick] data:', JSON.stringify(event.notification.data));
	console.log('[SW notificationclick] url:', url);

	event.waitUntil(
		// Stash URL in Cache API so the client can pick it up on visibilitychange.
		// Covers frozen/backgrounded PWA clients where postMessage is silently lost.
		caches
			.open(NOTIFICATION_CLICK_CACHE)
			.then((cache) =>
				cache.put(NOTIFICATION_CLICK_KEY, new Response(JSON.stringify({ url, ts: Date.now() })))
			)
			.catch(() => {})
			.then(() =>
				Promise.all([
					// Refresh badge with actual unwatched count instead of blindly clearing
					fetch('/api/clips/unwatched-count')
						.then((res) => (res.ok ? res.json() : null))
						.then((data) => {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const nav = sw.navigator as any;
							if (data && data.count > 0) {
								nav.setAppBadge?.(data.count)?.catch?.(() => {});
							} else {
								nav.clearAppBadge?.()?.catch?.(() => {});
							}
						})
						.catch(() => {
							// Offline or fetch failed — clear badge as fallback
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(sw.navigator as any).clearAppBadge?.()?.catch?.(() => {});
						}),
					// Focus existing client and send a message to handle navigation
					// in-app (avoids full-page reload race conditions from client.navigate),
					// or open a new window with the deep-link URL as fallback.
					sw.clients
						.matchAll({ type: 'window', includeUncontrolled: true })
						.then(async (clients) => {
							console.log('[SW notificationclick] found', clients.length, 'client(s)');
							for (const client of clients) {
								if (client.url.includes(sw.location.origin) && 'focus' in client) {
									console.log('[SW notificationclick] focusing existing client:', client.url);
									const focused = await client.focus();
									console.log('[SW notificationclick] posting NOTIFICATION_CLICK message');
									focused.postMessage({ type: 'NOTIFICATION_CLICK', url });
									return;
								}
							}
							console.log('[SW notificationclick] no existing client, opening new window');
							return sw.clients.openWindow(url);
						})
				])
			)
	);
});

// Handle push subscription rotation (browser may change the subscription)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pushsubscriptionchange event type not in standard TS lib
sw.addEventListener('pushsubscriptionchange', ((event: any) => {
	event.waitUntil(
		(async () => {
			try {
				// Try oldSubscription first, then fall back to current subscription's key
				let applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
				if (!applicationServerKey) {
					const currentSub = await sw.registration.pushManager.getSubscription();
					applicationServerKey = currentSub?.options?.applicationServerKey;
				}
				if (!applicationServerKey) {
					console.error(
						'pushsubscriptionchange: no applicationServerKey available, cannot re-subscribe'
					);
					return;
				}
				const newSubscription = await sw.registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey
				});
				const subJson = newSubscription.toJSON();
				await fetch('/api/push/subscribe', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						endpoint: subJson.endpoint,
						keys: {
							p256dh: subJson.keys!.p256dh,
							auth: subJson.keys!.auth
						},
						oldEndpoint: event.oldSubscription?.endpoint
					})
				});
			} catch (err) {
				console.error('Failed to re-subscribe after pushsubscriptionchange:', err);
			}
		})()
	);
}) as EventListener);

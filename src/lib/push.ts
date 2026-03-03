function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; i++) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

export function isPushSupported(): boolean {
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
	const reg = await navigator.serviceWorker.ready;
	return reg.pushManager.getSubscription();
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return null;

	const reg = await navigator.serviceWorker.ready;
	const subscription = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer
	});

	const subJson = subscription.toJSON();
	const res = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			endpoint: subJson.endpoint,
			keys: {
				p256dh: subJson.keys!.p256dh,
				auth: subJson.keys!.auth
			}
		})
	});

	if (!res.ok) {
		console.error('Failed to save push subscription');
		return null;
	}

	return subscription;
}

/**
 * Close OS-level push notifications whose tag starts with the given prefix.
 * No-op if service worker or getNotifications() is unavailable.
 */
export async function clearPushNotifications(tagPrefix: string): Promise<void> {
	if (!('serviceWorker' in navigator)) return;
	try {
		const reg = await navigator.serviceWorker.ready;
		const notifications = await reg.getNotifications();
		for (const n of notifications) {
			if (n.tag?.startsWith(tagPrefix)) {
				n.close();
			}
		}
	} catch {
		// getNotifications() may not be available on all platforms
	}
}

export async function unsubscribeFromPush(): Promise<boolean> {
	const subscription = await getExistingSubscription();
	if (!subscription) return true;

	await fetch('/api/push/subscribe', {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ endpoint: subscription.endpoint })
	});

	return subscription.unsubscribe();
}

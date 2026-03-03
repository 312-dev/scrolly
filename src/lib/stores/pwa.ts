import { writable, derived } from 'svelte/store';

// --- Standalone mode detection ---

export const isStandalone = writable(false);

export function detectStandaloneMode(): boolean {
	if (typeof window === 'undefined') return false;
	// iOS Safari
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Safari non-standard property
	if ((navigator as any).standalone === true) return true;
	// Chrome / Edge / Firefox
	if (window.matchMedia('(display-mode: standalone)').matches) return true;
	return false;
}

// --- iOS Safari detection ---

export function detectIosSafari(): boolean {
	if (typeof window === 'undefined') return false;
	const ua = navigator.userAgent;
	// Must be iPhone/iPad/iPod — modern iPads report "Macintosh" in the UA
	const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
	const isIos = /iPhone|iPad|iPod/.test(ua) || isIpad;
	// Exclude Chrome, Firefox, and other in-app browsers on iOS
	const isSafari = !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
	return isIos && isSafari;
}

export const isIosSafari = writable(false);

// --- Install prompt ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BeforeInstallPromptEvent not in lib.dom.d.ts
let deferredPrompt: any = null;

export const canInstall = writable(false);

const IOS_DISMISS_KEY = 'scrolly_ios_install_dismissed';

function loadIosDismissed(): boolean {
	if (typeof window === 'undefined') return false;
	return localStorage.getItem(IOS_DISMISS_KEY) === '1';
}

export const installDismissed = writable(false);

/** Whether to show the install banner (can install + not dismissed + not already standalone) */
export const showInstallBanner = derived(
	[canInstall, installDismissed, isStandalone],
	([$canInstall, $installDismissed, $isStandalone]) =>
		$canInstall && !$installDismissed && !$isStandalone
);

/** Whether to show the iOS-specific install banner */
export const showIosInstallBanner = derived(
	[isIosSafari, installDismissed, isStandalone],
	([$isIosSafari, $installDismissed, $isStandalone]) =>
		$isIosSafari && !$installDismissed && !$isStandalone
);

export function initInstallPrompt(): void {
	// iOS Safari: check if previously dismissed
	const ios = detectIosSafari();
	isIosSafari.set(ios);
	if (ios && loadIosDismissed()) {
		installDismissed.set(true);
	}

	window.addEventListener('beforeinstallprompt', (e: Event) => {
		e.preventDefault();
		deferredPrompt = e;
		canInstall.set(true);
	});

	window.addEventListener('appinstalled', () => {
		canInstall.set(false);
		deferredPrompt = null;
		isStandalone.set(true);
	});
}

export async function triggerInstall(): Promise<boolean> {
	if (!deferredPrompt) return false;
	try {
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		return outcome === 'accepted';
	} finally {
		deferredPrompt = null;
		canInstall.set(false);
	}
}

export function dismissInstall(): void {
	installDismissed.set(true);
	// Persist dismissal for iOS (no beforeinstallprompt to re-trigger)
	if (typeof window !== 'undefined') {
		localStorage.setItem(IOS_DISMISS_KEY, '1');
	}
}

// --- Service worker update ---

export const swUpdateAvailable = writable(false);

let waitingWorker: ServiceWorker | null = null;

export function initSwUpdateListener(): void {
	if (!('serviceWorker' in navigator)) return;
	if (import.meta.env.DEV) return;

	navigator.serviceWorker.ready.then((registration) => {
		registration.addEventListener('updatefound', () => {
			const newWorker = registration.installing;
			if (!newWorker) return;

			newWorker.addEventListener('statechange', () => {
				if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
					// New SW installed but waiting — an update is available
					waitingWorker = newWorker;
					swUpdateAvailable.set(true);
				}
			});
		});
	});

	// Listen for the new SW taking over (after skipWaiting)
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		window.location.reload();
	});
}

export function applySwUpdate(): void {
	if (!waitingWorker) return;
	waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

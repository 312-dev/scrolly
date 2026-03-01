import { ACCENT_COLORS, type AccentColorKey } from '$lib/colors';
import { updateFavicon } from '$lib/iconSvg';

export type NotificationPrefs = {
	newAdds: boolean;
	reactions: boolean;
	comments: boolean;
	mentions: boolean;
	dailyReminder: boolean;
};

// --- Helpers ---

async function savePreference(data: Record<string, unknown>): Promise<void> {
	try {
		await fetch('/api/profile/preferences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
	} catch (err) {
		console.warn('failed to save preference', err);
	}
}

// --- Theme ---

export function applyTheme(value: 'system' | 'light' | 'dark'): void {
	if (value === 'system') {
		document.documentElement.removeAttribute('data-theme');
	} else {
		document.documentElement.dataset.theme = value;
	}
	document.cookie = `scrolly_theme=${value};path=/;max-age=31536000;SameSite=Lax`;
}

export async function saveThemePreference(value: 'system' | 'light' | 'dark'): Promise<void> {
	await savePreference({ themePreference: value });
}

// --- Username ---

export async function saveUsername(username: string): Promise<{ username: string } | null> {
	try {
		const res = await fetch('/api/profile/preferences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username })
		});
		if (res.ok) return res.json();
	} catch (err) {
		console.warn('failed to save username', err);
	}
	return null;
}

// --- Playback ---

export async function saveAutoScroll(value: boolean): Promise<void> {
	await savePreference({ autoScroll: value });
}

export async function saveMutedByDefault(value: boolean): Promise<void> {
	await savePreference({ mutedByDefault: value });
}

// --- Feed sort ---

export async function saveFeedSortOrder(value: 'oldest' | 'round-robin'): Promise<void> {
	await savePreference({ feedSortOrder: value });
}

// --- Accent color ---

export function applyAccentColor(key: AccentColorKey): void {
	const color = ACCENT_COLORS[key];
	document.documentElement.style.setProperty('--accent-primary', color.hex);
	document.documentElement.style.setProperty('--accent-primary-dark', color.dark);
	document.cookie = `scrolly_accent=${encodeURIComponent(JSON.stringify({ hex: color.hex, dark: color.dark }))};path=/;max-age=31536000;SameSite=Lax`;
	updateFavicon(color.hex);
}

export async function saveAccentColor(key: AccentColorKey): Promise<void> {
	try {
		await fetch('/api/group/accent', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ accentColor: key })
		});
	} catch (err) {
		console.warn('failed to save accent color', err);
	}
}

// --- Notification preferences ---

export async function fetchNotificationPrefs(): Promise<NotificationPrefs> {
	try {
		const res = await fetch('/api/notifications/preferences');
		if (res.ok) return res.json();
	} catch (err) {
		console.warn('failed to fetch notification prefs', err);
	}
	return { newAdds: true, reactions: true, comments: true, mentions: true, dailyReminder: false };
}

export async function updateNotificationPref(
	key: keyof NotificationPrefs,
	value: boolean
): Promise<void> {
	try {
		await fetch('/api/notifications/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ [key]: value })
		});
	} catch (err) {
		console.warn('failed to update notification pref', err);
	}
}

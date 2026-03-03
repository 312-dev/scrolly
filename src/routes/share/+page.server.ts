import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authenticateShortcutToken } from '$lib/server/shortcut-auth';
import { createSessionToken } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const COOKIE_NAME = 'scrolly_session';
const MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const shareUrl = url.searchParams.get('url') || url.searchParams.get('text');
	const fromShortcut = url.searchParams.get('error') === 'true';
	const token = url.searchParams.get('token');
	const phone = url.searchParams.get('phone');
	const source = url.searchParams.get('source');

	if (!shareUrl) {
		redirect(302, '/');
	}

	// Already authenticated via session cookie — proceed normally (Android + returning web view)
	if (locals.user) {
		if (!locals.user.username) {
			redirect(302, '/onboard');
		}
		return {
			shareUrl,
			fromShortcut,
			source,
			user: locals.user,
			group: locals.group
		};
	}

	// iOS Shortcut web view: authenticate via token + phone, set session cookie, redirect to clean URL
	if (token && phone) {
		const authResult = await authenticateShortcutToken(token, phone);

		if ('error' in authResult) {
			// Show error in the guided UI — can't redirect to /join from a Shortcut web view
			return {
				shareUrl,
				fromShortcut: false,
				source: 'shortcut',
				shortcutError: authResult.error,
				user: null,
				group: null
			};
		}

		// Set session cookie so subsequent API calls work
		const isSecure = url.protocol === 'https:';
		cookies.set(COOKIE_NAME, createSessionToken(authResult.user.id), {
			httpOnly: true,
			secure: isSecure,
			sameSite: 'lax',
			path: '/',
			maxAge: MAX_AGE
		});

		// Mark user as having used the new share flow (permanently suppresses upgrade banner)
		db.update(users).set({ usedNewShareFlow: true }).where(eq(users.id, authResult.user.id)).run();

		// Redirect to clean URL (removes token/phone from address bar, hooks.server.ts resolves session)
		const cleanUrl = `/share?url=${encodeURIComponent(shareUrl)}&source=shortcut`;
		redirect(302, cleanUrl);
	}

	// No session and no token — redirect to join flow (standard web flow)
	let returnTo = `/share?url=${encodeURIComponent(shareUrl)}`;
	if (fromShortcut) returnTo += '&error=true';
	redirect(302, `/join?returnTo=${encodeURIComponent(returnTo)}`);
};

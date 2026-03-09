import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { getUserIdFromCookies, getUserWithGroup } from '$lib/server/auth';

export const load: ServerLoad = async ({ request }) => {
	const userId = getUserIdFromCookies(request.headers.get('cookie'));

	if (!userId) {
		// No session — they haven't joined via invite code
		redirect(302, '/join');
	}

	const data = await getUserWithGroup(userId);

	if (!data || data.user.removedAt) {
		// Invalid or removed user
		redirect(302, '/join');
	}

	if (data.user.username) {
		// Already onboarded — send to feed
		redirect(302, '/');
	}
};

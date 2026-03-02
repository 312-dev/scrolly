import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const returnTo = url.search ? url.pathname + url.search : '';
	if (!locals.user) {
		redirect(302, returnTo ? `/join?returnTo=${encodeURIComponent(returnTo)}` : '/join');
	}
	if (!locals.user.username) {
		redirect(302, returnTo ? `/onboard?returnTo=${encodeURIComponent(returnTo)}` : '/onboard');
	}
	return {
		user: locals.user,
		group: locals.group,
		vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
		gifEnabled: !!env.GIPHY_API_KEY || dev
	};
};

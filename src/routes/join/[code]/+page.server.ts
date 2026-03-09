import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { validateInviteCode, createSessionToken } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users, notificationPreferences } from '$lib/server/db/schema';
import { v4 as uuid } from 'uuid';
import { checkRateLimit } from '$lib/server/rate-limit';

export const load: PageServerLoad = async ({ params }) => {
	const group = await validateInviteCode(params.code);
	if (!group) {
		redirect(302, '/join');
	}

	return {
		groupName: group.name,
		inviteCode: params.code
	};
};

export const actions: Actions = {
	default: async ({ params, cookies, getClientAddress }) => {
		const ip = getClientAddress();
		const result = checkRateLimit(`join:${ip}`, { windowMs: 15 * 60 * 1000, maxRequests: 5 });
		if (!result.allowed) {
			return fail(429, { error: 'Too many attempts. Please try again later.' });
		}

		const group = await validateInviteCode(params.code);
		if (!group) {
			redirect(302, '/join');
		}

		const userId = uuid();
		// Use a unique placeholder phone so the unique constraint isn't violated
		// by multiple pre-onboarding users. Onboarding replaces this with the real phone.
		const placeholderPhone = `pending:${userId}`;
		await db.insert(users).values({
			id: userId,
			username: '',
			phone: placeholderPhone,
			groupId: group.id,
			createdAt: new Date()
		});

		await db.insert(notificationPreferences).values({ userId });

		const token = createSessionToken(userId);
		cookies.set('scrolly_session', token, {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 365 * 10
		});

		redirect(302, '/onboard');
	}
};

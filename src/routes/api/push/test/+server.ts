import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { sendNotification } from '$lib/server/push';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = withAuth(async (_event, { user }) => {
	const subs = await db.query.pushSubscriptions.findMany({
		where: eq(pushSubscriptions.userId, user.id)
	});

	if (subs.length === 0) {
		return json({ error: 'No push subscriptions found' }, { status: 400 });
	}

	// Wait 10 seconds server-side so the notification arrives even if the user
	// locks their phone or navigates away
	await new Promise((resolve) => setTimeout(resolve, 10_000));

	await sendNotification(user.id, {
		title: 'Test notification',
		body: 'Push notifications are working!',
		tag: 'test-notification',
		url: '/settings'
	});

	return json({ sent: true, sentAt: Date.now() });
});

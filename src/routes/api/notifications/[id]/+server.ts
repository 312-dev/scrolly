import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-utils';

export const DELETE: RequestHandler = withAuth(async ({ params }, { user }) => {
	await db
		.delete(notifications)
		.where(and(eq(notifications.id, params.id), eq(notifications.userId, user.id)));

	return json({ ok: true });
});

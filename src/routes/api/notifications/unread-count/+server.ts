import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { eq, and, isNull, ne, sql } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-utils';

export const GET: RequestHandler = withAuth(async (_event, { user }) => {
	const result = await db
		.select({ count: sql<number>`count(*)` })
		.from(notifications)
		.where(
			and(
				eq(notifications.userId, user.id),
				ne(notifications.actorId, user.id),
				isNull(notifications.readAt)
			)
		);

	return json({ count: result[0]?.count ?? 0 });
});

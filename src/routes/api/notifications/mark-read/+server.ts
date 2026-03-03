import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { withAuth, parseBody, isResponse } from '$lib/server/api-utils';

export const POST: RequestHandler = withAuth(async ({ request }, { user }) => {
	const body = await parseBody<{ all?: boolean; clipId?: string; type?: string }>(request);
	if (isResponse(body)) return body;

	const now = new Date();

	if (body.all) {
		await db
			.update(notifications)
			.set({ readAt: now })
			.where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
	} else if (body.clipId && body.type) {
		await db
			.update(notifications)
			.set({ readAt: now })
			.where(
				and(
					eq(notifications.userId, user.id),
					eq(notifications.clipId, body.clipId),
					eq(notifications.type, body.type),
					isNull(notifications.readAt)
				)
			);
	} else {
		return json({ error: 'Provide either { all: true } or { clipId, type }' }, { status: 400 });
	}

	return json({ ok: true });
});

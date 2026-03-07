import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clips, watched, dismissedClips } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-utils';

export const GET: RequestHandler = withAuth(async (_event, { user }) => {
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(clips)
		.where(
			and(
				eq(clips.groupId, user.groupId),
				eq(clips.status, 'ready'),
				sql`${clips.id} NOT IN (SELECT ${watched.clipId} FROM ${watched} WHERE ${watched.userId} = ${user.id})`,
				sql`${clips.id} NOT IN (SELECT ${dismissedClips.clipId} FROM ${dismissedClips} WHERE ${dismissedClips.userId} = ${user.id})`
			)
		);

	return json({ count: result.count });
});

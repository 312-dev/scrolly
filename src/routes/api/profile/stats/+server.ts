import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clips, favorites, watched } from '$lib/server/db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { withAuth } from '$lib/server/api-utils';

export const GET: RequestHandler = withAuth(async (_event, { user, group }) => {
	const [uploadStats] = await db
		.select({ uploads: count() })
		.from(clips)
		.where(and(eq(clips.addedBy, user.id), eq(clips.groupId, group.id), eq(clips.status, 'ready')));

	const [saveStats] = await db
		.select({ saves: count() })
		.from(favorites)
		.where(eq(favorites.userId, user.id));

	const [watchStats] = await db
		.select({
			minutesWatched: sql<number>`coalesce(sum(${clips.durationSeconds} * coalesce(${watched.watchPercent}, 0) / 100.0), 0) / 60.0`
		})
		.from(watched)
		.innerJoin(clips, eq(clips.id, watched.clipId))
		.where(and(eq(watched.userId, user.id), eq(clips.groupId, group.id)));

	return json({
		uploads: uploadStats.uploads,
		saves: saveStats.saves,
		minutesWatched: Math.round(watchStats.minutesWatched)
	});
});

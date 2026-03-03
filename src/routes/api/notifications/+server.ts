import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { withAuth, safeInt, mapUsersByIds } from '$lib/server/api-utils';

export const GET: RequestHandler = withAuth(async ({ url }, { user }) => {
	const limit = safeInt(url.searchParams.get('limit'), 30, 50);
	const offset = safeInt(url.searchParams.get('offset'), 0);

	const rows = await db.query.notifications.findMany({
		where: eq(notifications.userId, user.id),
		orderBy: [desc(notifications.createdAt)],
		limit,
		offset
	});

	if (rows.length === 0) return json({ notifications: [] });

	// Build lookup maps for actors and clips
	const actorMap = await mapUsersByIds(rows.map((r) => r.actorId));

	const clipIds = [...new Set(rows.map((r) => r.clipId))];
	const clipRows = await db.query.clips.findMany({
		where: (c, { inArray }) => inArray(c.id, clipIds)
	});
	const clipMap = new Map(
		clipRows.map((c) => [
			c.id,
			{ thumbnailPath: c.thumbnailPath, title: c.title, contentType: c.contentType }
		])
	);

	const result = rows.map((n) => ({
		id: n.id,
		type: n.type,
		clipId: n.clipId,
		emoji: n.emoji,
		commentPreview: n.commentPreview,
		actorUsername: actorMap.get(n.actorId)?.username || 'Unknown',
		actorAvatar: actorMap.get(n.actorId)?.avatarPath || null,
		clipThumbnail: clipMap.get(n.clipId)?.thumbnailPath || null,
		clipTitle: clipMap.get(n.clipId)?.title || null,
		clipContentType: clipMap.get(n.clipId)?.contentType || 'video',
		read: !!n.readAt,
		createdAt: n.createdAt.toISOString()
	}));

	return json({ notifications: result });
});

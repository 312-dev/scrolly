import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clips, dismissedClips } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withAuth, mapUsersByIds } from '$lib/server/api-utils';

/** List dismissed clips for the current user. */
export const GET: RequestHandler = withAuth(async (_event, { user }) => {
	const dismissed = await db.query.dismissedClips.findMany({
		where: eq(dismissedClips.userId, user.id)
	});

	if (dismissed.length === 0) {
		return json({ clips: [], count: 0 });
	}

	const clipIds = dismissed.map((d) => d.clipId);
	const clipRows = await db.query.clips.findMany({
		where: and(inArray(clips.id, clipIds), eq(clips.status, 'ready'))
	});

	const usersMap = await mapUsersByIds(clipRows.map((c) => c.addedBy));

	const dismissedAtMap = new Map(dismissed.map((d) => [d.clipId, d.dismissedAt]));

	const result = clipRows.map((c) => ({
		id: c.id,
		title: c.title,
		thumbnailPath: c.thumbnailPath,
		platform: c.platform,
		contentType: c.contentType,
		addedByUsername: usersMap.get(c.addedBy)?.username || 'Unknown',
		addedByAvatar: usersMap.get(c.addedBy)?.avatarPath || null,
		createdAt: c.createdAt,
		dismissedAt: dismissedAtMap.get(c.id)
	}));

	return json({ clips: result, count: result.length });
});

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { getUserQueue, clearQueue } from '$lib/server/queue';
import { formatRelativeTime } from '$lib/server/share-limit';

export const GET: RequestHandler = withAuth(async (_event, { user }) => {
	const entries = getUserQueue(user.id, user.groupId);

	const now = Date.now();
	const queue = entries.map((e) => ({
		id: e.id,
		clipId: e.clipId,
		position: e.position,
		scheduledAt: e.scheduledAt.toISOString(),
		sharesIn: formatRelativeTime(Math.max(0, e.scheduledAt.getTime() - now)),
		createdAt: e.createdAt.toISOString(),
		title: e.title,
		originalUrl: e.originalUrl,
		platform: e.platform,
		contentType: e.contentType,
		status: e.status,
		thumbnailPath: e.thumbnailPath
	}));

	return json({ queue });
});

export const DELETE: RequestHandler = withAuth(async (_event, { user }) => {
	const cleared = clearQueue(user.id, user.groupId);
	return json({ cleared });
});

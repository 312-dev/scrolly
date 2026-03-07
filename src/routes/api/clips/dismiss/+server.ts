import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clips, watched, dismissedClips } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withAuth, parseBody, isResponse } from '$lib/server/api-utils';

/** Dismiss unwatched clips except the given keepIds. */
export const POST: RequestHandler = withAuth(async ({ request }, { user }) => {
	const body = await parseBody<{ keepIds?: string[] }>(request);
	if (isResponse(body)) return body;

	const keepIds = Array.isArray(body.keepIds) ? body.keepIds : [];

	// Get all ready clips for the group
	const allClips = await db.query.clips.findMany({
		where: and(eq(clips.groupId, user.groupId), eq(clips.status, 'ready'))
	});
	const allClipIds = allClips.map((c) => c.id);

	// Get already-watched and already-dismissed clip IDs
	const watchedRows = await db.query.watched.findMany({
		where: eq(watched.userId, user.id)
	});
	const watchedIds = new Set(watchedRows.map((w) => w.clipId));

	const existingDismissed = await db.query.dismissedClips.findMany({
		where: eq(dismissedClips.userId, user.id)
	});
	const dismissedIds = new Set(existingDismissed.map((d) => d.clipId));

	const keepSet = new Set(keepIds);
	const now = new Date();

	// Clips to dismiss: ready, not watched, not already dismissed, not in keepIds
	const toDismiss = allClipIds.filter(
		(id) => !watchedIds.has(id) && !dismissedIds.has(id) && !keepSet.has(id)
	);

	if (toDismiss.length > 0) {
		db.transaction((tx) => {
			for (const clipId of toDismiss) {
				tx.insert(dismissedClips).values({ clipId, userId: user.id, dismissedAt: now }).run();
			}
		});
	}

	return json({ dismissed: toDismiss.length });
});

/** Restore dismissed clips. */
export const DELETE: RequestHandler = withAuth(async ({ request }, { user }) => {
	const body = await parseBody<{ clipIds?: string[]; all?: boolean }>(request);
	if (isResponse(body)) return body;

	let restored = 0;

	if (body.all) {
		const result = db.delete(dismissedClips).where(eq(dismissedClips.userId, user.id)).run();
		restored = result.changes;
	} else if (Array.isArray(body.clipIds) && body.clipIds.length > 0) {
		const result = db
			.delete(dismissedClips)
			.where(and(eq(dismissedClips.userId, user.id), inArray(dismissedClips.clipId, body.clipIds)))
			.run();
		restored = result.changes;
	}

	return json({ restored });
});

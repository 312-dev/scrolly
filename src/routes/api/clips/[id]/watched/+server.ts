import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { watched } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { withClipAuth } from '$lib/server/api-utils';

export const POST: RequestHandler = withClipAuth(async ({ params, request }, { user }) => {
	// Parse optional watchPercent from body
	let watchPercent: number | null = null;
	try {
		const body = await request.json();
		if (typeof body.watchPercent === 'number') {
			watchPercent = Math.max(0, Math.min(100, Math.round(body.watchPercent)));
		}
	} catch {
		// No body or invalid JSON — backward compatible with no-body calls
	}

	await db
		.insert(watched)
		.values({
			clipId: params.id,
			userId: user.id,
			watchPercent,
			watchedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [watched.clipId, watched.userId],
			set: {
				watchPercent:
					watchPercent === null
						? watched.watchPercent
						: sql`MAX(COALESCE(${watched.watchPercent}, 0), ${watchPercent})`
				// watchedAt intentionally not updated — keep the first-watched timestamp for stable sort order
			}
		});

	return json({ watched: true });
});

// PATCH: update watchPercent only — creates the row if needed but does NOT count as "watched"
// Used for periodic progress tracking while user is still viewing
export const PATCH: RequestHandler = withClipAuth(async ({ params, request }, { user }) => {
	let watchPercent: number | null = null;
	try {
		const body = await request.json();
		if (typeof body.watchPercent === 'number') {
			watchPercent = Math.max(0, Math.min(100, Math.round(body.watchPercent)));
		}
	} catch {
		// No body or invalid JSON
	}

	if (watchPercent === null) {
		return json({ updated: false });
	}

	// Only update if the row already exists — don't create a watched record
	await db
		.update(watched)
		.set({
			watchPercent: sql`MAX(COALESCE(${watched.watchPercent}, 0), ${watchPercent})`
		})
		.where(and(eq(watched.clipId, params.id), eq(watched.userId, user.id)));

	return json({ updated: true });
});

export const DELETE: RequestHandler = withClipAuth(async ({ params }, { user }) => {
	await db.delete(watched).where(and(eq(watched.clipId, params.id), eq(watched.userId, user.id)));

	return json({ watched: false });
});

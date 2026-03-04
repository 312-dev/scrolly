import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withClipAuth, badRequest, forbidden } from '$lib/server/api-utils';
import { db } from '$lib/server/db';
import { clips } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

const HEARTBEAT_EXTENSION_SECONDS = 30;

export const POST: RequestHandler = withClipAuth(async ({ params }, { user, clip }) => {
	if (clip.addedBy !== user.id) {
		return forbidden('Only the uploader can ping');
	}

	if (clip.status !== 'pending_trim') {
		return badRequest('Clip is not awaiting trim');
	}

	const newDeadline = new Date(Date.now() + HEARTBEAT_EXTENSION_SECONDS * 1000);

	db.update(clips)
		.set({ trimDeadline: newDeadline })
		.where(and(eq(clips.id, params.id), eq(clips.status, 'pending_trim')))
		.run();

	return json({ ok: true });
});

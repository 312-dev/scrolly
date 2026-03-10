import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth, notFound } from '$lib/server/api-utils';
import { cancelQueuedClip } from '$lib/server/queue';

export const DELETE: RequestHandler = withAuth(async ({ params }, { user }) => {
	const success = cancelQueuedClip(params.id, user.id);
	if (!success) return notFound('Queue entry not found');
	return json({ ok: true });
});

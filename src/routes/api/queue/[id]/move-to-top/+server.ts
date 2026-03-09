import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth, notFound } from '$lib/server/api-utils';
import { moveToTop } from '$lib/server/queue';

export const POST: RequestHandler = withAuth(async ({ params }, { user }) => {
	const success = moveToTop(params.id, user.id, user.groupId);
	if (!success) return notFound('Queue entry not found');
	return json({ ok: true });
});

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { getQueueCount } from '$lib/server/queue';

export const GET: RequestHandler = withAuth(async (_event, { user }) => {
	const count = getQueueCount(user.id, user.groupId);
	return json({ count });
});

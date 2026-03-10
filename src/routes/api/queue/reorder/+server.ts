import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth, parseBody, isResponse, badRequest } from '$lib/server/api-utils';
import { reorderQueue } from '$lib/server/queue';

export const PATCH: RequestHandler = withAuth(async ({ request }, { user }) => {
	const body = await parseBody<{ orderedIds?: string[] }>(request);
	if (isResponse(body)) return body;

	const { orderedIds } = body;
	if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
		return badRequest('orderedIds must be a non-empty array of queue entry IDs.');
	}

	const success = reorderQueue(user.id, user.groupId, orderedIds);
	if (!success) return badRequest('Invalid queue entry IDs or count mismatch.');

	return json({ ok: true });
});

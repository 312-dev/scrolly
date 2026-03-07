import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groups } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withHost, parseBody, isResponse, badRequest } from '$lib/server/api-utils';

export const PATCH: RequestHandler = withHost(async ({ request }, { group }) => {
	const body = await parseBody<{ dailyShareLimit?: number | null }>(request);
	if (isResponse(body)) return body;

	const { dailyShareLimit } = body;

	if (dailyShareLimit !== null && dailyShareLimit !== undefined) {
		if (!Number.isInteger(dailyShareLimit) || dailyShareLimit < 1) {
			return badRequest('Daily share limit must be a positive integer or null');
		}
	}

	await db
		.update(groups)
		.set({ dailyShareLimit: dailyShareLimit ?? null })
		.where(eq(groups.id, group.id));

	return json({ dailyShareLimit });
});

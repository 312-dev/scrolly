import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groups } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withHost, parseBody, isResponse, badRequest } from '$lib/server/api-utils';
import { VALID_DAILY_SHARE_LIMITS } from '$lib/server/constants';

export const PATCH: RequestHandler = withHost(async ({ request }, { group }) => {
	const body = await parseBody<{ dailyShareLimit?: number | null }>(request);
	if (isResponse(body)) return body;

	const { dailyShareLimit } = body;

	if (!(VALID_DAILY_SHARE_LIMITS as readonly (number | null)[]).includes(dailyShareLimit ?? null)) {
		return badRequest('Invalid daily share limit value');
	}

	await db
		.update(groups)
		.set({ dailyShareLimit: dailyShareLimit ?? null })
		.where(eq(groups.id, group.id));

	return json({ dailyShareLimit });
});

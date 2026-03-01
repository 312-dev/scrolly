import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth, parseBody, isResponse } from '$lib/server/api-utils';

function validateUsername(body: Record<string, unknown>): { value: string } | { error: string } {
	const username = typeof body.username === 'string' ? body.username.trim() : '';
	if (!username || username.length > 30) return { error: 'Username must be 1–30 characters' };
	return { value: username };
}

const VALID_THEMES = ['system', 'light', 'dark'];
const VALID_SORT_ORDERS = ['oldest', 'round-robin'];

export const POST: RequestHandler = withAuth(async ({ request }, { user }) => {
	const body = await parseBody<Record<string, unknown>>(request);
	if (isResponse(body)) return body;

	const updates: Record<string, unknown> = {};

	if ('username' in body) {
		const result = validateUsername(body);
		if ('error' in result) return json({ error: result.error }, { status: 400 });
		updates.username = result.value;
	}

	if ('themePreference' in body) {
		if (!VALID_THEMES.includes(body.themePreference as string)) {
			return json({ error: 'Invalid theme preference' }, { status: 400 });
		}
		updates.themePreference = body.themePreference;
	}

	if ('autoScroll' in body && typeof body.autoScroll === 'boolean') {
		updates.autoScroll = body.autoScroll;
	}

	if ('mutedByDefault' in body && typeof body.mutedByDefault === 'boolean') {
		updates.mutedByDefault = body.mutedByDefault;
	}

	if ('feedSortOrder' in body) {
		if (!VALID_SORT_ORDERS.includes(body.feedSortOrder as string)) {
			return json({ error: 'Invalid feed sort order' }, { status: 400 });
		}
		updates.feedSortOrder = body.feedSortOrder;
	}

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No valid preferences provided' }, { status: 400 });
	}

	await db.update(users).set(updates).where(eq(users.id, user.id));

	return json(updates);
});

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groups } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withHost, parseBody, isResponse } from '$lib/server/api-utils';

const ICLOUD_SHORTCUT_RE = /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}\/?$/;

export const PATCH: RequestHandler = withHost(async ({ request }, { group }) => {
	const body = await parseBody<{ shortcutUrl?: string | null }>(request);
	if (isResponse(body)) return body;

	if (!('shortcutUrl' in body)) {
		return json({ error: 'shortcutUrl field is required' }, { status: 400 });
	}

	const { shortcutUrl } = body;

	if (shortcutUrl !== null && typeof shortcutUrl !== 'string') {
		return json({ error: 'Shortcut URL must be a string' }, { status: 400 });
	}

	const trimmed = typeof shortcutUrl === 'string' ? shortcutUrl.trim() : '';

	if (trimmed && !ICLOUD_SHORTCUT_RE.test(trimmed)) {
		return json(
			{ error: 'Must be a valid iCloud shortcut link (https://www.icloud.com/shortcuts/...)' },
			{ status: 400 }
		);
	}

	await db
		.update(groups)
		.set({ shortcutUrl: trimmed || null })
		.where(eq(groups.id, group.id));

	return json({ shortcutUrl: trimmed || null });
});

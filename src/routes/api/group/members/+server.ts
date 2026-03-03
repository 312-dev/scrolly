import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, notificationPreferences } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { normalizePhone } from '$lib/server/phone';
import { withAuth, withHost, parseBody, isResponse } from '$lib/server/api-utils';

export const GET: RequestHandler = withAuth(async (_event, { group }) => {
	const members = await db.query.users.findMany({
		where: and(eq(users.groupId, group.id), isNull(users.removedAt))
	});

	return json(
		members.map((m) => ({
			id: m.id,
			username: m.username,
			avatarPath: m.avatarPath,
			createdAt: m.createdAt,
			isHost: m.id === group.createdBy
		}))
	);
});

export const POST: RequestHandler = withHost(async ({ request }, { group }) => {
	const body = await parseBody<{ username?: string; phone?: string }>(request);
	if (isResponse(body)) return body;

	const username = typeof body.username === 'string' ? body.username.trim() : '';
	const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';

	if (!username) {
		return json({ error: 'Username is required' }, { status: 400 });
	}
	if (username.length > 50) {
		return json({ error: 'Username must be 50 characters or less' }, { status: 400 });
	}

	const phone = normalizePhone(rawPhone);
	if (!phone) {
		return json({ error: 'Invalid phone number format' }, { status: 400 });
	}

	// Check phone uniqueness (across all groups)
	const existingByPhone = await db.query.users.findFirst({
		where: eq(users.phone, phone)
	});
	if (existingByPhone) {
		return json({ error: 'This phone number is already in use' }, { status: 409 });
	}

	// Check username uniqueness within this group
	const existingByUsername = await db.query.users.findFirst({
		where: and(eq(users.groupId, group.id), eq(users.username, username), isNull(users.removedAt))
	});
	if (existingByUsername) {
		return json({ error: 'Username already taken in this group' }, { status: 409 });
	}

	const userId = uuid();
	const now = new Date();

	// Create user + notification preferences atomically
	try {
		db.transaction((tx) => {
			tx.insert(users)
				.values({
					id: userId,
					username,
					phone,
					groupId: group.id,
					createdAt: now
				})
				.run();

			tx.insert(notificationPreferences).values({ userId }).run();
		});
	} catch {
		return json({ error: 'Failed to create member' }, { status: 500 });
	}

	return json(
		{
			member: {
				id: userId,
				username,
				avatarPath: null,
				createdAt: now.toISOString(),
				isHost: false
			}
		},
		{ status: 201 }
	);
});

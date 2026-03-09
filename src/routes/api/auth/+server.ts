import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	validateInviteCode,
	createSessionCookie,
	getUserIdFromCookies,
	getUserWithGroup
} from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users, groups, notificationPreferences, verificationCodes } from '$lib/server/db/schema';
import { v4 as uuid } from 'uuid';
import { eq, and, desc, ne, isNull } from 'drizzle-orm';
import { sendVerification, checkVerification } from '$lib/server/sms/verify';
import { dev } from '$app/environment';
import { createLogger } from '$lib/server/logger';
import { checkRateLimit, rateLimitResponse } from '$lib/server/rate-limit';

const log = createLogger('auth');

async function handleJoin(body: Record<string, string>) {
	const { inviteCode } = body;
	if (!inviteCode) return json({ error: 'Invite code required' }, { status: 400 });

	const group = await validateInviteCode(inviteCode);
	if (!group) return json({ error: 'Invalid invite code' }, { status: 404 });

	const userId = uuid();
	// Use a unique placeholder phone so the unique constraint isn't violated
	// by multiple pre-onboarding users. Onboarding replaces this with the real phone.
	const placeholderPhone = `pending:${userId}`;
	await db.insert(users).values({
		id: userId,
		username: '',
		phone: placeholderPhone,
		groupId: group.id,
		createdAt: new Date()
	});

	await db.insert(notificationPreferences).values({ userId });

	const cookie = createSessionCookie(userId);
	return json({ userId, group, needsOnboarding: true }, { headers: { 'Set-Cookie': cookie } });
}

async function handleSendCode(userId: string, body: Record<string, string>) {
	const { phone } = body;
	if (!phone) return json({ error: 'Phone number required' }, { status: 400 });

	if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
		return json({ error: 'Phone must be in E.164 format (e.g., +1234567890)' }, { status: 400 });
	}

	// Check if this phone is already claimed by another user
	const existingUser = await db.query.users.findFirst({
		where: eq(users.phone, phone)
	});
	if (existingUser && existingUser.id !== userId) {
		return json({ error: 'This phone number is already in use' }, { status: 409 });
	}

	const result = await sendVerification(phone);
	if (result.status === 'error') {
		const statusCode = result.error?.includes('Too many') ? 429 : 500;
		return json({ error: result.error }, { status: statusCode });
	}

	return json({ sent: true });
}

async function handleVerifyCode(userId: string, body: Record<string, string>) {
	const { phone, code } = body;
	if (!phone || !code) {
		return json({ error: 'Phone and code are required' }, { status: 400 });
	}

	const result = await checkVerification(phone, code);
	if (!result.valid) {
		const statusCode = result.status === 'max_attempts_reached' ? 429 : 400;
		return json({ error: result.error || 'Incorrect code.' }, { status: statusCode });
	}

	// Insert a verification record so handleOnboard can confirm freshness
	const now = new Date();
	await db.insert(verificationCodes).values({
		id: uuid(),
		phone,
		code: '000000',
		userId,
		attempts: 0,
		expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
		verifiedAt: now,
		createdAt: now
	});

	return json({ verified: true });
}

async function handleOnboard(userId: string, body: Record<string, string>) {
	const { phone } = body;
	const username = typeof body.username === 'string' ? body.username.trim() : '';
	if (!username || !phone) {
		return json({ error: 'Username and phone number required' }, { status: 400 });
	}

	// Validate username length (1-30 characters)
	if (username.length < 1 || username.length > 30) {
		return json({ error: 'Username must be 1–30 characters' }, { status: 400 });
	}

	// Validate username format (alphanumeric, underscores, hyphens, periods)
	if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
		return json(
			{ error: 'Username can only contain letters, numbers, underscores, hyphens, and periods' },
			{ status: 400 }
		);
	}

	// Get current user to find their group
	const currentUser = await db.query.users.findFirst({
		where: eq(users.id, userId)
	});
	if (!currentUser) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	// Check username uniqueness within the group (excluding current user, excluding removed members)
	const existingUser = await db.query.users.findFirst({
		where: and(
			eq(users.groupId, currentUser.groupId),
			eq(users.username, username),
			ne(users.id, userId),
			isNull(users.removedAt)
		)
	});
	if (existingUser) {
		return json({ error: 'Username is already taken in this group' }, { status: 409 });
	}

	if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
		return json({ error: 'Phone must be in E.164 format (e.g., +1234567890)' }, { status: 400 });
	}

	// Confirm this phone was verified by this user
	const verified = await db
		.select()
		.from(verificationCodes)
		.where(and(eq(verificationCodes.phone, phone), eq(verificationCodes.userId, userId)))
		.orderBy(desc(verificationCodes.createdAt))
		.limit(1)
		.then((rows) => rows[0] ?? null);

	if (!verified || !verified.verifiedAt) {
		return json({ error: 'Phone number not verified' }, { status: 403 });
	}

	// Verification must be recent (within 30 minutes)
	const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
	if (verified.verifiedAt < thirtyMinutesAgo) {
		return json({ error: 'Verification expired. Please verify again.' }, { status: 403 });
	}

	await db.update(users).set({ username, phone }).where(eq(users.id, userId));

	const data = await getUserWithGroup(userId);

	// First user to complete onboarding becomes the host
	if (data?.group && !data.group.createdBy) {
		await db.update(groups).set({ createdBy: userId }).where(eq(groups.id, data.group.id));
		data.group = { ...data.group, createdBy: userId };
		log.info({ userId, username, groupId: data.group.id }, 'first user set as host');
	}

	return json({ user: data?.user, group: data?.group });
}

/** In dev mode, ensure a group + user exist for the given phone number. */
async function ensureDevUser(phone: string, existingUser: typeof users.$inferSelect | undefined) {
	let group = await db.query.groups.findFirst({
		where: eq(groups.inviteCode, 'dev')
	});
	const isNewGroup = !group;
	if (!group) {
		const groupId = uuid();
		await db.insert(groups).values({
			id: groupId,
			name: 'Dev Group',
			inviteCode: 'dev',
			shortcutToken: uuid(),
			createdAt: new Date()
		});
		group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
	}
	if (existingUser && !existingUser.username) {
		await db.update(users).set({ username: 'dev', phone }).where(eq(users.id, existingUser.id));
		if (!group!.createdBy) {
			await db.update(groups).set({ createdBy: existingUser.id }).where(eq(groups.id, group!.id));
		}
	} else {
		const userId = uuid();
		await db.insert(users).values({
			id: userId,
			username: 'dev',
			phone,
			groupId: group!.id,
			createdAt: new Date()
		});
		await db.insert(notificationPreferences).values({ userId });
		if (isNewGroup || !group!.createdBy) {
			await db.update(groups).set({ createdBy: userId }).where(eq(groups.id, group!.id));
		}
	}
	log.debug({ phone }, 'dev mode: auto-created user');
}

async function handleLoginSendCode(body: Record<string, string>) {
	const { phone } = body;
	if (!phone) return json({ error: 'Phone number required' }, { status: 400 });

	if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
		return json({ error: 'Phone must be in E.164 format (e.g., +1234567890)' }, { status: 400 });
	}

	const user = await db.query.users.findFirst({
		where: eq(users.phone, phone)
	});
	if ((!user || !user.username) && dev) {
		await ensureDevUser(phone, user);
	} else if (!user || !user.username) {
		return json({ error: 'No account found with this phone number' }, { status: 404 });
	}

	const result = await sendVerification(phone);
	if (result.status === 'error') {
		const statusCode = result.error?.includes('Too many') ? 429 : 500;
		return json({ error: result.error }, { status: statusCode });
	}

	return json({ sent: true });
}

async function handleLoginVerifyCode(body: Record<string, string>) {
	const { phone, code } = body;
	if (!phone || !code) {
		return json({ error: 'Phone and code are required' }, { status: 400 });
	}

	const user = await db.query.users.findFirst({
		where: eq(users.phone, phone)
	});
	if (!user) {
		return json({ error: 'No account found with this phone number' }, { status: 404 });
	}

	const result = await checkVerification(phone, code);
	if (!result.valid) {
		const statusCode = result.status === 'max_attempts_reached' ? 429 : 400;
		return json({ error: result.error || 'Incorrect code.' }, { status: statusCode });
	}

	const cookie = createSessionCookie(user.id);
	const data = await getUserWithGroup(user.id);
	return json({ user: data?.user, group: data?.group }, { headers: { 'Set-Cookie': cookie } });
}

// POST /api/auth - Login, join, send/verify phone code, or onboard
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json();
	const { action } = body;

	// Unauthenticated actions
	if (action === 'join') {
		const ip = getClientAddress();
		const result = checkRateLimit(`join:${ip}`, { windowMs: 15 * 60 * 1000, maxRequests: 5 });
		if (!result.allowed) {
			log.warn({ ip }, 'join rate limit exceeded');
			return rateLimitResponse(result.resetAt);
		}
		return handleJoin(body);
	}
	if (action === 'login-send-code') return handleLoginSendCode(body);
	if (action === 'login-verify-code') return handleLoginVerifyCode(body);

	// Authenticated actions
	if (action === 'send-code' || action === 'verify-code' || action === 'onboard') {
		const userId = getUserIdFromCookies(request.headers.get('cookie'));
		if (!userId) return json({ error: 'Not authenticated' }, { status: 401 });

		if (action === 'send-code') return handleSendCode(userId, body);
		if (action === 'verify-code') return handleVerifyCode(userId, body);
		return handleOnboard(userId, body);
	}

	return json({ error: 'Invalid action' }, { status: 400 });
};

// GET /api/auth - Get current user
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Not authenticated' }, { status: 401 });
	return json({ user: locals.user, group: locals.group });
};

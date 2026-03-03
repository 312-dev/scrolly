import { db } from './db';
import { users, groups } from './db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'scrolly_session';
const MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

function getSecret(): string {
	const secret = env.SESSION_SECRET;
	if (!secret) throw new Error('SESSION_SECRET environment variable is required');
	return secret;
}

function sign(payload: string): string {
	const hmac = crypto.createHmac('sha256', getSecret());
	hmac.update(payload);
	return payload + '.' + hmac.digest('base64url');
}

function verify(token: string): string | null {
	const lastDot = token.lastIndexOf('.');
	if (lastDot === -1) return null;
	const payload = token.substring(0, lastDot);
	const expected = sign(payload);
	const tokenBuf = Buffer.from(token);
	const expectedBuf = Buffer.from(expected);
	if (tokenBuf.length !== expectedBuf.length) return null;
	if (!crypto.timingSafeEqual(tokenBuf, expectedBuf)) return null;
	return payload;
}

export function createSessionCookie(userId: string): string {
	const token = sign(userId);
	return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function getUserIdFromCookies(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	if (!env.SESSION_SECRET) return null;
	const cookies = Object.fromEntries(
		cookieHeader.split(';').map((c) => {
			const [key, ...rest] = c.trim().split('=');
			return [key, rest.join('=')];
		})
	);
	const token = cookies[COOKIE_NAME];
	if (!token) return null;
	return verify(token);
}

export async function getUserWithGroup(userId: string) {
	const row = db
		.select({ user: users, group: groups })
		.from(users)
		.innerJoin(groups, eq(users.groupId, groups.id))
		.where(eq(users.id, userId))
		.get();
	if (!row) return null;
	return { user: row.user, group: row.group };
}

export async function validateInviteCode(code: string) {
	const group = await db.query.groups.findFirst({
		where: eq(groups.inviteCode, code)
	});
	return group ?? null;
}

export async function getDefaultGroup() {
	const group = await db.query.groups.findFirst();
	return group ?? null;
}

import { describe, it, expect, vi } from 'vitest';
import { seed } from '../../../../tests/helpers/seed';

// Mock DB with in-memory SQLite
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../../../../tests/helpers/db');
	return createTestDb();
});

const { db } = await import('$lib/server/db');
const data = await seed(db as any);

// Import after mocks
const { createSessionCookie, getUserIdFromCookies, getUserWithGroup, validateInviteCode } =
	await import('../auth');

describe('createSessionCookie', () => {
	it('produces a cookie with scrolly_session name', () => {
		const cookie = createSessionCookie('test-user-id');
		expect(cookie).toContain('scrolly_session=');
	});

	it('includes HttpOnly flag', () => {
		const cookie = createSessionCookie('test-user-id');
		expect(cookie).toContain('HttpOnly');
	});

	it('includes SameSite=Lax', () => {
		const cookie = createSessionCookie('test-user-id');
		expect(cookie).toContain('SameSite=Lax');
	});

	it('includes Path=/', () => {
		const cookie = createSessionCookie('test-user-id');
		expect(cookie).toContain('Path=/');
	});

	it('includes Max-Age for 1 year', () => {
		const cookie = createSessionCookie('test-user-id');
		expect(cookie).toContain('Max-Age=31536000');
	});
});

describe('getUserIdFromCookies', () => {
	it('roundtrips: createSessionCookie -> getUserIdFromCookies', () => {
		const userId = 'roundtrip-test-id';
		const cookie = createSessionCookie(userId);
		const extracted = getUserIdFromCookies(cookie);
		expect(extracted).toBe(userId);
	});

	it('returns null for null header', () => {
		expect(getUserIdFromCookies(null)).toBeNull();
	});

	it('returns null for missing scrolly_session cookie', () => {
		expect(getUserIdFromCookies('other_cookie=value')).toBeNull();
	});

	it('returns null for tampered cookie value', () => {
		const cookie = createSessionCookie('user-id');
		const tampered = cookie.replace('scrolly_session=', 'scrolly_session=tampered.');
		expect(getUserIdFromCookies(tampered)).toBeNull();
	});

	it('parses correctly when multiple cookies present', () => {
		const userId = 'multi-cookie-test';
		const cookie = createSessionCookie(userId);
		const token = cookie.split('=')[1].split(';')[0];
		const multiCookie = `theme=dark; scrolly_session=${token}; other=value`;
		expect(getUserIdFromCookies(multiCookie)).toBe(userId);
	});
});

describe('getUserWithGroup', () => {
	it('returns user and group when both exist', async () => {
		const result = await getUserWithGroup(data.host.id);
		expect(result).not.toBeNull();
		expect(result!.user.id).toBe(data.host.id);
		expect(result!.group!.id).toBe(data.group.id);
	});

	it('returns null when user not found', async () => {
		const result = await getUserWithGroup('nonexistent-id');
		expect(result).toBeNull();
	});
});

describe('validateInviteCode', () => {
	it('returns group for valid code', async () => {
		const group = await validateInviteCode('test-invite-123');
		expect(group).not.toBeNull();
		expect(group!.name).toBe('Test Group');
	});

	it('returns null for invalid code', async () => {
		const group = await validateInviteCode('invalid-code');
		expect(group).toBeNull();
	});
});

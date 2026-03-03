import { db } from './db';
import { groups, users } from './db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { normalizePhone } from './phone';

type AuthUser = { id: string; groupId: string | null; phone: string };
type ShortcutAuthSuccess = { user: AuthUser; group: typeof groups.$inferSelect };
type ShortcutAuthError = { error: string };
export type ShortcutAuthResult = ShortcutAuthSuccess | ShortcutAuthError;

/**
 * Authenticate a request using a shortcut token + phone number.
 * Returns the matched user and group, or a human-readable error string.
 * Used by both the POST /api/clips/share endpoint and the /share page load.
 */
export async function authenticateShortcutToken(
	token: string | null,
	phone: string | undefined
): Promise<ShortcutAuthResult> {
	// Missing or invalid token = host misconfiguration
	if (!token) {
		return {
			error: "This shortcut isn't set up correctly. Ask your group host to re-share it."
		};
	}

	const group = await db.query.groups.findFirst({
		where: eq(groups.shortcutToken, token)
	});
	if (!group) {
		return {
			error: "This shortcut isn't set up correctly. Ask your group host to re-share it."
		};
	}

	// Missing phone = user misconfiguration (Import Question not set)
	if (!phone || typeof phone !== 'string' || !phone.trim()) {
		return {
			error:
				'This shortcut is missing your phone number. Delete it and install it again from your group.'
		};
	}

	// Phone can't be normalized = user entered something unrecognizable
	const normalized = normalizePhone(phone);
	if (!normalized) {
		return {
			error:
				"Your phone number couldn't be recognized. Delete the shortcut and install it again — enter your number with area code."
		};
	}

	const groupMembers = await db.query.users.findMany({
		where: and(eq(users.groupId, group.id), isNull(users.removedAt))
	});

	const matchedUser = groupMembers.find((u) => u.phone === normalized);
	if (!matchedUser) {
		return {
			error:
				'No account matches this phone number. Delete the shortcut and install it again with the phone number you signed up with.'
		};
	}

	return { user: matchedUser, group };
}

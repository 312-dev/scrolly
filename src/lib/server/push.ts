import { basename } from 'node:path';
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import {
	clips,
	pushSubscriptions,
	notificationPreferences,
	users,
	watched
} from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('push');

type NotificationPayload = {
	title: string;
	body: string;
	icon?: string;
	url?: string;
	tag?: string;
	image?: string;
};

/** Get the number of unwatched ready clips for a user in their group. */
async function getUnwatchedCount(userId: string, groupId: string): Promise<number> {
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(clips)
		.where(
			and(
				eq(clips.groupId, groupId),
				eq(clips.status, 'ready'),
				sql`${clips.id} NOT IN (SELECT ${watched.clipId} FROM ${watched} WHERE ${watched.userId} = ${userId})`
			)
		);
	return result.count;
}

/** Build a full avatar URL for push notification icon, with initials fallback. */
function avatarIconUrl(
	avatarPath: string | null | undefined,
	username: string
): string | undefined {
	if (!env.ORIGIN) return undefined;
	if (avatarPath) return `${env.ORIGIN}/api/profile/avatar/${avatarPath}`;
	return `${env.ORIGIN}/api/profile/avatar/initials/${encodeURIComponent(username)}`;
}

let initialized = false;

function ensureInitialized() {
	if (initialized) return;
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
		throw new Error('VAPID environment variables are required');
	}
	webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
	initialized = true;
}

export async function sendNotification(
	userId: string,
	payload: NotificationPayload & { badgeCount?: number }
): Promise<void> {
	ensureInitialized();

	const subs = await db.query.pushSubscriptions.findMany({
		where: eq(pushSubscriptions.userId, userId)
	});

	if (subs.length === 0) return;

	// Auto-compute badge count if not provided by caller
	let finalPayload = payload;
	if (payload.badgeCount === undefined) {
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { groupId: true }
		});
		if (user) {
			const badgeCount = await getUnwatchedCount(userId, user.groupId);
			finalPayload = { ...payload, badgeCount };
		}
	}

	const payloadStr = JSON.stringify(finalPayload);
	log.info(
		{ userId, url: finalPayload.url, tag: finalPayload.tag, title: finalPayload.title },
		'sending push notification'
	);

	await Promise.allSettled(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{
						endpoint: sub.endpoint,
						keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth }
					},
					payloadStr
				);
			} catch (err: unknown) {
				const statusCode =
					typeof err === 'object' && err !== null && 'statusCode' in err
						? (err as { statusCode: number }).statusCode
						: undefined;
				if (statusCode === 410 || statusCode === 404) {
					await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
				} else {
					log.error({ err, subscriptionId: sub.id }, 'push failed for subscription');
				}
			}
		})
	);
}

/**
 * Send push notification to the group after a clip is published (ready or failed).
 * Called from the download pipeline — NOT from the API endpoint.
 * Push-only — no in-app notification record (new clips show via the unwatched count badge).
 */
export async function notifyNewClip(clipId: string): Promise<void> {
	const clip = await db.query.clips.findFirst({
		where: eq(clips.id, clipId)
	});
	if (!clip) return;

	const uploader = await db.query.users.findFirst({
		where: eq(users.id, clip.addedBy)
	});
	if (!uploader) return;

	const label = clip.contentType === 'music' ? 'song' : 'video';
	const image =
		clip.thumbnailPath && env.ORIGIN
			? `${env.ORIGIN}/api/thumbnails/${basename(clip.thumbnailPath)}`
			: undefined;
	const icon = avatarIconUrl(uploader.avatarPath, uploader.username);

	// Fallback body when no title: use platform name (e.g. "New TikTok")
	const platformLabels: Record<string, string> = {
		tiktok: 'TikTok',
		instagram: 'Instagram',
		youtube: 'YouTube',
		facebook: 'Facebook',
		twitter: 'Twitter',
		reddit: 'Reddit',
		snapchat: 'Snapchat',
		vimeo: 'Vimeo',
		twitch: 'Twitch',
		soundcloud: 'SoundCloud',
		spotify: 'Spotify'
	};
	const fallbackBody = clip.platform
		? `New ${platformLabels[clip.platform] ?? clip.platform} ${label}`
		: `New ${label}`;

	const payload: NotificationPayload = {
		title: `${uploader.username} added a ${label}`,
		body: clip.title || fallbackBody,
		url: `/?clip=${clipId}`,
		tag: `new-clip-${clipId}`,
		...(icon ? { icon } : {}),
		...(image ? { image } : {})
	};

	// Fetch group members, exclude uploader and removed users
	const groupUsers = await db.query.users.findMany({
		where: eq(users.groupId, clip.groupId),
		columns: { id: true, removedAt: true }
	});
	const targets = groupUsers.filter((u) => u.id !== uploader.id && !u.removedAt);
	if (targets.length === 0) return;

	const targetIds = targets.map((u) => u.id);

	// Batch-fetch notification preferences
	const allPrefs = await db.query.notificationPreferences.findMany({
		where: inArray(notificationPreferences.userId, targetIds)
	});
	const prefsMap = new Map(allPrefs.map((p) => [p.userId, p]));

	await Promise.allSettled(
		targets.map(async (user) => {
			const prefs = prefsMap.get(user.id);
			if (prefs && !prefs.newAdds) return;

			// Push notification only (no in-app record — new clips surface via unwatched count)
			const badgeCount = await getUnwatchedCount(user.id, clip.groupId);
			await sendNotification(user.id, { ...payload, badgeCount });
		})
	);
}

export async function sendGroupNotification(
	groupId: string,
	payload: NotificationPayload,
	preferenceKey: 'newAdds' | 'reactions' | 'comments' | 'mentions' | 'dailyReminder',
	excludeUserId?: string
): Promise<void> {
	const groupUsers = await db.query.users.findMany({
		where: eq(users.groupId, groupId),
		columns: { id: true, removedAt: true }
	});

	const targets = groupUsers.filter((u) => u.id !== excludeUserId && !u.removedAt);
	if (targets.length === 0) return;

	const targetIds = targets.map((u) => u.id);

	// Batch-fetch all notification preferences for target users in one query
	const allPrefs = await db.query.notificationPreferences.findMany({
		where: inArray(notificationPreferences.userId, targetIds)
	});
	const prefsMap = new Map(allPrefs.map((p) => [p.userId, p]));

	await Promise.allSettled(
		targets.map(async (user) => {
			const prefs = prefsMap.get(user.id);
			if (prefs && !prefs[preferenceKey]) return;
			const badgeCount = await getUnwatchedCount(user.id, groupId);
			await sendNotification(user.id, { ...payload, badgeCount });
		})
	);
}

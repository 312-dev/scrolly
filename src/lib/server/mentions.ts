import { basename } from 'node:path';
import { db } from '$lib/server/db';
import { clips, users, notificationPreferences, notifications } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { sendNotification } from '$lib/server/push';
import { env } from '$env/dynamic/private';
import { v4 as uuid } from 'uuid';
import { createLogger } from '$lib/server/logger';

const log = createLogger('mentions');

/**
 * Extract @username mentions from text.
 * Returns an array of unique lowercase usernames.
 */
export function extractMentions(text: string): string[] {
	const regex = /@(\w+)/g;
	const mentions = new Set<string>();
	let match;
	while ((match = regex.exec(text)) !== null) {
		mentions.add(match[1].toLowerCase());
	}
	return [...mentions];
}

/** Build clip context string for push notification body. */
async function buildClipContext(
	clip: { title: string | null; addedBy: string; contentType: string } | undefined
): Promise<string> {
	if (!clip) return 'on a clip';
	if (clip.title) {
		const icon = clip.contentType === 'music' ? '🎵' : '🎬';
		return `${icon} ${clip.title}`;
	}
	const uploader = await db.query.users.findFirst({
		where: eq(users.id, clip.addedBy),
		columns: { username: true }
	});
	return `on a clip by ${uploader?.username ?? 'someone'}`;
}

/**
 * Send mention notifications to all mentioned users.
 * Checks preferences, skips self-mentions and excluded users, sends push + in-app.
 */
export async function notifyMentions(opts: {
	mentionedUsernames: string[];
	actorId: string;
	actorUsername: string;
	actorAvatarPath?: string | null;
	clipId: string;
	groupId: string;
	commentPreview: string;
	excludeUserIds?: string[];
}): Promise<void> {
	if (opts.mentionedUsernames.length === 0) return;

	const excludeSet = new Set(opts.excludeUserIds ?? []);
	excludeSet.add(opts.actorId); // never notify self

	const clip = await db.query.clips.findFirst({
		where: eq(clips.id, opts.clipId),
		columns: { title: true, addedBy: true, thumbnailPath: true, contentType: true }
	});

	const clipContext = await buildClipContext(clip ?? undefined);
	const pushBody = `@ "${opts.commentPreview}" · ${clipContext}`;

	const image =
		clip?.thumbnailPath && env.ORIGIN
			? `${env.ORIGIN}/api/thumbnails/${basename(clip.thumbnailPath)}`
			: undefined;
	const icon =
		opts.actorAvatarPath && env.ORIGIN
			? `${env.ORIGIN}/api/profile/avatar/${opts.actorAvatarPath}`
			: undefined;

	// Look up all active members in the group
	const groupMembers = await db.query.users.findMany({
		where: and(eq(users.groupId, opts.groupId), isNull(users.removedAt))
	});

	// Match mentioned usernames to actual users (case-insensitive)
	const mentionedSet = new Set(opts.mentionedUsernames);
	const matchedUsers = groupMembers.filter(
		(m) => mentionedSet.has(m.username.toLowerCase()) && !excludeSet.has(m.id)
	);

	for (const recipient of matchedUsers) {
		// Check notification preferences
		const prefs = await db.query.notificationPreferences.findFirst({
			where: eq(notificationPreferences.userId, recipient.id)
		});

		// Send push if preference allows (default true if no prefs row)
		if (!prefs || prefs.mentions) {
			sendNotification(recipient.id, {
				title: `${opts.actorUsername} mentioned you`,
				body: pushBody,
				url: `/?clip=${opts.clipId}&comments=true`,
				tag: `mention-${opts.clipId}-${opts.actorId}`,
				...(icon ? { icon } : {}),
				...(image ? { image } : {})
			}).catch((err) => log.error({ err }, 'mention push notification failed'));
		}

		// Insert in-app notification
		await db.insert(notifications).values({
			id: uuid(),
			userId: recipient.id,
			type: 'mention',
			clipId: opts.clipId,
			actorId: opts.actorId,
			commentPreview: opts.commentPreview,
			createdAt: new Date()
		});
	}
}

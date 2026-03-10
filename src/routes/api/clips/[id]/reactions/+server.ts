import { basename } from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	clips,
	reactions,
	notifications,
	users,
	notificationPreferences
} from '$lib/server/db/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
	withClipAuth,
	groupReactions,
	parseBody,
	isResponse,
	badRequest
} from '$lib/server/api-utils';
import { sendNotification } from '$lib/server/push';
import { env } from '$env/dynamic/private';
import { ALLOWED_EMOJIS } from '$lib/server/constants';

export const GET: RequestHandler = withClipAuth(async ({ params }, { user }) => {
	const clipId = params.id;
	const userId = user.id;

	const allReactions = await db.query.reactions.findMany({
		where: eq(reactions.clipId, clipId)
	});

	return json({ reactions: groupReactions(allReactions, userId) });
});

/** Build per-recipient push body text for a reaction notification. */
async function buildReactionPushBody(
	clip: { title: string | null; addedBy: string; contentType: string | null } | undefined
): Promise<{ forOwner: string; forOthers: string }> {
	if (clip?.title) {
		const icon = clip.contentType === 'music' ? '🎵' : '🎬';
		const body = `${icon} ${clip.title}`;
		return { forOwner: body, forOthers: body };
	}
	if (clip) {
		const uploader = await db.query.users.findFirst({
			where: eq(users.id, clip.addedBy),
			columns: { username: true }
		});
		return {
			forOwner: 'on your clip',
			forOthers: `on a clip by ${uploader?.username ?? 'someone'}`
		};
	}
	return { forOwner: 'on a clip', forOthers: 'on a clip' };
}

async function dispatchReactionNotification(
	clipId: string,
	emoji: string,
	actor: { id: string; username: string; avatarPath: string | null; groupId: string }
): Promise<void> {
	const groupMembers = await db.query.users.findMany({
		where: and(eq(users.groupId, actor.groupId), isNull(users.removedAt))
	});
	const targets = groupMembers.filter((m) => m.id !== actor.id);
	if (targets.length === 0) return;

	const clip = await db.query.clips.findFirst({
		where: eq(clips.id, clipId),
		columns: { title: true, addedBy: true, thumbnailPath: true, contentType: true }
	});

	const { forOwner, forOthers } = await buildReactionPushBody(clip);
	const image =
		clip?.thumbnailPath && env.ORIGIN
			? `${env.ORIGIN}/api/thumbnails/${basename(clip.thumbnailPath)}`
			: undefined;

	const targetIds = targets.map((u) => u.id);
	const allPrefs = await db.query.notificationPreferences.findMany({
		where: inArray(notificationPreferences.userId, targetIds)
	});
	const prefsMap = new Map(allPrefs.map((p) => [p.userId, p]));

	const pushTitle = `${actor.username} reacted ${emoji}`;
	const pushTag = `reaction-${clipId}-${actor.id}`;
	const icon =
		actor.avatarPath && env.ORIGIN
			? `${env.ORIGIN}/api/profile/avatar/${actor.avatarPath}`
			: undefined;

	for (const recipient of targets) {
		const prefs = prefsMap.get(recipient.id);
		if (prefs && !prefs.reactions) {
			await db.insert(notifications).values({
				id: uuid(),
				userId: recipient.id,
				type: 'reaction',
				clipId,
				actorId: actor.id,
				emoji,
				createdAt: new Date()
			});
			continue;
		}

		const pushBody = recipient.id === clip?.addedBy ? forOwner : forOthers;
		sendNotification(recipient.id, {
			title: pushTitle,
			body: pushBody,
			url: `/?clip=${clipId}`,
			tag: pushTag,
			...(icon ? { icon } : {}),
			...(image ? { image } : {})
		}).catch(() => {});

		await db.insert(notifications).values({
			id: uuid(),
			userId: recipient.id,
			type: 'reaction',
			clipId,
			actorId: actor.id,
			emoji,
			createdAt: new Date()
		});
	}
}

export const POST: RequestHandler = withClipAuth(async ({ params, request }, { user }) => {
	const body = await parseBody<{ emoji?: string }>(request);
	if (isResponse(body)) return body;

	const { emoji } = body;
	const clipId = params.id;
	const userId = user.id;

	if (!emoji || !(ALLOWED_EMOJIS as readonly string[]).includes(emoji)) {
		return badRequest('Invalid emoji');
	}

	// Find any existing reaction by this user on this clip (one reaction per user per clip)
	const existing = await db.query.reactions.findFirst({
		where: and(eq(reactions.clipId, clipId), eq(reactions.userId, userId))
	});

	const sameEmoji = existing?.emoji === emoji;

	if (existing) {
		// Remove the old reaction
		await db.delete(reactions).where(eq(reactions.id, existing.id));

		// Remove the old notification entry for this reaction
		await db
			.delete(notifications)
			.where(
				and(
					eq(notifications.clipId, clipId),
					eq(notifications.actorId, userId),
					eq(notifications.type, 'reaction'),
					eq(notifications.emoji, existing.emoji)
				)
			);
	}

	if (!sameEmoji) {
		// Add the new reaction (either fresh or replacing a different emoji)
		const reactionId = uuid();
		await db.insert(reactions).values({
			id: reactionId,
			clipId,
			userId,
			emoji,
			createdAt: new Date()
		});
		await dispatchReactionNotification(clipId, emoji, user);
	}

	// Return updated reactions for this clip
	const allReactions = await db.query.reactions.findMany({
		where: eq(reactions.clipId, clipId)
	});

	return json({
		reactions: groupReactions(allReactions, userId),
		toggled: !sameEmoji || !existing
	});
});

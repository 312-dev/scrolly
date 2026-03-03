import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { favorites, reactions, notifications } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { withClipAuth, notifyClipOwner } from '$lib/server/api-utils';

export const POST: RequestHandler = withClipAuth(async ({ params }, { user, clip }) => {
	const clipId = params.id;
	const userId = user.id;

	// Toggle — check if already favorited
	const existing = await db.query.favorites.findFirst({
		where: and(eq(favorites.clipId, clipId), eq(favorites.userId, userId))
	});

	if (existing) {
		await db
			.delete(favorites)
			.where(and(eq(favorites.clipId, clipId), eq(favorites.userId, userId)));

		// Also remove ❤️ reaction when un-favoriting
		const heartReaction = await db.query.reactions.findFirst({
			where: and(
				eq(reactions.clipId, clipId),
				eq(reactions.userId, userId),
				eq(reactions.emoji, '❤️')
			)
		});
		if (heartReaction) {
			await db.delete(reactions).where(eq(reactions.id, heartReaction.id));
			await db
				.delete(notifications)
				.where(
					and(
						eq(notifications.clipId, clipId),
						eq(notifications.actorId, userId),
						eq(notifications.type, 'reaction'),
						eq(notifications.emoji, '❤️')
					)
				);
		}

		return json({ favorited: false });
	}

	await db.insert(favorites).values({
		clipId,
		userId,
		createdAt: new Date()
	});

	// Also create ❤️ reaction if one doesn't already exist
	const existingReaction = await db.query.reactions.findFirst({
		where: and(
			eq(reactions.clipId, clipId),
			eq(reactions.userId, userId),
			eq(reactions.emoji, '❤️')
		)
	});
	if (!existingReaction) {
		await db.insert(reactions).values({
			id: uuid(),
			clipId,
			userId,
			emoji: '❤️',
			createdAt: new Date()
		});

		// Notify clip owner (skips self-notification automatically)
		await notifyClipOwner({
			recipientId: clip.addedBy,
			actorId: userId,
			actorUsername: user.username,
			actorAvatarPath: user.avatarPath,
			clipId,
			type: 'reaction',
			preferenceKey: 'reactions',
			pushTitle: `${user.username} reacted ❤️`,
			pushBody: 'on your clip',
			pushTag: `reaction-${clipId}`,
			emoji: '❤️'
		});
	}

	return json({ favorited: true });
});

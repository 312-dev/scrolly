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

	// Wrap toggle in a transaction to prevent race conditions (e.g. double-tap)
	let result: { favorited: boolean; createdReaction: boolean };
	try {
		result = db.transaction((tx) => {
			const existing = tx
				.select()
				.from(favorites)
				.where(and(eq(favorites.clipId, clipId), eq(favorites.userId, userId)))
				.get();

			if (existing) {
				tx.delete(favorites)
					.where(and(eq(favorites.clipId, clipId), eq(favorites.userId, userId)))
					.run();

				// Also remove ❤️ reaction when un-favoriting
				const heartReaction = tx
					.select()
					.from(reactions)
					.where(
						and(
							eq(reactions.clipId, clipId),
							eq(reactions.userId, userId),
							eq(reactions.emoji, '❤️')
						)
					)
					.get();
				if (heartReaction) {
					tx.delete(reactions).where(eq(reactions.id, heartReaction.id)).run();
					tx.delete(notifications)
						.where(
							and(
								eq(notifications.clipId, clipId),
								eq(notifications.actorId, userId),
								eq(notifications.type, 'reaction'),
								eq(notifications.emoji, '❤️')
							)
						)
						.run();
				}

				return { favorited: false, createdReaction: false };
			}

			tx.insert(favorites)
				.values({
					clipId,
					userId,
					createdAt: new Date()
				})
				.run();

			// Also create ❤️ reaction if one doesn't already exist
			const existingReaction = tx
				.select()
				.from(reactions)
				.where(
					and(eq(reactions.clipId, clipId), eq(reactions.userId, userId), eq(reactions.emoji, '❤️'))
				)
				.get();
			if (!existingReaction) {
				tx.insert(reactions)
					.values({
						id: uuid(),
						clipId,
						userId,
						emoji: '❤️',
						createdAt: new Date()
					})
					.run();
				return { favorited: true, createdReaction: true };
			}

			return { favorited: true, createdReaction: false };
		});
	} catch {
		return json({ error: 'Failed to toggle favorite' }, { status: 500 });
	}

	// Send push notification outside the transaction (async, network I/O)
	if (result.createdReaction) {
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
			pushTag: `reaction-${clipId}-${user.id}`,
			emoji: '❤️'
		});
	}

	return json({ favorited: result.favorited });
});

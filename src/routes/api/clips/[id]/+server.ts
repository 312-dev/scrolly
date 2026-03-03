import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	clips,
	watched,
	favorites,
	reactions,
	comments,
	commentHearts,
	commentViews,
	notifications
} from '$lib/server/db/schema';
import { eq, and, ne, count, inArray } from 'drizzle-orm';
import {
	withClipAuth,
	mapUsersByIds,
	groupReactions,
	parseBody,
	isResponse
} from '$lib/server/api-utils';
import { cleanupClipFiles } from '$lib/server/download-utils';

export const GET: RequestHandler = withClipAuth(async ({ params }, { user, clip }) => {
	const clipId = params.id;
	const userId = user.id;

	// Fetch all related data in parallel
	const [
		watchedRows,
		favRow,
		allFavRows,
		clipReactions,
		clipComments,
		userCommentView,
		uploaderInfo
	] = await Promise.all([
		db.query.watched.findMany({ where: eq(watched.clipId, clipId) }),
		db.query.favorites.findFirst({
			where: and(eq(favorites.clipId, clipId), eq(favorites.userId, userId))
		}),
		db.query.favorites.findMany({ where: eq(favorites.clipId, clipId) }),
		db.query.reactions.findMany({ where: eq(reactions.clipId, clipId) }),
		db.query.comments.findMany({ where: eq(comments.clipId, clipId) }),
		db.query.commentViews.findFirst({
			where: and(eq(commentViews.clipId, clipId), eq(commentViews.userId, userId))
		}),
		mapUsersByIds([clip.addedBy])
	]);

	const isWatched = watchedRows.some((w) => w.userId === userId);
	const isFavorited = !!favRow;
	const favoriteCount = allFavRows.length;
	const viewCount = watchedRows.length;
	const seenByOthers = watchedRows.some((w) => w.userId !== clip.addedBy);

	const reactionData = groupReactions(clipReactions, userId);

	const commentCount = clipComments.length;
	const unreadCommentCount = userCommentView
		? clipComments.filter((c) => c.userId !== userId && c.createdAt > userCommentView.viewedAt)
				.length
		: clipComments.filter((c) => c.userId !== userId).length;

	const uploaderUser = uploaderInfo.get(clip.addedBy);

	return json({
		id: clip.id,
		originalUrl: clip.originalUrl,
		videoPath: clip.videoPath,
		audioPath: clip.audioPath,
		thumbnailPath: clip.thumbnailPath,
		title: clip.title,
		artist: clip.artist,
		albumArt: clip.albumArt,
		spotifyUrl: clip.spotifyUrl,
		appleMusicUrl: clip.appleMusicUrl,
		youtubeMusicUrl: clip.youtubeMusicUrl,
		addedBy: clip.addedBy,
		addedByUsername: uploaderUser?.username || 'Unknown',
		addedByAvatar: uploaderUser?.avatarPath || null,
		platform: clip.platform,
		creatorName: clip.creatorName,
		creatorUrl: clip.creatorUrl,
		status: clip.status,
		contentType: clip.contentType,
		durationSeconds: clip.durationSeconds,
		watched: isWatched,
		favorited: isFavorited,
		favoriteCount,
		reactions: reactionData,
		commentCount,
		unreadCommentCount,
		viewCount,
		seenByOthers,
		createdAt: clip.createdAt
	});
});

export const PATCH: RequestHandler = withClipAuth(async ({ params, request }, { user, group }) => {
	// Only the host can edit captions
	if (group.createdBy !== user.id) {
		return json({ error: 'Only the host can edit captions' }, { status: 403 });
	}

	const body = await parseBody<{ title?: string }>(request);
	if (isResponse(body)) return body;

	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 500) || null : null;

	await db.update(clips).set({ title }).where(eq(clips.id, params.id));

	return json({ title });
});

export const DELETE: RequestHandler = withClipAuth(async ({ params }, { user, group, clip }) => {
	const isHost = group.createdBy === user.id;

	if (!isHost && clip.addedBy !== user.id) {
		return json({ error: 'Only the uploader or host can delete' }, { status: 403 });
	}

	// Non-host uploaders can only delete if no one else has watched
	if (!isHost) {
		const [watchResult] = await db
			.select({ count: count() })
			.from(watched)
			.where(and(eq(watched.clipId, params.id), ne(watched.userId, clip.addedBy)));

		if (watchResult.count > 0) {
			return json({ error: 'Clip can no longer be deleted' }, { status: 403 });
		}
	}

	// Fetch comment IDs before the transaction so we can cascade to comment_hearts
	const clipComments = await db.query.comments.findMany({
		where: eq(comments.clipId, params.id)
	});

	try {
		db.transaction((tx) => {
			tx.delete(notifications).where(eq(notifications.clipId, params.id)).run();
			tx.delete(watched).where(eq(watched.clipId, params.id)).run();
			tx.delete(favorites).where(eq(favorites.clipId, params.id)).run();
			tx.delete(reactions).where(eq(reactions.clipId, params.id)).run();
			tx.delete(commentViews).where(eq(commentViews.clipId, params.id)).run();

			// Delete comment hearts before comments (FK constraint)
			const commentIds = clipComments.map((c) => c.id);
			if (commentIds.length > 0) {
				tx.delete(commentHearts).where(inArray(commentHearts.commentId, commentIds)).run();
			}
			tx.delete(comments).where(eq(comments.clipId, params.id)).run();
			tx.delete(clips).where(eq(clips.id, params.id)).run();
		});
	} catch {
		return json({ error: 'Failed to delete clip' }, { status: 500 });
	}

	// Clean up video/thumbnail/audio files from disk (best-effort, after DB transaction)
	await cleanupClipFiles(params.id);

	return json({ success: true });
});

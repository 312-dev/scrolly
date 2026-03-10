import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	clips,
	watched,
	favorites,
	commentViews,
	reactions,
	comments,
	dismissedClips,
	clipQueue
} from '$lib/server/db/schema';
import { eq, asc, and, inArray, sql } from 'drizzle-orm';
import {
	isSupportedUrl,
	detectPlatform,
	getContentType,
	isPlatformAllowed,
	platformLabel
} from '$lib/url-validation';
import { normalizeUrl } from '$lib/server/download-lock';
import { startDownload } from '$lib/server/clip-download';
import { getActiveProvider } from '$lib/server/providers/registry';
import { v4 as uuid } from 'uuid';
import {
	withAuth,
	groupReactionsByClip,
	parseBody,
	isResponse,
	badRequest,
	mapUsersByIds,
	safeInt
} from '$lib/server/api-utils';
import { extractMentions, notifyMentions } from '$lib/server/mentions';
import { checkSharePacing, formatRelativeTime } from '$lib/server/share-limit';
import { enqueueClip } from '$lib/server/queue';
import { createLogger } from '$lib/server/logger';

const log = createLogger('clips');

/** Validate a clip URL and return an error response, or null if valid. */
function validateClipUrl(
	videoUrl: string | undefined,
	group: { platformFilterMode: string | null; platformFilterList: string | null }
): Response | null {
	if (!videoUrl) return json({ error: 'URL required' }, { status: 400 });

	if (!isSupportedUrl(videoUrl)) {
		return json(
			{
				error:
					'Unsupported URL. Try a link from TikTok, YouTube, Instagram, X, Reddit, Spotify, or other supported platforms.'
			},
			{ status: 400 }
		);
	}

	const platform = detectPlatform(videoUrl)!;
	const filterList = group.platformFilterList ? JSON.parse(group.platformFilterList) : null;
	if (!isPlatformAllowed(platform, group.platformFilterMode ?? 'all', filterList)) {
		return json(
			{ error: `${platformLabel(videoUrl) || platform} links are not allowed in this group` },
			{ status: 400 }
		);
	}

	return null;
}

const VALID_FILTERS = ['unwatched', 'watched', 'favorites', 'uploads'] as const;
const VALID_SORTS = ['oldest', 'round-robin', 'best'] as const;

function applyFilter(
	allClips: (typeof clips.$inferSelect)[],
	filter: string | null,
	watchedIds: Set<string>,
	favIds: Set<string>,
	userId: string,
	dismissedIds?: Set<string>
): (typeof clips.$inferSelect)[] {
	switch (filter) {
		case 'unwatched':
			return allClips.filter((c) => !watchedIds.has(c.id) && !dismissedIds?.has(c.id));
		case 'watched':
			return allClips.filter((c) => watchedIds.has(c.id));
		case 'favorites':
			return allClips.filter((c) => favIds.has(c.id));
		case 'uploads':
			return allClips.filter((c) => c.addedBy === userId);
		default:
			return allClips;
	}
}

function countByClipId(items: { clipId: string }[], clipIds: Set<string>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) {
		if (clipIds.has(item.clipId)) {
			counts.set(item.clipId, (counts.get(item.clipId) || 0) + 1);
		}
	}
	return counts;
}

function countUnreadComments(
	allComments: { clipId: string; userId: string; createdAt: Date }[],
	clipIds: Set<string>,
	viewedAtMap: Map<string, Date>,
	currentUserId: string
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const c of allComments) {
		if (!clipIds.has(c.clipId)) continue;
		if (c.userId === currentUserId) continue;
		const viewedAt = viewedAtMap.get(c.clipId);
		if (!viewedAt || c.createdAt > viewedAt) {
			counts.set(c.clipId, (counts.get(c.clipId) || 0) + 1);
		}
	}
	return counts;
}

type ClipRow = Awaited<ReturnType<typeof db.query.clips.findMany>>[number];

/** Round-robin interleave clips grouped by contributor. */
function interleaveByMember(clipList: ClipRow[]): ClipRow[] {
	const byMember = new Map<string, ClipRow[]>();
	for (const clip of clipList) {
		const list = byMember.get(clip.addedBy) || [];
		list.push(clip);
		byMember.set(clip.addedBy, list);
	}
	const queues = [...byMember.values()].map((list) => ({ items: list, idx: 0 }));
	const interleaved: ClipRow[] = [];
	let remaining = clipList.length;
	while (remaining > 0) {
		for (const q of queues) {
			if (q.idx < q.items.length) {
				interleaved.push(q.items[q.idx++]);
				remaining--;
			}
		}
	}
	return interleaved;
}

function applySortOrder(
	clipList: ClipRow[],
	sort: string,
	filter: string | null,
	watchedRows: { clipId: string; watchedAt: Date }[],
	favRows: { clipId: string; createdAt: Date }[],
	engagementScores?: Map<string, number>
): ClipRow[] {
	if (filter === 'uploads') {
		// Uploads tab: newest first
		return [...clipList].reverse();
	}
	if (filter === 'favorites') {
		// Favorites tab: sort by most recently favorited
		const favAtMap = new Map(favRows.map((f) => [f.clipId, f.createdAt.getTime()]));
		return [...clipList].sort((a, b) => (favAtMap.get(b.id) ?? 0) - (favAtMap.get(a.id) ?? 0));
	}
	if (filter === 'watched') {
		// Watched tab: sort by first-watched (watchedAt is never updated after initial watch)
		const watchedAtMap = new Map(watchedRows.map((w) => [w.clipId, w.watchedAt.getTime()]));
		return [...clipList].sort(
			(a, b) => (watchedAtMap.get(b.id) ?? 0) - (watchedAtMap.get(a.id) ?? 0)
		);
	}
	if (sort === 'best' && engagementScores) {
		// Sort by: 1) internal engagement desc, 2) source view count desc, 3) recency desc
		const scored = [...clipList].sort((a, b) => {
			const scoreA = engagementScores.get(a.id) || 0;
			const scoreB = engagementScores.get(b.id) || 0;
			if (scoreB !== scoreA) return scoreB - scoreA;
			const viewsA = a.sourceViewCount ?? 0;
			const viewsB = b.sourceViewCount ?? 0;
			if (viewsB !== viewsA) return viewsB - viewsA;
			return b.createdAt.getTime() - a.createdAt.getTime();
		});
		// Round-robin interleave across contributors (each contributor's clips in score order)
		return interleaveByMember(scored);
	}
	if (sort === 'round-robin') {
		// Group clips by member, each group already in createdAt asc order
		return interleaveByMember(clipList);
	}
	// 'oldest': already sorted by createdAt asc from the DB query
	return clipList;
}

/** Compute engagement scores (views + reactions + comments) for a set of clip IDs. */
async function computeEngagementScores(clipIds: string[]): Promise<Map<string, number>> {
	const [reactionCounts, commentCounts, viewCounts] = await Promise.all([
		db
			.select({ clipId: reactions.clipId, count: sql<number>`count(*)` })
			.from(reactions)
			.where(inArray(reactions.clipId, clipIds))
			.groupBy(reactions.clipId),
		db
			.select({ clipId: comments.clipId, count: sql<number>`count(*)` })
			.from(comments)
			.where(inArray(comments.clipId, clipIds))
			.groupBy(comments.clipId),
		db
			.select({ clipId: watched.clipId, count: sql<number>`count(*)` })
			.from(watched)
			.where(inArray(watched.clipId, clipIds))
			.groupBy(watched.clipId)
	]);

	const reactionMap = new Map(reactionCounts.map((r) => [r.clipId, r.count]));
	const commentMap = new Map(commentCounts.map((c) => [c.clipId, c.count]));
	const viewMap = new Map(viewCounts.map((v) => [v.clipId, v.count]));

	const scores = new Map<string, number>();
	for (const id of clipIds) {
		scores.set(id, (viewMap.get(id) || 0) + (reactionMap.get(id) || 0) + (commentMap.get(id) || 0));
	}
	return scores;
}

export const GET: RequestHandler = withAuth(async ({ url }, { user }) => {
	const filter = url.searchParams.get('filter');
	if (filter && !(VALID_FILTERS as readonly string[]).includes(filter)) {
		return badRequest('Invalid filter. Must be unwatched, watched, favorites, or uploads');
	}
	const sort = url.searchParams.get('sort') || 'oldest';
	if (!(VALID_SORTS as readonly string[]).includes(sort)) {
		return badRequest('Invalid sort. Must be oldest, round-robin, or best');
	}
	const limit = safeInt(url.searchParams.get('limit'), 20, 50);
	const offset = safeInt(url.searchParams.get('offset'), 0);
	const groupId = user.groupId;
	const userId = user.id;

	// Get all clips for the group
	let allClips = await db.query.clips.findMany({
		where: and(eq(clips.groupId, groupId), eq(clips.status, 'ready')),
		orderBy: [asc(clips.createdAt)]
	});

	// Get watched and favorited clip IDs for this user
	const watchedRows = await db.query.watched.findMany({
		where: eq(watched.userId, userId)
	});
	const watchedIds = new Set(watchedRows.map((w) => w.clipId));

	const favRows = await db.query.favorites.findMany({
		where: eq(favorites.userId, userId)
	});
	const favIds = new Set(favRows.map((f) => f.clipId));

	// Get dismissed clip IDs for this user (excluded from unwatched filter)
	const dismissedRows = await db.query.dismissedClips.findMany({
		where: eq(dismissedClips.userId, userId)
	});
	const dismissedIds = new Set(dismissedRows.map((d) => d.clipId));

	// Apply filter before pagination so we only fetch related data for visible clips
	allClips = applyFilter(allClips, filter, watchedIds, favIds, userId, dismissedIds);

	// Compute engagement scores for 'best' sort (needs all filtered clip IDs before pagination)
	const engagementScores =
		sort === 'best' && allClips.length > 0
			? await computeEngagementScores(allClips.map((c) => c.id))
			: undefined;

	allClips = applySortOrder(allClips, sort, filter, watchedRows, favRows, engagementScores);

	const total = allClips.length;
	const paginatedClips = allClips.slice(offset, offset + limit);
	const clipIds = paginatedClips.map((c) => c.id);

	// Only fetch related data for the paginated clips
	const clipReactions =
		clipIds.length > 0
			? await db.query.reactions.findMany({
					where: inArray(reactions.clipId, clipIds)
				})
			: [];
	const reactionsByClip = groupReactionsByClip(clipReactions, userId);

	// Get comment counts for paginated clips only
	const clipComments =
		clipIds.length > 0
			? await db.query.comments.findMany({
					where: inArray(comments.clipId, clipIds)
				})
			: [];
	const clipIdSet = new Set(clipIds);
	const commentCounts = countByClipId(clipComments, clipIdSet);

	// Get unread comment counts (comments since user last viewed)
	const userCommentViews = await db.query.commentViews.findMany({
		where: eq(commentViews.userId, userId)
	});
	const viewedAtMap = new Map<string, Date>();
	for (const cv of userCommentViews) {
		viewedAtMap.set(cv.clipId, cv.viewedAt);
	}
	const unreadCommentCounts = countUnreadComments(clipComments, clipIdSet, viewedAtMap, userId);

	// Get view counts for paginated clips only
	const clipWatchedRows =
		clipIds.length > 0
			? await db.query.watched.findMany({
					where: inArray(watched.clipId, clipIds)
				})
			: [];
	const viewCounts = countByClipId(clipWatchedRows, clipIdSet);

	// Get favorite counts (all users) for paginated clips
	const allFavRows =
		clipIds.length > 0
			? await db.query.favorites.findMany({
					where: inArray(favorites.clipId, clipIds)
				})
			: [];
	const favCounts = countByClipId(allFavRows, clipIdSet);

	// Compute which clips have been watched by someone other than the uploader
	const uploaderMap = new Map(paginatedClips.map((c) => [c.id, c.addedBy]));
	const seenByOthersSet = new Set<string>();
	for (const w of clipWatchedRows) {
		if (uploaderMap.has(w.clipId) && w.userId !== uploaderMap.get(w.clipId)) {
			seenByOthersSet.add(w.clipId);
		}
	}

	// Look up usernames + avatars only for users who added these clips
	const usersMap = await mapUsersByIds(paginatedClips.map((c) => c.addedBy));

	const result = paginatedClips.map((c) => ({
		...c,
		addedByUsername: usersMap.get(c.addedBy)?.username || 'Unknown',
		addedByAvatar: usersMap.get(c.addedBy)?.avatarPath || null,
		watched: watchedIds.has(c.id),
		favorited: favIds.has(c.id),
		reactions: reactionsByClip.get(c.id) || {},
		commentCount: commentCounts.get(c.id) || 0,
		unreadCommentCount: unreadCommentCounts.get(c.id) || 0,
		viewCount: viewCounts.get(c.id) || 0,
		favoriteCount: favCounts.get(c.id) || 0,
		seenByOthers: seenByOthersSet.has(c.id)
	}));

	return json({ clips: result, hasMore: offset + limit < total });
});

/** Auto-post a message as the first comment on a clip, with @mention notifications. */
async function autoPostComment(
	clipId: string,
	user: { id: string; username: string; groupId: string },
	message: string,
	now: Date
) {
	const commentId = uuid();
	await db.insert(comments).values({
		id: commentId,
		clipId,
		userId: user.id,
		parentId: null,
		text: message,
		gifUrl: null,
		createdAt: now
	});

	const mentionedUsernames = extractMentions(message);
	if (mentionedUsernames.length > 0) {
		notifyMentions({
			mentionedUsernames,
			actorId: user.id,
			actorUsername: user.username,
			clipId,
			groupId: user.groupId,
			commentPreview: message.slice(0, 80)
		}).catch((err) => log.error({ err, clipId }, 'mention notifications failed'));
	}
}

type QueueResult = { queued: false } | { queued: true; scheduledAt: Date; position: number };

function tryEnqueue(
	pacing: import('$lib/server/share-limit').SharePacingResult,
	clipId: string,
	userId: string,
	groupId: string,
	cooldownMinutes: number,
	burst: number
): QueueResult | Response {
	if (pacing.mode !== 'queue' || !pacing.queued) return { queued: false };
	const entry = enqueueClip(clipId, userId, groupId, cooldownMinutes, burst);
	if (!entry)
		return json({ error: 'Your queue is full (max 10).', queueFull: true }, { status: 429 });
	return { queued: true, scheduledAt: entry.scheduledAt, position: entry.position };
}

function buildClipResponse(
	clipId: string,
	contentType: string,
	pacing: import('$lib/server/share-limit').SharePacingResult,
	qr: QueueResult
): Record<string, unknown> {
	const resp: Record<string, unknown> = {
		clip: { id: clipId, status: 'downloading', contentType }
	};
	if (qr.queued)
		Object.assign(resp, {
			queued: true,
			scheduledAt: qr.scheduledAt.toISOString(),
			queuePosition: qr.position,
			sharesIn: formatRelativeTime(Math.max(0, qr.scheduledAt.getTime() - Date.now()))
		});
	if (pacing.mode === 'daily_cap')
		Object.assign(resp, {
			shareCountToday: pacing.limitCheck.shareCountToday + 1,
			dailyShareLimit: pacing.limitCheck.dailyShareLimit
		});
	return resp;
}

async function handleExistingClip(
	existing: typeof clips.$inferSelect,
	validUrl: string,
	title: string | null
): Promise<Response> {
	if (existing.status === 'failed') {
		if (title) await db.update(clips).set({ title }).where(eq(clips.id, existing.id));
		await startDownload(existing.id, validUrl, existing.contentType, 're-add retry');
		return json(
			{ clip: { id: existing.id, status: 'downloading', contentType: existing.contentType } },
			{ status: 201 }
		);
	}
	const qe = db
		.select({ scheduledAt: clipQueue.scheduledAt })
		.from(clipQueue)
		.where(eq(clipQueue.clipId, existing.id))
		.get();
	const resp: Record<string, unknown> = {
		error: 'This link has already been added to the feed.',
		addedBy: existing.addedBy
	};
	if (qe)
		Object.assign(resp, {
			inQueue: true,
			sharesIn: formatRelativeTime(Math.max(0, qe.scheduledAt.getTime() - Date.now()))
		});
	return json(resp, { status: 409 });
}

export const POST: RequestHandler = withAuth(async ({ request }, { user, group }) => {
	const provider = await getActiveProvider(user.groupId);
	if (!provider)
		return badRequest(
			'No download provider configured. Ask your group host to set one up in Settings.'
		);

	const body = await parseBody<{ url?: string; title?: string; message?: string; tz?: string }>(
		request
	);
	if (isResponse(body)) return body;

	const { url: videoUrl } = body;
	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 500) || null : null;
	const message =
		typeof body.message === 'string' ? body.message.trim().slice(0, 500) || null : null;
	const urlError = validateClipUrl(videoUrl, group);
	if (urlError) return urlError;
	const validUrl = videoUrl!;
	const platform = detectPlatform(validUrl)!;
	const contentType = getContentType(platform);
	const normalizedUrl = normalizeUrl(validUrl);

	const tz = typeof body.tz === 'string' ? body.tz : null;
	const pacing = checkSharePacing(user.id, user.groupId, group, tz);
	if (pacing.mode === 'daily_cap' && pacing.response) return pacing.response;

	const existing = await db.query.clips.findFirst({
		where: and(eq(clips.groupId, user.groupId), eq(clips.originalUrl, normalizedUrl))
	});
	if (existing) return handleExistingClip(existing, validUrl, title);

	const clipId = uuid();
	const now = new Date();
	try {
		db.transaction((tx) => {
			tx.insert(clips)
				.values({
					id: clipId,
					groupId: user.groupId,
					addedBy: user.id,
					originalUrl: normalizedUrl,
					title: title || null,
					platform,
					contentType,
					status: 'downloading',
					createdAt: now
				})
				.run();
			tx.insert(watched)
				.values({ clipId, userId: user.id, watchPercent: 100, watchedAt: now })
				.run();
		});
	} catch (err) {
		log.error({ err, clipId }, 'failed to insert clip');
		return json({ error: 'Failed to create clip' }, { status: 500 });
	}

	const queueResult = tryEnqueue(
		pacing,
		clipId,
		user.id,
		user.groupId,
		group.shareCooldownMinutes,
		group.shareBurst
	);
	if (queueResult instanceof Response) return queueResult;

	await startDownload(clipId, validUrl, contentType, 'new clip');
	if (message) await autoPostComment(clipId, user, message, now);
	return json(buildClipResponse(clipId, contentType, pacing, queueResult), { status: 201 });
});

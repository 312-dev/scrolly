import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	clips,
	watched,
	favorites,
	commentViews,
	reactions,
	comments
} from '$lib/server/db/schema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import {
	isSupportedUrl,
	detectPlatform,
	getContentType,
	isPlatformAllowed,
	platformLabel
} from '$lib/url-validation';
import { downloadVideo } from '$lib/server/video/download';
import { downloadMusic } from '$lib/server/music/download';
import { normalizeUrl } from '$lib/server/download-lock';
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
import { createLogger } from '$lib/server/logger';

const log = createLogger('clips');

/** Set clip status to 'downloading' and trigger the download pipeline. Marks as 'failed' on error. */
async function startDownload(clipId: string, url: string, contentType: string, label: string) {
	await db.update(clips).set({ status: 'downloading' }).where(eq(clips.id, clipId));

	const onError = async (err: unknown) => {
		log.error({ err, clipId }, `download failed (${label})`);
		await db
			.update(clips)
			.set({ status: 'failed' })
			.where(and(eq(clips.id, clipId), eq(clips.status, 'downloading')));
	};

	if (contentType === 'music') {
		downloadMusic(clipId, url).catch(onError);
	} else {
		downloadVideo(clipId, url).catch(onError);
	}
}

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

const VALID_FILTERS = ['unwatched', 'watched', 'favorites'] as const;
const VALID_SORTS = ['oldest', 'round-robin'] as const;

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

function applySortOrder(
	clipList: ClipRow[],
	sort: string,
	filter: string | null,
	watchedRows: { clipId: string; watchedAt: Date }[],
	favRows: { clipId: string; createdAt: Date }[]
): ClipRow[] {
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
	if (sort === 'round-robin') {
		// Group clips by member, each group already in createdAt asc order
		const byMember = new Map<string, ClipRow[]>();
		for (const clip of clipList) {
			const list = byMember.get(clip.addedBy) || [];
			list.push(clip);
			byMember.set(clip.addedBy, list);
		}
		// Interleave: pick oldest from each member in rotation
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
	// 'oldest': already sorted by createdAt asc from the DB query
	return clipList;
}

export const GET: RequestHandler = withAuth(async ({ url }, { user }) => {
	const filter = url.searchParams.get('filter');
	if (filter && !(VALID_FILTERS as readonly string[]).includes(filter)) {
		return badRequest('Invalid filter. Must be unwatched, watched, or favorites');
	}
	const sort = url.searchParams.get('sort') || 'oldest';
	if (!(VALID_SORTS as readonly string[]).includes(sort)) {
		return badRequest('Invalid sort. Must be oldest or round-robin');
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

	// Apply filter before pagination so we only fetch related data for visible clips
	if (filter === 'unwatched') {
		allClips = allClips.filter((c) => !watchedIds.has(c.id));
	} else if (filter === 'watched') {
		allClips = allClips.filter((c) => watchedIds.has(c.id));
	} else if (filter === 'favorites') {
		allClips = allClips.filter((c) => favIds.has(c.id));
	}

	allClips = applySortOrder(allClips, sort, filter, watchedRows, favRows);

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
		seenByOthers: seenByOthersSet.has(c.id)
	}));

	return json({ clips: result, hasMore: offset + limit < total });
});

export const POST: RequestHandler = withAuth(async ({ request }, { user, group }) => {
	// Check that a download provider is configured
	const provider = await getActiveProvider(user.groupId);
	if (!provider) {
		return json(
			{ error: 'No download provider configured. Ask your group host to set one up in Settings.' },
			{ status: 400 }
		);
	}

	const body = await parseBody<{ url?: string; title?: string; message?: string }>(request);
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

	// Check if this URL already exists in the group's feed
	const existing = await db.query.clips.findFirst({
		where: and(eq(clips.groupId, user.groupId), eq(clips.originalUrl, normalizedUrl))
	});
	if (existing && existing.status === 'failed') {
		// Previous attempt failed — retry the download instead of rejecting
		if (title) {
			await db.update(clips).set({ title }).where(eq(clips.id, existing.id));
		}
		await startDownload(existing.id, validUrl, existing.contentType, 're-add retry');
		return json(
			{ clip: { id: existing.id, status: 'downloading', contentType: existing.contentType } },
			{ status: 201 }
		);
	}
	if (existing) {
		return json({ error: 'This link has already been added to the feed.' }, { status: 409 });
	}

	const clipId = uuid();
	const now = new Date();

	// Insert clip + auto-watched in a transaction so both succeed or fail together
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

		// Auto-mark as watched by the uploader so it never appears in their "New" tab
		tx.insert(watched)
			.values({
				clipId,
				userId: user.id,
				watchPercent: 100,
				watchedAt: now
			})
			.run();
	});

	// Route to appropriate download pipeline
	await startDownload(clipId, validUrl, contentType, 'new clip');

	// Push notification is sent after download succeeds (see video/download.ts, music/download.ts)

	// Auto-post message as the first comment on the clip
	if (message) {
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

		// Notify @mentioned users
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

	return json({ clip: { id: clipId, status: 'downloading', contentType } }, { status: 201 });
});

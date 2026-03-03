import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clips, watched, users } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
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
import { createLogger } from '$lib/server/logger';
import { authenticateShortcutToken } from '$lib/server/shortcut-auth';

const log = createLogger('share');

/** Shortcut-friendly JSON response. Every response includes `success` (1|0) and `message`. */
function shareResponse(
	success: boolean,
	message: string,
	status: number,
	extra?: Record<string, unknown>
) {
	return json({ success: success ? 1 : 0, message, ...extra }, { status });
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
	// 1. Parse body
	let body: { url?: string; phone?: string; phones?: string[] };
	try {
		body = await request.json();
	} catch {
		return shareResponse(false, '❌  Something went wrong. Try sharing again.', 400);
	}

	const videoUrl = body.url;
	// Support `phone` (string, new) or first element of `phones` (array, legacy fallback)
	const phone = body.phone || (Array.isArray(body.phones) ? body.phones[0] : undefined);

	if (!videoUrl || typeof videoUrl !== 'string') {
		return shareResponse(false, '❌  No link found. Try sharing again from the app.', 400);
	}

	// 2. Authenticate — cookie first, then token+phone
	const authResult =
		locals.user && locals.group
			? { user: locals.user, group: locals.group }
			: await authenticateShortcutToken(url.searchParams.get('token'), phone);

	if ('error' in authResult) {
		return shareResponse(false, `❌  ${authResult.error}`, 401);
	}
	const { user: matchedUser, group } = authResult;

	// 3. Check download provider
	const provider = await getActiveProvider(group.id);
	if (!provider) {
		return shareResponse(
			false,
			"❌  Downloads aren't set up yet. Ask your group host to configure one in scrolly settings.",
			400
		);
	}

	// 4. Validate URL
	if (!isSupportedUrl(videoUrl)) {
		return shareResponse(
			false,
			"❌  This link isn't supported. Try sharing from TikTok, Instagram, YouTube, or other supported apps.",
			400
		);
	}

	// 5. Platform filter
	const platform = detectPlatform(videoUrl)!;
	const filterList = group.platformFilterList ? JSON.parse(group.platformFilterList) : null;
	if (!isPlatformAllowed(platform, group.platformFilterMode, filterList)) {
		return shareResponse(
			false,
			`❌  ${platformLabel(videoUrl) || platform} links aren't allowed in this group.`,
			400
		);
	}

	// 6. Content type and normalize URL
	const contentType = getContentType(platform);
	const normalizedVideoUrl = normalizeUrl(videoUrl);

	// 7. Duplicate check
	const existing = await db.query.clips.findFirst({
		where: and(eq(clips.groupId, group.id), eq(clips.originalUrl, normalizedVideoUrl))
	});
	if (existing && existing.status === 'failed') {
		// Previous attempt failed — retry the download instead of rejecting
		await startDownload(existing.id, videoUrl, existing.contentType, 're-share retry');
		return shareResponse(true, '✅  Clip shared! (retrying download)', 201, {
			clipId: existing.id
		});
	}
	if (existing) {
		return shareResponse(false, '❌  This clip has already been shared!', 409);
	}

	// 8. Create clip + auto-watched in a transaction so both succeed or fail together
	const clipId = uuid();
	const now = new Date();
	try {
		db.transaction((tx) => {
			tx.insert(clips)
				.values({
					id: clipId,
					groupId: group.id,
					addedBy: matchedUser.id,
					originalUrl: normalizedVideoUrl,
					title: null,
					platform,
					contentType,
					status: 'downloading',
					createdAt: now
				})
				.run();

			// Auto-mark as watched by uploader so it never appears in their "New" tab
			tx.insert(watched)
				.values({
					clipId,
					userId: matchedUser.id,
					watchPercent: 100,
					watchedAt: now
				})
				.run();
		});
	} catch (err) {
		log.error({ err, clipId }, 'failed to insert clip');
		return shareResponse(false, 'Something went wrong. Try sharing again.', 500);
	}

	// 10. Async download (skip trim for shortcut shares — no UI available)
	await startDownload(clipId, videoUrl, contentType, 'new clip', { skipTrim: true });

	// Record legacy share timestamp for upgrade banner
	db.update(users).set({ lastLegacyShareAt: now }).where(eq(users.id, matchedUser.id)).run();

	// Push notification is sent after download succeeds (see video/download.ts, music/download.ts)

	return shareResponse(true, '✅  Clip shared!', 201, { clipId });
};

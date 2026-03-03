import { db } from '../db';
import { clips } from '../db/schema';
import { eq } from 'drizzle-orm';
import { deduplicatedDownload } from '../download-lock';
import { getActiveProvider } from '../providers/registry';
import {
	DATA_DIR,
	getClipWithMaxFileSize,
	cleanupClipFiles,
	totalFileSize
} from '$lib/server/download-utils';
import { notifyNewClip } from '$lib/server/push';
import { createLogger } from '$lib/server/logger';

const log = createLogger('video');

async function handleDownloadError(
	clipId: string,
	err: unknown,
	maxFileSizeBytes: number | null
): Promise<void> {
	const errMsg = err instanceof Error ? err.message : String(err);
	const isSizeReject =
		errMsg.includes('match_filter') || errMsg.includes('File is larger than max-filesize');

	if (isSizeReject && maxFileSizeBytes) {
		const sizeMb = Math.round(maxFileSizeBytes / (1024 * 1024));
		log.warn({ clipId }, 'clip rejected by size filter');
		await cleanupClipFiles(clipId);
		await db
			.update(clips)
			.set({ status: 'failed', title: `Exceeds ${sizeMb} MB limit` })
			.where(eq(clips.id, clipId));
		// Still notify — clip is viewable via external link
		await notifyNewClip(clipId).catch((err2) =>
			log.error({ err: err2, clipId }, 'push notification failed')
		);
		return;
	}

	log.error({ err, clipId }, 'download failed');
	await cleanupClipFiles(clipId);
	await db.update(clips).set({ status: 'failed' }).where(eq(clips.id, clipId));
	// Still notify — clip is viewable via external link
	await notifyNewClip(clipId).catch((err2) =>
		log.error({ err: err2, clipId }, 'push notification failed')
	);
}

async function downloadVideoInner(clipId: string, url: string): Promise<void> {
	// Single query: fetch clip record + group's max file size via JOIN
	const data = getClipWithMaxFileSize(clipId);
	if (!data) return;
	const { clip, maxFileSizeBytes } = data;

	// Resolve the active provider for this clip's group
	const provider = await getActiveProvider(clip.groupId);
	if (!provider) {
		await db
			.update(clips)
			.set({ status: 'failed', title: 'No download provider configured' })
			.where(eq(clips.id, clipId));
		// Still notify — clip is viewable via external link
		await notifyNewClip(clipId).catch((err) =>
			log.error({ err, clipId }, 'push notification failed')
		);
		return;
	}

	try {
		const result = await provider.downloadVideo(url, {
			outputDir: DATA_DIR,
			clipId,
			maxFileSizeBytes
		});

		// Post-download file size safety net
		const fileSizeBytes = await totalFileSize([result.videoPath, result.thumbnailPath]);
		if (maxFileSizeBytes && fileSizeBytes > maxFileSizeBytes) {
			const sizeMb = Math.round(maxFileSizeBytes / (1024 * 1024));
			log.warn({ clipId, fileSizeBytes, maxFileSizeBytes }, 'clip file size exceeds limit');
			await cleanupClipFiles(clipId);
			await db
				.update(clips)
				.set({
					status: 'failed',
					title: `Exceeds ${sizeMb} MB limit`,
					durationSeconds: result.duration,
					creatorName: result.creatorName,
					creatorUrl: result.creatorUrl
				})
				.where(eq(clips.id, clipId));
			// Still notify — clip is viewable via external link
			await notifyNewClip(clipId).catch((err) =>
				log.error({ err, clipId }, 'push notification failed')
			);
			return;
		}

		// Keep existing title (caption from SMS) if present, otherwise use provider-extracted title
		const title = clip.title || result.title || null;

		await db
			.update(clips)
			.set({
				status: 'ready',
				videoPath: result.videoPath,
				thumbnailPath: result.thumbnailPath,
				title,
				durationSeconds: result.duration,
				fileSizeBytes: fileSizeBytes || null,
				creatorName: result.creatorName,
				creatorUrl: result.creatorUrl
			})
			.where(eq(clips.id, clipId));

		// Notify group now that the clip is actually ready
		await notifyNewClip(clipId).catch((err) =>
			log.error({ err, clipId }, 'push notification failed')
		);
	} catch (err) {
		await handleDownloadError(clipId, err, maxFileSizeBytes);
	}
}

export async function downloadVideo(clipId: string, url: string): Promise<void> {
	return deduplicatedDownload(clipId, url, downloadVideoInner);
}

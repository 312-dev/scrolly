import { stat } from 'fs/promises';
import { db } from '../db';
import { clips } from '../db/schema';
import { eq } from 'drizzle-orm';
import { deduplicatedDownload } from '../download-lock';
import { getActiveProvider } from '../providers/registry';
import type { AudioDownloadResult } from '../providers/types';
import { DATA_DIR, getClipWithMaxFileSize, cleanupClipFiles } from '$lib/server/download-utils';
import { notifyNewClip } from '$lib/server/push';
import { createLogger } from '$lib/server/logger';

const log = createLogger('music');

interface OdesliResponse {
	entityUniqueId: string;
	entitiesByUniqueId: Record<
		string,
		{
			title?: string;
			artistName?: string;
			thumbnailUrl?: string;
		}
	>;
	linksByPlatform: Record<
		string,
		{
			url: string;
			entityUniqueId: string;
		}
	>;
}

interface MusicMetadata {
	title: string | null;
	artist: string | null;
	albumArt: string | null;
	spotifyUrl: string | null;
	appleMusicUrl: string | null;
	youtubeMusicUrl: string | null;
}

async function resolveOdesli(url: string): Promise<MusicMetadata> {
	const apiUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
	const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });

	if (!res.ok) {
		log.error({ status: res.status, url }, 'odesli API error');
		return {
			title: null,
			artist: null,
			albumArt: null,
			spotifyUrl: null,
			appleMusicUrl: null,
			youtubeMusicUrl: null
		};
	}

	const data: OdesliResponse = await res.json();
	const entity = data.entitiesByUniqueId[data.entityUniqueId];

	return {
		title: entity?.title || null,
		artist: entity?.artistName || null,
		albumArt: entity?.thumbnailUrl || null,
		spotifyUrl: data.linksByPlatform?.spotify?.url || null,
		appleMusicUrl: data.linksByPlatform?.appleMusic?.url || null,
		youtubeMusicUrl: data.linksByPlatform?.youtubeMusic?.url || null
	};
}

async function finalizeMusicClip(
	clipId: string,
	result: AudioDownloadResult,
	metadata: MusicMetadata,
	maxFileSizeBytes: number | null,
	existingTitle: string | null
): Promise<void> {
	// Calculate file size
	let fileSizeBytes = 0;
	try {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		const s = await stat(result.audioPath);
		fileSizeBytes = s.size;
	} catch {
		// File may not exist
	}

	// Post-download file size safety net
	if (maxFileSizeBytes && fileSizeBytes > maxFileSizeBytes) {
		const sizeMb = Math.round(maxFileSizeBytes / (1024 * 1024));
		log.warn({ clipId, fileSizeBytes, maxFileSizeBytes }, 'music clip size exceeds limit');
		await cleanupClipFiles(clipId);
		await db
			.update(clips)
			.set({
				status: 'failed',
				title: `Exceeds ${sizeMb} MB limit`,
				durationSeconds: result.duration
			})
			.where(eq(clips.id, clipId));
		await notifyNewClip(clipId).catch((err) =>
			log.error({ err, clipId }, 'push notification failed')
		);
		return;
	}

	// Keep existing title (caption from SMS or metadata update) if present
	const title = existingTitle || metadata.title || null;

	await db
		.update(clips)
		.set({
			status: 'ready',
			audioPath: result.audioPath,
			title,
			durationSeconds: result.duration,
			fileSizeBytes: fileSizeBytes || null
		})
		.where(eq(clips.id, clipId));

	// Notify group now that the clip is actually ready
	await notifyNewClip(clipId).catch((err) =>
		log.error({ err, clipId }, 'push notification failed')
	);
}

async function downloadMusicInner(clipId: string, url: string): Promise<void> {
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
		await notifyNewClip(clipId).catch((err) =>
			log.error({ err, clipId }, 'push notification failed')
		);
		return;
	}

	try {
		// Step 1: Resolve metadata from Odesli
		const metadata = await resolveOdesli(url);

		// Step 2: Update clip immediately with metadata (UI can show song info while downloading)
		// Preserve user-provided caption if present (e.g. from SMS share)
		const resolvedTitle = clip.title || metadata.title;
		await db
			.update(clips)
			.set({
				title: resolvedTitle,
				artist: metadata.artist,
				albumArt: metadata.albumArt,
				spotifyUrl: metadata.spotifyUrl,
				appleMusicUrl: metadata.appleMusicUrl,
				youtubeMusicUrl: metadata.youtubeMusicUrl
			})
			.where(eq(clips.id, clipId));

		// Step 3: Search YouTube and download audio via provider
		let result: AudioDownloadResult | null = null;
		const downloadOptions = {
			outputDir: DATA_DIR,
			clipId,
			maxFileSizeBytes
		};

		if (metadata.title && metadata.artist) {
			try {
				result = await provider.downloadAudio(
					`ytsearch1:${metadata.title} ${metadata.artist}`,
					downloadOptions
				);
			} catch (err) {
				log.error({ err, title: metadata.title, artist: metadata.artist }, 'youtube search failed');
			}
		}

		// Step 4: Fallback — try the YouTube Music URL directly
		if (!result && metadata.youtubeMusicUrl) {
			try {
				result = await provider.downloadAudio(metadata.youtubeMusicUrl, downloadOptions);
			} catch (err) {
				log.error({ err }, 'youtube music URL download failed');
			}
		}

		if (result) {
			await finalizeMusicClip(clipId, result, metadata, maxFileSizeBytes, resolvedTitle ?? null);
		} else {
			// Failed to download audio, but metadata + platform links are still visible
			await cleanupClipFiles(clipId);
			await db.update(clips).set({ status: 'failed' }).where(eq(clips.id, clipId));
			await notifyNewClip(clipId).catch((err) =>
				log.error({ err, clipId }, 'push notification failed')
			);
		}
	} catch (err) {
		log.error({ err, clipId }, 'music download failed');
		await cleanupClipFiles(clipId);
		await db.update(clips).set({ status: 'failed' }).where(eq(clips.id, clipId));
		await notifyNewClip(clipId).catch((err2) =>
			log.error({ err: err2, clipId }, 'push notification failed')
		);
	}
}

export async function downloadMusic(clipId: string, url: string): Promise<void> {
	return deduplicatedDownload(clipId, url, downloadMusicInner);
}

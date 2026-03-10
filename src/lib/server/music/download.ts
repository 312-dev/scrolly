import { stat } from 'fs/promises';
import { db } from '../db';
import { clips } from '../db/schema';
import { eq } from 'drizzle-orm';
import { deduplicatedDownload } from '../download-lock';
import { getActiveProvider } from '../providers/registry';
import type { AudioDownloadResult } from '../providers/types';
import { DATA_DIR, getClipWithMaxFileSize, cleanupClipFiles } from '$lib/server/download-utils';
import { notifyNewClip } from '$lib/server/push';
import { setClipReady } from '$lib/server/queue';
import { generateWaveform } from '$lib/server/audio/waveform';
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
	const t0 = performance.now();
	const apiUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
	const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });

	if (!res.ok) {
		log.error(
			{ status: res.status, url, durationMs: Math.round(performance.now() - t0) },
			'odesli API error'
		);
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

	log.info({ url, durationMs: Math.round(performance.now() - t0) }, 'odesli resolved');

	return {
		title: entity?.title || null,
		artist: entity?.artistName || null,
		albumArt: entity?.thumbnailUrl || null,
		spotifyUrl: data.linksByPlatform?.spotify?.url || null,
		appleMusicUrl: data.linksByPlatform?.appleMusic?.url || null,
		youtubeMusicUrl: data.linksByPlatform?.youtubeMusic?.url || null
	};
}

const INITIAL_TRIM_DEADLINE_SECONDS = 30;

async function finalizeMusicClip(
	clipId: string,
	result: AudioDownloadResult,
	maxFileSizeBytes: number | null,
	existingTitle: string | null,
	skipTrim = false
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

	const title = existingTitle || null;

	if (skipTrim) {
		// Shortcut path: publish immediately without trim opportunity
		const t0 = performance.now();
		const finalStatus = await setClipReady(clipId, {
			audioPath: result.audioPath,
			title,
			durationSeconds: result.duration,
			fileSizeBytes: fileSizeBytes || null
		});
		log.info(
			{ clipId, finalStatus, durationMs: Math.round(performance.now() - t0) },
			'music clip finalized'
		);
		return;
	}

	// Generate waveform for trim UI (best-effort — trim works without it)
	try {
		const t0 = performance.now();
		await generateWaveform(result.audioPath, clipId);
		log.info({ clipId, durationMs: Math.round(performance.now() - t0) }, 'waveform generated');
	} catch (err) {
		log.warn({ err, clipId }, 'waveform generation failed');
	}

	// Mark as pending_trim with a deadline for auto-publish
	const trimDeadline = new Date(Date.now() + INITIAL_TRIM_DEADLINE_SECONDS * 1000);

	await db
		.update(clips)
		.set({
			status: 'pending_trim',
			audioPath: result.audioPath,
			title,
			durationSeconds: result.duration,
			fileSizeBytes: fileSizeBytes || null,
			trimDeadline
		})
		.where(eq(clips.id, clipId));

	log.info({ clipId, trimDeadline: trimDeadline.toISOString() }, 'clip awaiting trim');
	// Notification deferred until publish (trim, skip, or auto-publish)
}

async function downloadMusicInner(
	clipId: string,
	url: string,
	options?: { skipTrim?: boolean }
): Promise<void> {
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
		let t0 = performance.now();
		await db
			.update(clips)
			.set({
				title: clip.title || metadata.title || null,
				artist: metadata.artist,
				albumArt: metadata.albumArt,
				spotifyUrl: metadata.spotifyUrl,
				appleMusicUrl: metadata.appleMusicUrl,
				youtubeMusicUrl: metadata.youtubeMusicUrl
			})
			.where(eq(clips.id, clipId));
		log.info({ clipId, durationMs: Math.round(performance.now() - t0) }, 'metadata saved');

		// Step 3: Search YouTube and download audio via provider
		let result: AudioDownloadResult | null = null;
		const downloadOptions = {
			outputDir: DATA_DIR,
			clipId,
			maxFileSizeBytes
		};

		if (metadata.title && metadata.artist) {
			try {
				t0 = performance.now();
				result = await provider.downloadAudio(
					`ytsearch1:${metadata.title} ${metadata.artist}`,
					downloadOptions
				);
				log.info(
					{ clipId, durationMs: Math.round(performance.now() - t0), method: 'yt-search' },
					'audio downloaded'
				);
			} catch (err) {
				log.error(
					{
						err,
						title: metadata.title,
						artist: metadata.artist,
						durationMs: Math.round(performance.now() - t0)
					},
					'youtube search failed'
				);
			}
		}

		// Step 4: Fallback — try the YouTube Music URL directly
		if (!result && metadata.youtubeMusicUrl) {
			try {
				t0 = performance.now();
				result = await provider.downloadAudio(metadata.youtubeMusicUrl, downloadOptions);
				log.info(
					{ clipId, durationMs: Math.round(performance.now() - t0), method: 'yt-music-url' },
					'audio downloaded'
				);
			} catch (err) {
				log.error(
					{ err, durationMs: Math.round(performance.now() - t0) },
					'youtube music URL download failed'
				);
			}
		}

		if (result) {
			t0 = performance.now();
			await finalizeMusicClip(
				clipId,
				result,
				maxFileSizeBytes,
				clip.title || metadata.title || null,
				options?.skipTrim
			);
			log.info({ clipId, durationMs: Math.round(performance.now() - t0) }, 'finalize complete');
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

export async function downloadMusic(
	clipId: string,
	url: string,
	options?: { skipTrim?: boolean }
): Promise<void> {
	return deduplicatedDownload(clipId, url, (id, u) => downloadMusicInner(id, u, options));
}

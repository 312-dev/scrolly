import { db } from './db';
import { clips } from './db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('download');

export interface DownloadResult {
	status: 'ready' | 'failed' | 'pending_trim';
	videoPath: string | null;
	thumbnailPath: string | null;
	audioPath: string | null;
	title: string | null;
	artist: string | null;
	albumArt: string | null;
	spotifyUrl: string | null;
	appleMusicUrl: string | null;
	youtubeMusicUrl: string | null;
	durationSeconds: number | null;
}

const activeDownloads = new Map<string, Promise<DownloadResult>>();

const TRACKING_PARAMS = [
	'si',
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_content',
	'utm_term',
	'igshid',
	'igsh',
	'fbclid',
	'ref',
	'ref_src',
	'ref_url',
	's',
	'context',
	'share_id',
	't'
];

export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		for (const param of TRACKING_PARAMS) {
			parsed.searchParams.delete(param);
		}
		const search = parsed.searchParams.toString();
		return parsed.origin + parsed.pathname + (search ? '?' + search : '');
	} catch {
		return url;
	}
}

function clipToResult(clip: typeof clips.$inferSelect): DownloadResult {
	return {
		status: clip.status as DownloadResult['status'],
		videoPath: clip.videoPath,
		thumbnailPath: clip.thumbnailPath,
		audioPath: clip.audioPath,
		title: clip.title,
		artist: clip.artist,
		albumArt: clip.albumArt,
		spotifyUrl: clip.spotifyUrl,
		appleMusicUrl: clip.appleMusicUrl,
		youtubeMusicUrl: clip.youtubeMusicUrl,
		durationSeconds: clip.durationSeconds
	};
}

async function copyResultToClip(clipId: string, result: DownloadResult): Promise<void> {
	const existing = await db.query.clips.findFirst({
		where: eq(clips.id, clipId)
	});
	const title = existing?.title || result.title || null;

	await db
		.update(clips)
		.set({
			status: 'ready',
			videoPath: result.videoPath,
			thumbnailPath: result.thumbnailPath,
			audioPath: result.audioPath,
			title,
			artist: result.artist,
			albumArt: result.albumArt,
			spotifyUrl: result.spotifyUrl,
			appleMusicUrl: result.appleMusicUrl,
			youtubeMusicUrl: result.youtubeMusicUrl,
			durationSeconds: result.durationSeconds
		})
		.where(eq(clips.id, clipId));
}

export async function deduplicatedDownload(
	clipId: string,
	url: string,
	doDownload: (clipId: string, url: string) => Promise<void>
): Promise<void> {
	const normalized = normalizeUrl(url);

	// Phase 1: Check DB for an already-completed clip with this URL
	let t0 = performance.now();
	const readyClip = await db.query.clips.findFirst({
		where: and(
			eq(clips.originalUrl, normalized),
			// Both 'ready' and 'pending_trim' indicate a successful download
			sql`${clips.status} IN ('ready', 'pending_trim')`
		)
	});

	if (readyClip) {
		log.info(
			{ url, sourceClipId: readyClip.id, durationMs: Math.round(performance.now() - t0) },
			'reusing existing download'
		);
		try {
			await copyResultToClip(clipId, clipToResult(readyClip));
			return;
		} catch (err) {
			log.error({ err, sourceClipId: readyClip.id, clipId }, 'failed to reuse clip');
			// Fall through to try downloading fresh
		}
	}

	// Phase 2: Check if this URL is already being downloaded
	const inflight = activeDownloads.get(normalized);
	if (inflight) {
		t0 = performance.now();
		log.info({ url }, 'waiting on active download');
		const result = await inflight;
		log.info(
			{ url, durationMs: Math.round(performance.now() - t0) },
			'active download wait complete'
		);
		if (result.status === 'ready' || result.status === 'pending_trim') {
			try {
				await copyResultToClip(clipId, result);
				return;
			} catch (err) {
				log.error({ err, clipId }, 'failed to copy inflight result');
				// Fall through to try our own download
			}
		}
		// Leader failed — fall through and try our own download
	}

	// Phase 3: We are the leader — do the actual download
	let resolvePromise!: (result: DownloadResult) => void;
	const promise = new Promise<DownloadResult>((resolve) => {
		resolvePromise = resolve;
	});
	activeDownloads.set(normalized, promise);

	try {
		await doDownload(clipId, url);

		const completed = await db.query.clips.findFirst({
			where: eq(clips.id, clipId)
		});

		const result: DownloadResult =
			completed?.status === 'ready' || completed?.status === 'pending_trim'
				? clipToResult(completed)
				: {
						status: 'failed',
						videoPath: null,
						thumbnailPath: null,
						audioPath: null,
						title: null,
						artist: null,
						albumArt: null,
						spotifyUrl: null,
						appleMusicUrl: null,
						youtubeMusicUrl: null,
						durationSeconds: null
					};

		resolvePromise(result);
	} catch {
		resolvePromise({
			status: 'failed',
			videoPath: null,
			thumbnailPath: null,
			audioPath: null,
			title: null,
			artist: null,
			albumArt: null,
			spotifyUrl: null,
			appleMusicUrl: null,
			youtubeMusicUrl: null,
			durationSeconds: null
		});
	} finally {
		activeDownloads.delete(normalized);
	}
}

import { db } from '$lib/server/db';
import { clips } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { downloadVideo } from '$lib/server/video/download';
import { downloadMusic } from '$lib/server/music/download';
import { createLogger } from '$lib/server/logger';

const log = createLogger('clip-download');

/** Set clip status to 'downloading' and trigger the download pipeline. Marks as 'failed' on error. */
export async function startDownload(
	clipId: string,
	url: string,
	contentType: string,
	label: string,
	options?: { skipTrim?: boolean }
) {
	const t0 = performance.now();
	await db.update(clips).set({ status: 'downloading' }).where(eq(clips.id, clipId));

	const onComplete = () => {
		const durationMs = Math.round(performance.now() - t0);
		log.info({ clipId, contentType, durationMs }, `pipeline complete (${label})`);
	};

	const onError = async (err: unknown) => {
		const durationMs = Math.round(performance.now() - t0);
		log.error({ err, clipId, durationMs }, `download failed (${label})`);
		await db
			.update(clips)
			.set({ status: 'failed' })
			.where(and(eq(clips.id, clipId), eq(clips.status, 'downloading')));
	};

	if (contentType === 'music') {
		downloadMusic(clipId, url, { skipTrim: options?.skipTrim }).then(onComplete).catch(onError);
	} else {
		downloadVideo(clipId, url).then(onComplete).catch(onError);
	}
}

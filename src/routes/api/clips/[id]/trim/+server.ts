import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withClipAuth, parseBody, isResponse, badRequest, forbidden } from '$lib/server/api-utils';
import { publishMusicClip } from '$lib/server/music/publish';
import { trimAudio } from '$lib/server/audio/trim';
import { deleteWaveform } from '$lib/server/audio/waveform';
import { db } from '$lib/server/db';
import { clips } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('trim-api');
const MIN_DURATION = 30;

export const POST: RequestHandler = withClipAuth(async ({ params, request }, { user, clip }) => {
	if (clip.addedBy !== user.id) {
		return forbidden('Only the uploader can trim');
	}

	if (clip.status !== 'pending_trim') {
		return badRequest('Clip is not awaiting trim');
	}

	if (clip.contentType !== 'music' || !clip.audioPath) {
		return badRequest('Not a trimmable music clip');
	}

	const body = await parseBody<{ startSeconds: number; endSeconds: number }>(request);
	if (isResponse(body)) return body;

	const { startSeconds, endSeconds } = body;

	if (typeof startSeconds !== 'number' || typeof endSeconds !== 'number') {
		return badRequest('startSeconds and endSeconds are required');
	}
	if (startSeconds < 0) return badRequest('startSeconds must be >= 0');
	if (endSeconds <= startSeconds) return badRequest('endSeconds must be > startSeconds');
	if (endSeconds - startSeconds < MIN_DURATION) {
		return badRequest(`Minimum trim duration is ${MIN_DURATION} seconds`);
	}
	if (clip.durationSeconds && endSeconds > clip.durationSeconds + 0.5) {
		return badRequest('endSeconds exceeds clip duration');
	}

	try {
		const { fileSizeBytes } = await trimAudio(clip.audioPath, startSeconds, endSeconds);
		const newDuration = Math.round(endSeconds - startSeconds);

		await db
			.update(clips)
			.set({ durationSeconds: newDuration, fileSizeBytes })
			.where(eq(clips.id, params.id));

		await publishMusicClip(params.id);
		await deleteWaveform(params.id);

		return json({ status: 'ready', durationSeconds: newDuration });
	} catch (err) {
		log.error({ err, clipId: params.id }, 'trim failed');
		return json({ error: 'Trim failed' }, { status: 500 });
	}
});

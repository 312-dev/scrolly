import { db } from '$lib/server/db';
import { clips } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { notifyNewClip } from '$lib/server/push';
import { createLogger } from '$lib/server/logger';

const log = createLogger('publish');

/**
 * Publish a music clip: mark as ready, clear trim deadline, send notifications.
 * Uses WHERE status = 'pending_trim' for race-safe publish (only one writer wins).
 * Returns true if the clip was actually published, false if already published.
 */
export async function publishMusicClip(clipId: string): Promise<boolean> {
	const result = db
		.update(clips)
		.set({ status: 'ready', trimDeadline: null })
		.where(and(eq(clips.id, clipId), eq(clips.status, 'pending_trim')))
		.run();

	if (result.changes === 0) {
		log.warn({ clipId }, 'publish skipped — clip not in pending_trim state');
		return false;
	}

	log.info({ clipId }, 'music clip published');

	await notifyNewClip(clipId).catch((err) =>
		log.error({ err, clipId }, 'push notification failed after publish')
	);

	return true;
}

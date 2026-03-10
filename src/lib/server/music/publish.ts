import { db } from '$lib/server/db';
import { clips, clipQueue } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { notifyNewClip } from '$lib/server/push';
import { createLogger } from '$lib/server/logger';

const log = createLogger('publish');

/**
 * Publish a music clip: mark as ready, clear trim deadline, send notifications.
 * Uses WHERE status = 'pending_trim' for race-safe publish (only one writer wins).
 * If the clip is in the share queue, sets status to 'queued' instead of 'ready'.
 * Returns true if the clip was actually published, false if already published.
 */
export async function publishMusicClip(clipId: string): Promise<boolean> {
	// Check if this clip is in the share queue
	const [queueEntry] = db
		.select({ id: clipQueue.id })
		.from(clipQueue)
		.where(eq(clipQueue.clipId, clipId))
		.all();

	const targetStatus = queueEntry ? 'queued' : 'ready';

	const result = db
		.update(clips)
		.set({ status: targetStatus, trimDeadline: null })
		.where(and(eq(clips.id, clipId), eq(clips.status, 'pending_trim')))
		.run();

	if (result.changes === 0) {
		log.warn({ clipId }, 'publish skipped — clip not in pending_trim state');
		return false;
	}

	log.info({ clipId, status: targetStatus }, 'music clip published');

	// Only send notification if not queued — scheduler will notify later
	if (!queueEntry) {
		await notifyNewClip(clipId).catch((err) =>
			log.error({ err, clipId }, 'push notification failed after publish')
		);
	}

	return true;
}

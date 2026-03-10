import { db } from '$lib/server/db';
import { clips, clipQueue, groups } from '$lib/server/db/schema';
import { eq, and, sql, desc, lte, gte } from 'drizzle-orm';
import { notifyNewClip, notifyNewClipsBatch } from '$lib/server/push';
import { createLogger } from '$lib/server/logger';
import { v4 as uuid } from 'uuid';

const log = createLogger('queue');

const MAX_QUEUE_DEPTH = 10;

/**
 * Check if a user still has burst slots available (instant shares).
 * Uses a rolling window: burst × cooldownMinutes.
 */
export function checkBurstAvailable(
	userId: string,
	groupId: string,
	burst: number,
	cooldownMinutes: number
): { available: boolean; burstUsed: number; nextSlotAt: Date | null } {
	const windowMs = burst * cooldownMinutes * 60 * 1000;
	const windowStart = new Date(Date.now() - windowMs);

	const notInQueue = sql`${clips.id} NOT IN (SELECT clip_id FROM clip_queue WHERE user_id = ${userId} AND group_id = ${groupId})`;

	// Count clips this user created in the rolling window that went instant
	// (i.e. clips NOT in the clip_queue table)
	const [result] = db
		.select({ count: sql<number>`count(*)` })
		.from(clips)
		.where(
			and(
				eq(clips.addedBy, userId),
				eq(clips.groupId, groupId),
				gte(clips.createdAt, windowStart),
				notInQueue
			)
		)
		.all();

	const burstUsed = result?.count ?? 0;
	const available = burstUsed < burst;

	let nextSlotAt: Date | null = null;
	if (!available) {
		// Find the oldest instant clip in the window — when it ages out, a slot opens
		const [oldest] = db
			.select({ createdAt: clips.createdAt })
			.from(clips)
			.where(
				and(
					eq(clips.addedBy, userId),
					eq(clips.groupId, groupId),
					gte(clips.createdAt, windowStart),
					notInQueue
				)
			)
			.orderBy(clips.createdAt)
			.limit(1)
			.all();

		if (oldest?.createdAt) {
			nextSlotAt = new Date(oldest.createdAt.getTime() + windowMs);
		}
	}

	return { available, burstUsed, nextSlotAt };
}

/**
 * Add a clip to the queue. Returns the queue entry with scheduled publish time.
 */
export function enqueueClip(
	clipId: string,
	userId: string,
	groupId: string,
	cooldownMinutes: number,
	burst = 1
): { id: string; scheduledAt: Date; position: number } | null {
	// Check queue depth
	const [countResult] = db
		.select({ count: sql<number>`count(*)` })
		.from(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.all();

	const currentCount = countResult?.count ?? 0;
	if (currentCount >= MAX_QUEUE_DEPTH) {
		return null; // Queue full
	}

	// Find the latest scheduled_at for this user to chain from
	const [latest] = db
		.select({ scheduledAt: clipQueue.scheduledAt, position: clipQueue.position })
		.from(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.orderBy(desc(clipQueue.scheduledAt))
		.limit(1)
		.all();

	const now = new Date();
	const cooldownMs = cooldownMinutes * 60 * 1000;
	const position = (latest?.position ?? -1) + 1;

	// Burst grouping: clips at the same burst boundary share a scheduled time.
	// Position 0..burst-1 → first window, burst..2*burst-1 → second window, etc.
	const isNewWindow = position % Math.max(1, burst) === 0;
	let scheduledAt: Date;
	if (isNewWindow || !latest?.scheduledAt) {
		const baseTime =
			latest?.scheduledAt && latest.scheduledAt.getTime() > now.getTime()
				? latest.scheduledAt
				: now;
		scheduledAt = new Date(baseTime.getTime() + cooldownMs);
	} else {
		// Same burst window — use the same time as the previous clip
		scheduledAt = latest.scheduledAt.getTime() > now.getTime() ? latest.scheduledAt : now;
	}

	const id = uuid();

	db.insert(clipQueue)
		.values({
			id,
			clipId,
			userId,
			groupId,
			position,
			scheduledAt,
			createdAt: now
		})
		.run();

	log.info({ clipId, userId, scheduledAt: scheduledAt.toISOString(), position }, 'clip enqueued');
	return { id, scheduledAt, position };
}

/**
 * Publish a queued clip: set status to ready, update createdAt, notify group.
 */
export async function publishQueuedClip(
	queueEntryId: string,
	skipNotification = false
): Promise<string | false> {
	const [entry] = db.select().from(clipQueue).where(eq(clipQueue.id, queueEntryId)).all();

	if (!entry) return false;

	const [clip] = db
		.select({ status: clips.status })
		.from(clips)
		.where(eq(clips.id, entry.clipId))
		.all();

	if (!clip || clip.status !== 'queued') return false;

	const now = new Date();

	// Update clip: mark ready and set createdAt to now so it appears at the right feed position
	db.update(clips).set({ status: 'ready', createdAt: now }).where(eq(clips.id, entry.clipId)).run();

	// Remove from queue
	db.delete(clipQueue).where(eq(clipQueue.id, queueEntryId)).run();

	log.info({ clipId: entry.clipId, queueEntryId }, 'queued clip published');

	if (!skipNotification) {
		await notifyNewClip(entry.clipId).catch((err) =>
			log.error({ err, clipId: entry.clipId }, 'push notification failed for queued clip')
		);
	}

	return entry.clipId;
}

/**
 * Called from the download pipeline when a clip finishes downloading.
 * If the clip is in the queue, sets status to 'queued' instead of 'ready'.
 * If not queued, sets status to 'ready' and fires notifications normally.
 *
 * Returns the final status that was set.
 */
export async function setClipReady(
	clipId: string,
	updates: Record<string, unknown>
): Promise<'ready' | 'queued'> {
	const [queueEntry] = db
		.select({ id: clipQueue.id })
		.from(clipQueue)
		.where(eq(clipQueue.clipId, clipId))
		.all();

	if (queueEntry) {
		// Clip is queued — set status to 'queued', scheduler will publish later
		db.update(clips)
			.set({ ...updates, status: 'queued' })
			.where(eq(clips.id, clipId))
			.run();
		log.info({ clipId }, 'clip download complete, held in queue');
		return 'queued';
	}

	// Not queued — normal flow
	db.update(clips)
		.set({ ...updates, status: 'ready' })
		.where(eq(clips.id, clipId))
		.run();

	await notifyNewClip(clipId).catch((err) =>
		log.error({ err, clipId }, 'push notification failed')
	);

	return 'ready';
}

/**
 * Get a user's queued clips with details.
 */
export function getUserQueue(userId: string, groupId: string) {
	return db
		.select({
			id: clipQueue.id,
			clipId: clipQueue.clipId,
			position: clipQueue.position,
			scheduledAt: clipQueue.scheduledAt,
			createdAt: clipQueue.createdAt,
			title: clips.title,
			originalUrl: clips.originalUrl,
			platform: clips.platform,
			contentType: clips.contentType,
			status: clips.status,
			thumbnailPath: clips.thumbnailPath
		})
		.from(clipQueue)
		.innerJoin(clips, eq(clipQueue.clipId, clips.id))
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.orderBy(clipQueue.position)
		.all();
}

/**
 * Cancel a single queued clip. Removes from queue and deletes the clip.
 */
export function cancelQueuedClip(queueEntryId: string, userId: string): boolean {
	const [entry] = db
		.select({ id: clipQueue.id, clipId: clipQueue.clipId })
		.from(clipQueue)
		.where(and(eq(clipQueue.id, queueEntryId), eq(clipQueue.userId, userId)))
		.all();

	if (!entry) return false;

	db.delete(clipQueue).where(eq(clipQueue.id, queueEntryId)).run();
	db.update(clips).set({ status: 'deleted' }).where(eq(clips.id, entry.clipId)).run();

	log.info({ clipId: entry.clipId, queueEntryId }, 'queued clip cancelled');
	return true;
}

/**
 * Move a queue entry to the top (position 0). Recalculate scheduled times.
 */
export function moveToTop(queueEntryId: string, userId: string, groupId: string): boolean {
	const entries = db
		.select()
		.from(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.orderBy(clipQueue.position)
		.all();

	const targetIdx = entries.findIndex((e) => e.id === queueEntryId);
	if (targetIdx < 0) return false;

	// Move target to front
	const [target] = entries.splice(targetIdx, 1);
	entries.unshift(target);

	const [group] = db
		.select({ shareCooldownMinutes: groups.shareCooldownMinutes, shareBurst: groups.shareBurst })
		.from(groups)
		.where(eq(groups.id, groupId))
		.all();
	if (!group) return false;

	recalculateScheduledTimes(entries, group.shareCooldownMinutes, group.shareBurst);
	return true;
}

/**
 * Reorder the queue by an ordered list of queue entry IDs.
 */
export function reorderQueue(userId: string, groupId: string, orderedIds: string[]): boolean {
	const entries = db
		.select()
		.from(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.orderBy(clipQueue.position)
		.all();

	// Validate all IDs match
	if (orderedIds.length !== entries.length) return false;
	const entryMap = new Map(entries.map((e) => [e.id, e]));
	const reordered = orderedIds.map((id) => entryMap.get(id)).filter(Boolean) as typeof entries;
	if (reordered.length !== entries.length) return false;

	const [group] = db
		.select({ shareCooldownMinutes: groups.shareCooldownMinutes, shareBurst: groups.shareBurst })
		.from(groups)
		.where(eq(groups.id, groupId))
		.all();
	if (!group) return false;

	recalculateScheduledTimes(reordered, group.shareCooldownMinutes, group.shareBurst);
	return true;
}

/**
 * Recalculate positions and scheduled_at for a reordered list of queue entries.
 */
function recalculateScheduledTimes(
	entries: { id: string; scheduledAt: Date }[],
	cooldownMinutes: number,
	burst = 1
) {
	const cooldownMs = cooldownMinutes * 60 * 1000;
	const now = new Date();
	const safeBurst = Math.max(1, burst);

	for (let i = 0; i < entries.length; i++) {
		const isNewWindow = i % safeBurst === 0;
		let scheduledAt: Date;

		if (i === 0) {
			scheduledAt = new Date(now.getTime() + cooldownMs);
		} else if (isNewWindow) {
			const baseTime = entries[i - 1].scheduledAt;
			scheduledAt = new Date(Math.max(baseTime.getTime(), now.getTime()) + cooldownMs);
		} else {
			// Same burst window — share the previous entry's time
			scheduledAt = entries[i - 1].scheduledAt;
		}

		entries[i].scheduledAt = scheduledAt;

		db.update(clipQueue)
			.set({ position: i, scheduledAt })
			.where(eq(clipQueue.id, entries[i].id))
			.run();
	}
}

/**
 * Clear the entire queue for a user. Deletes all queued clips.
 */
export function clearQueue(userId: string, groupId: string): number {
	const entries = db
		.select({ clipId: clipQueue.clipId })
		.from(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.all();

	if (entries.length === 0) return 0;

	db.delete(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.run();

	for (const entry of entries) {
		db.update(clips).set({ status: 'deleted' }).where(eq(clips.id, entry.clipId)).run();
	}

	log.info({ userId, groupId, count: entries.length }, 'queue cleared');
	return entries.length;
}

/**
 * Flush all queued clips for a group (publish immediately).
 * Used when switching away from queue pacing mode.
 */
export async function flushQueue(groupId: string): Promise<number> {
	const entries = db
		.select({
			id: clipQueue.id,
			clipId: clipQueue.clipId
		})
		.from(clipQueue)
		.innerJoin(clips, eq(clipQueue.clipId, clips.id))
		.where(and(eq(clipQueue.groupId, groupId), eq(clips.status, 'queued')))
		.all();

	if (entries.length === 0) {
		// Still clean up any queue entries for non-queued clips
		db.delete(clipQueue).where(eq(clipQueue.groupId, groupId)).run();
		return 0;
	}

	const now = new Date();
	const clipIds: string[] = [];

	for (const entry of entries) {
		db.update(clips)
			.set({ status: 'ready', createdAt: now })
			.where(eq(clips.id, entry.clipId))
			.run();
		clipIds.push(entry.clipId);
	}

	db.delete(clipQueue).where(eq(clipQueue.groupId, groupId)).run();

	// Single batched notification for all flushed clips
	await notifyNewClipsBatch(clipIds).catch((err) =>
		log.error({ err, groupId }, 'batch notification failed during flush')
	);

	log.info({ groupId, published: entries.length }, 'queue flushed');
	return entries.length;
}

/**
 * Get the count of queued clips for a user.
 */
export function getQueueCount(userId: string, groupId: string): number {
	const [result] = db
		.select({ count: sql<number>`count(*)` })
		.from(clipQueue)
		.where(and(eq(clipQueue.userId, userId), eq(clipQueue.groupId, groupId)))
		.all();

	return result?.count ?? 0;
}

/**
 * Get queue entries that are due to be published.
 */
export function getDueQueueEntries() {
	const now = new Date();
	return db
		.select({
			id: clipQueue.id,
			clipId: clipQueue.clipId,
			userId: clipQueue.userId,
			groupId: clipQueue.groupId,
			scheduledAt: clipQueue.scheduledAt
		})
		.from(clipQueue)
		.where(lte(clipQueue.scheduledAt, now))
		.all();
}

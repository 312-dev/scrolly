import { db } from '$lib/server/db';
import {
	users,
	clips,
	watched,
	notificationPreferences,
	notifications
} from '$lib/server/db/schema';
import { eq, and, sql, isNull, gte, lte } from 'drizzle-orm';
import { sendNotification } from '$lib/server/push';
import { runBackup } from '$lib/server/backup';
import { publishMusicClip } from '$lib/server/music/publish';
import { deleteWaveform } from '$lib/server/audio/waveform';
import { getDueQueueEntries, publishQueuedClip } from '$lib/server/queue';
import { notifyNewClipsBatch } from '$lib/server/push';
import { createLogger } from '$lib/server/logger';
import { v4 as uuid } from 'uuid';

const log = createLogger('scheduler');

let lastBackupDate: string | null = null;
let lastReminderDate: string | null = null;

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const TRIM_CHECK_INTERVAL = 10 * 1000; // 10 seconds
const QUEUE_CHECK_INTERVAL = 30 * 1000; // 30 seconds
const REMINDER_HOUR = 9; // 9 AM server time
const BACKUP_HOUR = 2; // 2 AM server time
const REMINDER_BODIES = [
	'Your group has been sharing — catch up!',
	'New stuff from your crew awaits.',
	'See what your friends have been posting.',
	"You're falling behind — time to scroll.",
	'Fresh clips in the feed. Take a look!'
];

export function startScheduler(): void {
	checkAndSendReminders();
	checkAndRunBackup();
	checkAndAutoPublish();
	checkAndPublishQueued();
	setInterval(checkAndSendReminders, CHECK_INTERVAL);
	setInterval(checkAndRunBackup, CHECK_INTERVAL);
	setInterval(checkAndAutoPublish, TRIM_CHECK_INTERVAL);
	setInterval(checkAndPublishQueued, QUEUE_CHECK_INTERVAL);
	log.info('scheduler started');
}

async function checkAndSendReminders(): Promise<void> {
	const now = new Date();
	const today = now.toISOString().split('T')[0];

	// In-memory guard: only attempt once per calendar day
	if (lastReminderDate === today) return;

	// Only send during the reminder hour window (e.g., 9:00–9:59)
	if (now.getHours() < REMINDER_HOUR || now.getHours() >= REMINDER_HOUR + 1) return;

	lastReminderDate = today;

	try {
		await sendDailyReminders();
	} catch (err) {
		log.error({ err }, 'daily reminder failed');
		lastReminderDate = null; // Retry next hour if within window
	}
}

async function checkAndRunBackup(): Promise<void> {
	const now = new Date();
	const today = now.toISOString().split('T')[0];

	if (lastBackupDate === today || now.getHours() < BACKUP_HOUR) return;

	lastBackupDate = today;

	try {
		await runBackup();
	} catch (err) {
		log.error({ err }, 'scheduled backup failed');
		lastBackupDate = null; // Retry next hour
	}
}

async function sendDailyReminders(): Promise<void> {
	// Batch-fetch users who have daily reminders enabled and are not removed,
	// joining users with their notification preferences in a single query
	const eligibleUsers = await db
		.select({
			id: users.id,
			groupId: users.groupId
		})
		.from(users)
		.innerJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
		.where(and(isNull(users.removedAt), eq(notificationPreferences.dailyReminder, true)));

	if (eligibleUsers.length === 0) return;

	// Check which users already received a daily_reminder notification today
	// to avoid duplicates after server restarts
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	const alreadySent = await db
		.select({ userId: notifications.userId })
		.from(notifications)
		.where(and(eq(notifications.type, 'daily_reminder'), gte(notifications.createdAt, todayStart)));
	const alreadySentSet = new Set(alreadySent.map((n) => n.userId));

	const usersToNotify = eligibleUsers.filter((u) => !alreadySentSet.has(u.id));
	if (usersToNotify.length === 0) return;

	let sent = 0;

	for (const user of usersToNotify) {
		try {
			// Count unwatched ready clips and grab one clip ID for the notification record
			const [result] = await db
				.select({
					count: sql<number>`count(*)`,
					clipId: sql<string>`min(${clips.id})`
				})
				.from(clips)
				.where(
					and(
						eq(clips.groupId, user.groupId),
						eq(clips.status, 'ready'),
						sql`NOT EXISTS (SELECT 1 FROM ${watched} WHERE ${watched.clipId} = ${clips.id} AND ${watched.userId} = ${user.id})`
					)
				);

			const unwatchedCount = result.count;
			if (unwatchedCount === 0 || !result.clipId) continue;

			await sendNotification(user.id, {
				title: `${unwatchedCount} unwatched ${unwatchedCount === 1 ? 'clip' : 'clips'}`,
				body: REMINDER_BODIES[Math.floor(Math.random() * REMINDER_BODIES.length)],
				url: '/',
				tag: 'daily-reminder'
			});

			// Record the notification so deduplication works across restarts
			await db.insert(notifications).values({
				id: uuid(),
				userId: user.id,
				type: 'daily_reminder',
				clipId: result.clipId,
				actorId: user.id,
				createdAt: new Date()
			});

			sent++;
		} catch (err) {
			log.error({ err, userId: user.id }, 'reminder failed for user');
		}
	}

	if (sent > 0) {
		log.info({ sent }, `sent daily reminders to ${sent} user(s)`);
	}
}

async function checkAndPublishQueued(): Promise<void> {
	try {
		const dueEntries = getDueQueueEntries();
		if (dueEntries.length === 0) return;

		// Group entries by (groupId, scheduledAt) so burst-grouped clips batch into one notification
		const batches = new Map<string, typeof dueEntries>();
		for (const entry of dueEntries) {
			const key = `${entry.groupId}:${entry.scheduledAt.getTime()}`;
			const batch = batches.get(key) ?? [];
			batch.push(entry);
			batches.set(key, batch);
		}

		for (const batch of batches.values()) {
			const skipNotify = batch.length > 1;
			const publishedClipIds: string[] = [];

			for (const entry of batch) {
				try {
					const clipId = await publishQueuedClip(entry.id, skipNotify);
					if (clipId) publishedClipIds.push(clipId);
				} catch (err) {
					log.error({ err, clipId: entry.clipId }, 'queue publish failed');
				}
			}

			// Send a single batched notification for the group
			if (skipNotify && publishedClipIds.length > 0) {
				await notifyNewClipsBatch(publishedClipIds).catch((err) =>
					log.error({ err }, 'batch notification failed for queued clips')
				);
			}
		}
	} catch (err) {
		log.error({ err }, 'queue check failed');
	}
}

async function checkAndAutoPublish(): Promise<void> {
	try {
		const now = new Date();
		const pendingClips = db
			.select({ id: clips.id })
			.from(clips)
			.where(and(eq(clips.status, 'pending_trim'), lte(clips.trimDeadline, now)))
			.all();

		for (const clip of pendingClips) {
			try {
				const published = await publishMusicClip(clip.id);
				if (published) {
					log.info({ clipId: clip.id }, 'auto-published expired trim');
					await deleteWaveform(clip.id);
				}
			} catch (err) {
				log.error({ err, clipId: clip.id }, 'auto-publish failed');
			}
		}
	} catch (err) {
		log.error({ err }, 'trim check failed');
	}
}

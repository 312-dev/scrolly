import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { clips } from '$lib/server/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * Calculate the start of "today" in the user's timezone as a UTC Date.
 * Falls back to UTC midnight if no timezone is provided or invalid.
 */
export function getTodayStart(tz?: string | null): Date {
	const now = new Date();
	if (tz) {
		try {
			// Format current time in user's timezone to extract local date parts
			const formatter = new Intl.DateTimeFormat('en-CA', {
				timeZone: tz,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			const parts = formatter.formatToParts(now);
			const year = parts.find((p) => p.type === 'year')!.value;
			const month = parts.find((p) => p.type === 'month')!.value;
			const day = parts.find((p) => p.type === 'day')!.value;

			// Build midnight in that timezone, then get the UTC equivalent
			// Create a date string and use the timezone to find the offset
			const midnightLocal = new Date(`${year}-${month}-${day}T00:00:00`);
			const utcRef = new Date(midnightLocal.toLocaleString('en-US', { timeZone: 'UTC' }));
			const tzRef = new Date(midnightLocal.toLocaleString('en-US', { timeZone: tz }));
			const offsetMs = utcRef.getTime() - tzRef.getTime();

			return new Date(midnightLocal.getTime() + offsetMs);
		} catch {
			// Invalid timezone — fall through to UTC
		}
	}
	// Fallback: UTC midnight
	const utcMidnight = new Date(now);
	utcMidnight.setUTCHours(0, 0, 0, 0);
	return utcMidnight;
}

/**
 * Check if a user has hit the daily share limit.
 * Returns { allowed, shareCountToday, dailyShareLimit }.
 */
export function checkDailyShareLimit(
	userId: string,
	groupId: string,
	dailyShareLimit: number | null,
	tz?: string | null
): { allowed: boolean; shareCountToday: number; dailyShareLimit: number | null } {
	if (dailyShareLimit === null) {
		return { allowed: true, shareCountToday: 0, dailyShareLimit: null };
	}

	const todayStart = getTodayStart(tz);

	const [result] = db
		.select({ count: sql<number>`count(*)` })
		.from(clips)
		.where(
			and(eq(clips.addedBy, userId), eq(clips.groupId, groupId), gte(clips.createdAt, todayStart))
		)
		.all();

	const shareCountToday = result?.count ?? 0;
	return {
		allowed: shareCountToday < dailyShareLimit,
		shareCountToday,
		dailyShareLimit
	};
}

export type ShareLimitResult = ReturnType<typeof checkDailyShareLimit>;

/**
 * Human-readable time until midnight reset in the user's timezone.
 */
export function formatResetTime(tz?: string | null): string {
	const todayStart = getTodayStart(tz);
	const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
	const ms = Math.max(0, tomorrowStart.getTime() - Date.now());
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
	if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
	return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/**
 * If the daily share limit has been reached, return a 429 JSON response.
 * Otherwise return null (caller should proceed).
 * Also returns the limitCheck data for use in success responses.
 */
export function enforceDailyShareLimit(
	userId: string,
	groupId: string,
	dailyShareLimit: number | null,
	tz?: string | null
): { response: Response | null; limitCheck: ShareLimitResult } {
	const limitCheck = checkDailyShareLimit(userId, groupId, dailyShareLimit, tz);
	if (limitCheck.allowed) return { response: null, limitCheck };

	const resetsIn = formatResetTime(tz);
	return {
		response: json(
			{
				error: `Daily share limit reached (${limitCheck.shareCountToday}/${limitCheck.dailyShareLimit}). Resets in ${resetsIn}.`,
				shareCountToday: limitCheck.shareCountToday,
				dailyShareLimit: limitCheck.dailyShareLimit,
				resetsIn,
				limitReached: true
			},
			{ status: 429 }
		),
		limitCheck
	};
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groups } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withHost, parseBody, isResponse, badRequest } from '$lib/server/api-utils';
import { flushQueue } from '$lib/server/queue';

const VALID_MODES = ['off', 'daily_cap', 'queue'] as const;
const VALID_COOLDOWNS = [30, 60, 120, 240, 360] as const;

interface PacingBody {
	sharePacingMode?: string;
	shareBurst?: number;
	shareCooldownMinutes?: number;
	dailyShareLimit?: number | null;
}

function validatePacingBody(body: PacingBody): string | null {
	const { sharePacingMode, shareBurst, shareCooldownMinutes, dailyShareLimit } = body;
	if (
		sharePacingMode !== undefined &&
		!(VALID_MODES as readonly string[]).includes(sharePacingMode)
	) {
		return 'Invalid pacing mode. Must be off, daily_cap, or queue.';
	}
	if (
		shareBurst !== undefined &&
		(!Number.isInteger(shareBurst) || shareBurst < 1 || shareBurst > 10)
	) {
		return 'Burst must be an integer between 1 and 10.';
	}
	if (
		shareCooldownMinutes !== undefined &&
		!(VALID_COOLDOWNS as readonly number[]).includes(shareCooldownMinutes)
	) {
		return 'Cooldown must be 30, 60, 120, 240, or 360 minutes.';
	}
	if (
		dailyShareLimit !== undefined &&
		dailyShareLimit !== null &&
		(!Number.isInteger(dailyShareLimit) || dailyShareLimit < 1)
	) {
		return 'Daily share limit must be a positive integer or null.';
	}
	return null;
}

export const PATCH: RequestHandler = withHost(async ({ request }, { group }) => {
	const body = await parseBody<PacingBody>(request);
	if (isResponse(body)) return body;

	const error = validatePacingBody(body);
	if (error) return badRequest(error);

	const { sharePacingMode, shareBurst, shareCooldownMinutes, dailyShareLimit } = body;

	const updates: Record<string, unknown> = {};
	if (sharePacingMode !== undefined) updates.sharePacingMode = sharePacingMode;
	if (shareBurst !== undefined) updates.shareBurst = shareBurst;
	if (shareCooldownMinutes !== undefined) updates.shareCooldownMinutes = shareCooldownMinutes;
	if (dailyShareLimit !== undefined) updates.dailyShareLimit = dailyShareLimit ?? null;

	if (Object.keys(updates).length === 0) return badRequest('No fields to update.');

	// If switching away from queue mode, flush all queued clips
	if (group.sharePacingMode === 'queue' && (sharePacingMode ?? 'queue') !== 'queue') {
		await flushQueue(group.id);
	}

	db.update(groups).set(updates).where(eq(groups.id, group.id)).run();

	return json({
		sharePacingMode: (updates.sharePacingMode as string) ?? group.sharePacingMode,
		shareBurst: (updates.shareBurst as number) ?? group.shareBurst,
		shareCooldownMinutes: (updates.shareCooldownMinutes as number) ?? group.shareCooldownMinutes,
		dailyShareLimit:
			dailyShareLimit !== undefined ? (dailyShareLimit ?? null) : group.dailyShareLimit
	});
});

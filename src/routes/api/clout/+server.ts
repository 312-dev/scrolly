import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { getCloutScore, getNextTier, TIERS } from '$lib/server/clout';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { dev } from '$app/environment';

const MODAL_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export const GET: RequestHandler = withAuth(async (event, { user, group }) => {
	if (group.sharePacingMode !== 'queue' || !group.cloutEnabled) {
		return json({ enabled: false });
	}

	const result = getCloutScore(user.id, user.groupId, group.shareCooldownMinutes);

	// DEV ONLY: ?tier=rising to force a specific tier for testing
	if (dev) {
		const forceTier = event.url.searchParams.get('tier');
		if (forceTier && forceTier in TIERS) {
			const config = TIERS[forceTier as keyof typeof TIERS];
			result.tier = forceTier as keyof typeof TIERS;
			result.tierConfig = config;
			result.cooldownMinutes = Math.round(group.shareCooldownMinutes * config.cooldownMultiplier);
			result.burstSize = config.burst;
			result.queueLimit = config.queueLimit;
		}
	}

	const nextTier = getNextTier(result.tier);

	// Low-scoring clips (score 0) that drag the average down
	const underperforming = result.breakdown
		.filter((b) => b.score === 0)
		.map((b) => ({
			clipId: b.clipId,
			title: b.title,
			platform: b.platform,
			originalUrl: b.originalUrl,
			thumbnailPath: b.thumbnailPath
		}));

	// Determine if a tier change modal should be shown.
	// cloutTier tracks the last tier the user was NOTIFIED about (updated on POST ack).
	// This means if a change is suppressed by cooldown, it's preserved until the
	// cooldown expires — then the modal shows the accumulated change.
	const lastAckedTier = user.cloutTier;
	const lastShownAt = user.cloutChangeShownAt;
	let tierChanged = false;

	if (!lastAckedTier) {
		// First time — seed the tier silently (no modal on first load)
		db.update(users).set({ cloutTier: result.tier }).where(eq(users.id, user.id)).run();
	} else if (lastAckedTier !== result.tier) {
		const cooldownElapsed = !lastShownAt || Date.now() - lastShownAt.getTime() >= MODAL_COOLDOWN_MS;
		tierChanged = cooldownElapsed;
		// Don't update cloutTier here — only on POST ack, so the change persists
		// until the user actually sees the modal
	}

	return json({
		enabled: true,
		score: result.score,
		tier: result.tier,
		tierName: result.tierConfig.name,
		cooldownMinutes: result.cooldownMinutes,
		burstSize: result.burstSize,
		queueLimit: result.queueLimit,
		icon: result.tierConfig.icon,
		breakdown: result.breakdown.map((b) => ({ clipId: b.clipId, score: b.score })),
		nextTier: nextTier
			? {
					tier: nextTier.key,
					tierName: nextTier.config.name,
					minScore: nextTier.config.minScore,
					cooldownMultiplier: nextTier.config.cooldownMultiplier,
					burst: nextTier.config.burst,
					queueLimit: nextTier.config.queueLimit,
					icon: nextTier.config.icon
				}
			: null,
		underperforming,
		lastTier: lastAckedTier ?? null,
		tierChanged
	});
});

/** Acknowledge that the tier change modal was shown. Updates both the
 *  last-shown timestamp (cooldown) and the acked tier so future checks
 *  compare against the tier the user was actually notified about. */
export const POST: RequestHandler = withAuth(async (_event, { user, group }) => {
	// Recompute current tier so we store the accurate value
	const result = getCloutScore(user.id, user.groupId, group.shareCooldownMinutes);
	db.update(users)
		.set({ cloutTier: result.tier, cloutChangeShownAt: new Date() })
		.where(eq(users.id, user.id))
		.run();
	return json({ ok: true });
});

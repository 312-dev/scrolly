import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { getCloutScore, getNextTier, TIERS } from '$lib/server/clout';
import type { TierKey } from '$lib/server/clout';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { dev } from '$app/environment';

export const GET: RequestHandler = withAuth(async (event, { user, group }) => {
	if (group.sharePacingMode !== 'queue' || !group.cloutEnabled) {
		return json({ enabled: false });
	}

	const result = getCloutScore(
		user.id,
		user.groupId,
		group.shareCooldownMinutes,
		(user.cloutTier as TierKey) ?? null,
		user.cloutTierChangedAt ?? null
	);

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

	// Determine if a tier change should be reported
	const lastAckedTier = user.cloutTier;
	let tierChanged = false;

	if (!lastAckedTier) {
		// First time — seed the tier silently (no notification on first load)
		db.update(users)
			.set({ cloutTier: result.tier, cloutTierChangedAt: new Date() })
			.where(eq(users.id, user.id))
			.run();
	} else if (result.tierActuallyChanged) {
		tierChanged = true;
		// Persist the new effective tier and reset the changed-at timestamp
		db.update(users)
			.set({ cloutTier: result.tier, cloutTierChangedAt: new Date() })
			.where(eq(users.id, user.id))
			.run();
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
		baseCooldownMinutes: group.shareCooldownMinutes,
		lastTier: lastAckedTier ?? null,
		tierChanged
	});
});

/** Acknowledge that the tier change was seen. Updates the acked tier so
 *  future checks compare against the tier the user was notified about. */
export const POST: RequestHandler = withAuth(async (_event, { user, group }) => {
	// Recompute current tier so we store the accurate value
	const result = getCloutScore(
		user.id,
		user.groupId,
		group.shareCooldownMinutes,
		(user.cloutTier as TierKey) ?? null,
		user.cloutTierChangedAt ?? null
	);
	db.update(users)
		.set({
			cloutTier: result.tier,
			cloutChangeShownAt: new Date(),
			cloutTierChangedAt: new Date()
		})
		.where(eq(users.id, user.id))
		.run();
	return json({ ok: true });
});

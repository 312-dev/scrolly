import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { getCloutScore, getNextTier } from '$lib/server/clout';

export const GET: RequestHandler = withAuth(async (_event, { user, group }) => {
	if (group.sharePacingMode !== 'queue') {
		return json({ enabled: false });
	}

	const result = getCloutScore(user.id, user.groupId, group.shareCooldownMinutes);
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
		underperforming
	});
});

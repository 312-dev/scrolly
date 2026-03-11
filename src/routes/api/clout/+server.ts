import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withAuth } from '$lib/server/api-utils';
import { getCloutScore } from '$lib/server/clout';

export const GET: RequestHandler = withAuth(async (_event, { user, group }) => {
	if (group.sharePacingMode !== 'queue') {
		return json({ enabled: false });
	}

	const result = getCloutScore(user.id, user.groupId, group.shareCooldownMinutes);

	return json({
		enabled: true,
		score: result.score,
		tier: result.tier,
		tierName: result.tierConfig.name,
		cooldownMinutes: result.cooldownMinutes,
		burstSize: result.burstSize,
		queueLimit: result.queueLimit,
		icon: result.tierConfig.icon,
		breakdown: result.breakdown
	});
});

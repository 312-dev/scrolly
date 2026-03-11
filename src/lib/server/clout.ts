import { db } from '$lib/server/db';
import { clips, reactions, favorites, comments } from '$lib/server/db/schema';
import { eq, and, ne, sql, desc, lte } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('clout');

const MATURITY_HOURS = 48;
const WINDOW_SIZE = 10;

export const TIERS = {
	iconic: {
		name: 'Iconic',
		minScore: 1.0,
		cooldownMultiplier: 0.5,
		burst: 5,
		queueLimit: null, // uncapped
		icon: '/icons/clout/iconic.png'
	},
	viral: {
		name: 'Viral',
		minScore: 0.7,
		cooldownMultiplier: 1.0,
		burst: 3,
		queueLimit: null,
		icon: '/icons/clout/viral.png'
	},
	rising: {
		name: 'Rising',
		minScore: 0.4,
		cooldownMultiplier: 2.0,
		burst: 2,
		queueLimit: 10,
		icon: '/icons/clout/rising.png'
	},
	fresh: {
		name: 'Fresh',
		minScore: 0,
		cooldownMultiplier: 3.0,
		burst: 1,
		queueLimit: 6,
		icon: '/icons/clout/fresh.png'
	}
} as const;

export type TierKey = keyof typeof TIERS;

export interface TierConfig {
	name: string;
	minScore: number;
	cooldownMultiplier: number;
	burst: number;
	queueLimit: number | null;
	icon: string;
}

export interface ClipBreakdown {
	clipId: string;
	score: number;
}

export interface CloutResult {
	score: number;
	tier: TierKey;
	tierConfig: TierConfig;
	breakdown: ClipBreakdown[];
	cooldownMinutes: number;
	burstSize: number;
	queueLimit: number | null;
}

/**
 * Get the clout tier for a given score.
 */
export function getCloutTier(score: number): { key: TierKey; config: TierConfig } {
	if (score >= TIERS.iconic.minScore) return { key: 'iconic', config: TIERS.iconic };
	if (score >= TIERS.viral.minScore) return { key: 'viral', config: TIERS.viral };
	if (score >= TIERS.rising.minScore) return { key: 'rising', config: TIERS.rising };
	return { key: 'fresh', config: TIERS.fresh };
}

/**
 * Compute clout score for a user in a group.
 *
 * Scoring per clip (0 / 1 / 2):
 *   0 = no reactions or favorites from others
 *   1 = at least 1 reaction or favorite, but no comments from others
 *   2 = at least 1 reaction/fav AND at least 1 comment from others
 *
 * Returns the rolling average of the last 10 matured clips (48h+ old).
 * Users with <10 matured clips default to Rising tier.
 */
export function getCloutScore(
	userId: string,
	groupId: string,
	baseCooldownMinutes: number
): CloutResult {
	const maturityCutoff = new Date(Date.now() - MATURITY_HOURS * 60 * 60 * 1000);

	// Get the user's last WINDOW_SIZE matured clips
	const maturedClips = db
		.select({ id: clips.id })
		.from(clips)
		.where(
			and(
				eq(clips.addedBy, userId),
				eq(clips.groupId, groupId),
				eq(clips.status, 'ready'),
				lte(clips.createdAt, maturityCutoff)
			)
		)
		.orderBy(desc(clips.createdAt))
		.limit(WINDOW_SIZE)
		.all();

	// Not enough matured clips — default to Rising
	if (maturedClips.length < WINDOW_SIZE) {
		const { key, config } = getCloutTier(TIERS.rising.minScore);
		const cooldownMinutes = Math.round(baseCooldownMinutes * config.cooldownMultiplier);
		return {
			score: -1, // sentinel: not enough data
			tier: key,
			tierConfig: config,
			breakdown: [],
			cooldownMinutes,
			burstSize: config.burst,
			queueLimit: config.queueLimit
		};
	}

	const clipIds = maturedClips.map((c) => c.id);
	const breakdown: ClipBreakdown[] = [];

	for (const clipId of clipIds) {
		// Count reactions from others
		const [reactionResult] = db
			.select({ count: sql<number>`count(*)` })
			.from(reactions)
			.where(and(eq(reactions.clipId, clipId), ne(reactions.userId, userId)))
			.all();

		// Count favorites from others
		const [favResult] = db
			.select({ count: sql<number>`count(*)` })
			.from(favorites)
			.where(and(eq(favorites.clipId, clipId), ne(favorites.userId, userId)))
			.all();

		// Count comments from others
		const [commentResult] = db
			.select({ count: sql<number>`count(*)` })
			.from(comments)
			.where(and(eq(comments.clipId, clipId), ne(comments.userId, userId)))
			.all();

		const hasReactionOrFav = (reactionResult?.count ?? 0) + (favResult?.count ?? 0) > 0;
		const hasComment = (commentResult?.count ?? 0) > 0;

		let score: number;
		if (hasReactionOrFav && hasComment) {
			score = 2;
		} else if (hasReactionOrFav) {
			score = 1;
		} else {
			score = 0;
		}

		breakdown.push({ clipId, score });
	}

	const totalScore = breakdown.reduce((sum, b) => sum + b.score, 0);
	const averageScore = totalScore / breakdown.length;
	// Round to 1 decimal place
	const score = Math.round(averageScore * 10) / 10;

	const { key, config } = getCloutTier(score);
	const cooldownMinutes = Math.round(baseCooldownMinutes * config.cooldownMultiplier);

	log.info(
		{ userId, score, tier: key, cooldownMinutes, burst: config.burst },
		'clout score computed'
	);

	return {
		score,
		tier: key,
		tierConfig: config,
		breakdown,
		cooldownMinutes,
		burstSize: config.burst,
		queueLimit: config.queueLimit
	};
}

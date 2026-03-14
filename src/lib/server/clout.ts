import { db } from '$lib/server/db';
import { clips, reactions, favorites, comments, watched, users } from '$lib/server/db/schema';
import { eq, and, ne, sql, desc, isNull } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const log = createLogger('clout');

const WINDOW_SIZE = 10;
const GROUP_WATCH_THRESHOLD = 0.75;
const RANK_DOWN_COOLDOWN_MS = 4 * 24 * 60 * 60 * 1000;

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
	title: string | null;
	platform: string;
	originalUrl: string;
	thumbnailPath: string | null;
}

export interface CloutResult {
	score: number;
	tier: TierKey;
	tierConfig: TierConfig;
	breakdown: ClipBreakdown[];
	cooldownMinutes: number;
	burstSize: number;
	queueLimit: number | null;
	tierActuallyChanged: boolean;
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

const TIER_ORDER: TierKey[] = ['fresh', 'rising', 'viral', 'iconic'];

/**
 * Get the next tier above the given one, or null if already at top.
 */
export function getNextTier(currentTier: TierKey): { key: TierKey; config: TierConfig } | null {
	const idx = TIER_ORDER.indexOf(currentTier);
	if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
	const nextKey = TIER_ORDER[idx + 1];
	return { key: nextKey, config: TIERS[nextKey] };
}

/**
 * Determine the effective tier after applying rank-down protection.
 * Rank-ups apply immediately. Rank-downs only apply if the user has held
 * their current tier for at least 4 days.
 */
export function getEffectiveTier(
	computedTier: TierKey,
	storedTier: TierKey | null,
	tierChangedAt: Date | null
): { effectiveTier: TierKey; tierActuallyChanged: boolean } {
	if (!storedTier) {
		return { effectiveTier: computedTier, tierActuallyChanged: false };
	}

	const computedIdx = TIER_ORDER.indexOf(computedTier);
	const storedIdx = TIER_ORDER.indexOf(storedTier);

	if (computedIdx >= storedIdx) {
		// Rank up (or same) — apply immediately
		return {
			effectiveTier: computedTier,
			tierActuallyChanged: computedTier !== storedTier
		};
	}

	// Rank down — check 4-day stability requirement
	const now = Date.now();
	const changedAt = tierChangedAt?.getTime() ?? 0;

	if (now - changedAt >= RANK_DOWN_COOLDOWN_MS) {
		return { effectiveTier: computedTier, tierActuallyChanged: true };
	}

	// Still within cooldown — keep the higher tier
	return { effectiveTier: storedTier, tierActuallyChanged: false };
}

/**
 * Compute clout score for a user in a group.
 *
 * Scoring per clip (0 / 1 / 2):
 *   0 = no reactions or favorites from others
 *   1 = at least 1 reaction or favorite, but no comments from others
 *   2 = at least 1 reaction/fav AND at least 1 comment from others
 *
 * Only clips watched by ≥75% of other group members are eligible.
 * Returns the rolling average of the last 10 eligible clips.
 * Users with <10 eligible clips default to Rising tier.
 *
 * Rank-down protection: rank-ups apply immediately, but rank-downs only
 * take effect if the user has held their current tier for ≥4 days.
 */
export function getCloutScore(
	userId: string,
	groupId: string,
	baseCooldownMinutes: number,
	storedTier: TierKey | null = null,
	tierChangedAt: Date | null = null
): CloutResult {
	// Count active group members (not removed)
	const [{ count: memberCount }] = db
		.select({ count: sql<number>`count(*)` })
		.from(users)
		.where(and(eq(users.groupId, groupId), isNull(users.removedAt)))
		.all();

	// Get recent ready clips — fetch more than WINDOW_SIZE since some may be filtered out
	const candidateClips = db
		.select({
			id: clips.id,
			title: clips.title,
			platform: clips.platform,
			originalUrl: clips.originalUrl,
			thumbnailPath: clips.thumbnailPath
		})
		.from(clips)
		.where(and(eq(clips.addedBy, userId), eq(clips.groupId, groupId), eq(clips.status, 'ready')))
		.orderBy(desc(clips.createdAt))
		.limit(WINDOW_SIZE * 3) // fetch extra to account for watch threshold filtering
		.all();

	// Filter to clips watched by ≥75% of other group members
	const otherMembers = memberCount - 1;
	const eligibleClips =
		otherMembers > 0
			? candidateClips.filter((clip) => {
					const [{ count: watchCount }] = db
						.select({ count: sql<number>`count(*)` })
						.from(watched)
						.where(and(eq(watched.clipId, clip.id), ne(watched.userId, userId)))
						.all();
					return watchCount / otherMembers >= GROUP_WATCH_THRESHOLD;
				})
			: candidateClips;

	// Take only the most recent WINDOW_SIZE eligible clips
	const windowClips = eligibleClips.slice(0, WINDOW_SIZE);

	// Not enough eligible clips — default to Rising
	if (windowClips.length < WINDOW_SIZE) {
		const { key, config } = getCloutTier(TIERS.rising.minScore);
		const cooldownMinutes = Math.round(baseCooldownMinutes * config.cooldownMultiplier);
		return {
			score: -1, // sentinel: not enough data
			tier: key,
			tierConfig: config,
			breakdown: [],
			cooldownMinutes,
			burstSize: config.burst,
			queueLimit: config.queueLimit,
			tierActuallyChanged: false
		};
	}

	const breakdown: ClipBreakdown[] = [];

	for (const clip of windowClips) {
		const clipId = clip.id;
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

		breakdown.push({
			clipId,
			score,
			title: clip.title,
			platform: clip.platform,
			originalUrl: clip.originalUrl,
			thumbnailPath: clip.thumbnailPath
		});
	}

	const totalScore = breakdown.reduce((sum, b) => sum + b.score, 0);
	const averageScore = totalScore / breakdown.length;
	// Round to 1 decimal place
	const score = Math.round(averageScore * 10) / 10;

	const { key: computedTier } = getCloutTier(score);

	// Apply rank-down protection
	const { effectiveTier, tierActuallyChanged } = getEffectiveTier(
		computedTier,
		storedTier,
		tierChangedAt
	);
	const effectiveConfig = TIERS[effectiveTier];
	const cooldownMinutes = Math.round(baseCooldownMinutes * effectiveConfig.cooldownMultiplier);

	log.info(
		{
			userId,
			score,
			computedTier,
			effectiveTier,
			cooldownMinutes,
			burst: effectiveConfig.burst,
			tierActuallyChanged
		},
		'clout score computed'
	);

	return {
		score,
		tier: effectiveTier,
		tierConfig: effectiveConfig,
		breakdown,
		cooldownMinutes,
		burstSize: effectiveConfig.burst,
		queueLimit: effectiveConfig.queueLimit,
		tierActuallyChanged
	};
}

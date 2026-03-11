<script lang="ts">
	import { basename } from '$lib/utils';
	import PlatformIcon from './PlatformIcon.svelte';

	const TIER_INFO: Record<string, { label: string; icon: string }> = {
		fresh: { label: 'Fresh', icon: '/icons/clout/fresh.png' },
		rising: { label: 'Rising', icon: '/icons/clout/rising.png' },
		viral: { label: 'Viral', icon: '/icons/clout/viral.png' },
		iconic: { label: 'Iconic', icon: '/icons/clout/iconic.png' }
	};

	const TIER_ORDER = ['fresh', 'rising', 'viral', 'iconic'];

	interface Underperformer {
		clipId: string;
		title: string | null;
		platform: string;
		originalUrl: string;
		thumbnailPath: string | null;
	}

	interface NextTierInfo {
		tier: string;
		tierName: string;
		minScore: number;
		burst: number;
		queueLimit: number | null;
		icon: string;
	}

	let {
		currentTier,
		nextTier,
		underperforming,
		breakdown,
		ondismiss
	}: {
		currentTier: string;
		nextTier: NextTierInfo | null;
		underperforming: Underperformer[];
		breakdown: { clipId: string; score: number }[];
		ondismiss: () => void;
	} = $props();

	const neededUpgrades = $derived.by(() => {
		if (!nextTier || !breakdown.length) return 0;
		const total = breakdown.reduce((s, b) => s + b.score, 0);
		const count = breakdown.length;
		const targetAvg = nextTier.minScore;
		const needed = Math.ceil(targetAvg * count) - total;
		return Math.max(0, needed);
	});

	function clipTitle(clip: Underperformer): string {
		if (clip.title) return clip.title;
		try {
			return new URL(clip.originalUrl).hostname;
		} catch {
			return clip.originalUrl;
		}
	}
</script>

<div class="tips-view">
	{#if nextTier}
		{@const currentIdx = TIER_ORDER.indexOf(currentTier)}
		{@const nextIdx = TIER_ORDER.indexOf(nextTier.tier)}
		<div class="target-card">
			<div class="target-tiers">
				{#each TIER_ORDER as tier, i (tier)}
					{@const isCurrent = i === currentIdx}
					{@const isNext = i === nextIdx}
					{@const isPast = i < currentIdx}
					<div
						class="tier-step"
						class:current={isCurrent}
						class:next={isNext}
						class:past={isPast}
						class:future={i > nextIdx}
					>
						<img
							src={TIER_INFO[tier]?.icon ?? ''}
							alt={TIER_INFO[tier]?.label ?? ''}
							class="step-icon"
						/>
						<span class="step-label">{TIER_INFO[tier]?.label}</span>
					</div>
					{#if i < TIER_ORDER.length - 1}
						<div
							class="tier-connector"
							class:filled={i < currentIdx}
							class:active={i === currentIdx}
						></div>
					{/if}
				{/each}
			</div>
			{#if neededUpgrades > 0}
				<p class="target-distance">
					{neededUpgrades} clip{neededUpgrades === 1 ? '' : 's'} need better engagement to reach
					<strong>{nextTier.tierName}</strong>
				</p>
			{/if}
		</div>

		<div class="tips-section">
			<span class="section-label">How scoring works</span>
			<div class="score-grid">
				<div class="score-row">
					<span class="score-badge score-0">0</span>
					<span class="score-desc">No reactions or favorites</span>
				</div>
				<div class="score-row">
					<span class="score-badge score-1">1</span>
					<span class="score-desc">Got a reaction or favorite</span>
				</div>
				<div class="score-row">
					<span class="score-badge score-2">2</span>
					<span class="score-desc">Reaction/fave <strong>and</strong> a comment</span>
				</div>
			</div>
		</div>

		<div class="tips-section">
			<span class="section-label">At {nextTier.tierName} you'll get</span>
			<div class="perks-row">
				<div class="perk">
					<span class="perk-value">{nextTier.burst}</span>
					<span class="perk-label">per burst</span>
				</div>
				<div class="perk-divider"></div>
				<div class="perk">
					<span class="perk-value">{nextTier.queueLimit ?? '∞'}</span>
					<span class="perk-label">{nextTier.queueLimit ? 'max queued' : 'queue depth'}</span>
				</div>
			</div>
		</div>
	{:else}
		{@const currentTierInfo = TIER_INFO[currentTier]}
		<div class="at-top-state">
			<div class="at-top-icon-wrap">
				<img
					src={currentTierInfo?.icon ?? ''}
					alt={currentTierInfo?.label ?? ''}
					class="at-top-icon"
				/>
			</div>
			<p class="at-top-title">You're at the top</p>
			<p class="at-top-sub">Maximum speed unlocked. Keep sharing clips the group loves.</p>
		</div>
	{/if}

	{#if underperforming.length > 0}
		<div class="underperforming">
			<span class="section-label">Dragging your score down</span>
			<div class="clip-carousel">
				{#each underperforming.slice(0, 8) as clip (clip.clipId)}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="clip-card" href="/?clip={clip.clipId}" onclick={ondismiss}>
						<div class="clip-thumb">
							{#if clip.thumbnailPath}
								<img src="/api/thumbnails/{basename(clip.thumbnailPath)}" alt="" />
							{:else}
								<div class="thumb-placeholder">
									<PlatformIcon platform={clip.platform} size={20} />
								</div>
							{/if}
							<div class="thumb-score">0</div>
						</div>
						<span class="clip-caption">{clipTitle(clip)}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.tips-view {
		text-align: left;
	}

	/* Tier progression track */
	.target-card {
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		padding: var(--space-lg) var(--space-md);
		margin-bottom: var(--space-lg);
	}
	.target-tiers {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		margin-bottom: var(--space-sm);
	}
	.tier-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		opacity: 0.3;
		transition: opacity 0.2s ease;
	}
	.tier-step.past {
		opacity: 0.5;
	}
	.tier-step.current {
		opacity: 1;
	}
	.tier-step.next {
		opacity: 0.8;
	}
	.step-icon {
		width: 36px;
		height: 36px;
		object-fit: contain;
	}
	.tier-step.current .step-icon {
		width: 44px;
		height: 44px;
		filter: drop-shadow(0 0 8px var(--accent-primary));
	}
	.step-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.tier-step.current .step-label {
		color: var(--accent-primary);
		font-weight: 700;
	}
	.tier-step.next .step-label {
		color: var(--text-secondary);
	}

	.tier-connector {
		width: 24px;
		height: 2px;
		background: var(--border);
		margin: 0 var(--space-xs);
		margin-bottom: var(--space-lg);
		border-radius: 1px;
	}
	.tier-connector.filled {
		background: var(--accent-primary);
		opacity: 0.5;
	}
	.tier-connector.active {
		background: linear-gradient(90deg, var(--accent-primary), var(--border));
	}

	.target-distance {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		text-align: center;
		margin: var(--space-sm) 0 0;
		line-height: 1.4;
	}
	.target-distance strong {
		color: var(--text-primary);
	}

	/* Section shared label */
	.section-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		display: block;
		margin-bottom: var(--space-sm);
	}

	/* Scoring breakdown */
	.tips-section {
		margin-bottom: var(--space-lg);
	}
	.score-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.score-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
	}
	.score-badge {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8125rem;
		font-weight: 700;
		flex-shrink: 0;
	}
	.score-0 {
		background: var(--bg-subtle);
		color: var(--text-muted);
	}
	.score-1 {
		background: color-mix(in srgb, var(--accent-blue) 20%, transparent);
		color: var(--accent-blue);
	}
	.score-2 {
		background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
		color: var(--accent-primary);
	}
	.score-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.3;
	}
	.score-desc strong {
		color: var(--text-primary);
	}

	/* Perks row */
	.perks-row {
		display: flex;
		align-items: center;
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
		padding: var(--space-md) var(--space-lg);
	}
	.perk {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.perk-value {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}
	.perk-label {
		font-size: 0.6875rem;
		color: var(--text-muted);
		font-weight: 500;
	}
	.perk-divider {
		width: 1px;
		height: 32px;
		background: var(--border);
	}

	/* At-top state (iconic tier) */
	.at-top-state {
		text-align: center;
		padding: var(--space-lg) 0 var(--space-xl);
	}
	.at-top-icon-wrap {
		margin: 0 auto var(--space-lg);
		width: fit-content;
	}
	.at-top-icon {
		width: 64px;
		height: 64px;
		object-fit: contain;
		filter: drop-shadow(0 0 16px var(--accent-primary));
		animation: float-orbit 4s ease-in-out infinite;
	}
	@keyframes float-orbit {
		0% {
			transform: translate(0, 0);
			filter: drop-shadow(0 0 16px var(--accent-primary));
		}
		25% {
			transform: translate(3px, -5px);
			filter: drop-shadow(0 0 20px var(--accent-primary));
		}
		50% {
			transform: translate(-2px, -3px);
			filter: drop-shadow(0 0 14px var(--accent-primary));
		}
		75% {
			transform: translate(-4px, -6px);
			filter: drop-shadow(0 0 22px var(--accent-primary));
		}
		100% {
			transform: translate(0, 0);
			filter: drop-shadow(0 0 16px var(--accent-primary));
		}
	}
	.at-top-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs);
	}
	.at-top-sub {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin: 0;
		line-height: 1.5;
		max-width: 260px;
		margin-inline: auto;
	}

	/* Underperforming clips */
	.underperforming {
		border-top: 1px solid var(--border);
		padding-top: var(--space-lg);
		margin-left: calc(-1 * var(--space-xl));
		margin-right: calc(-1 * var(--space-xl));
		padding-left: var(--space-xl);
		padding-right: 0;
	}
	.clip-carousel {
		display: flex;
		gap: var(--space-md);
		overflow-x: auto;
		scroll-snap-type: x proximity;
		-webkit-overflow-scrolling: touch;
		padding-bottom: var(--space-sm);
		padding-right: var(--space-xl);
	}
	.clip-carousel::-webkit-scrollbar {
		display: none;
	}
	.clip-card {
		flex-shrink: 0;
		width: 88px;
		scroll-snap-align: start;
		text-decoration: none;
	}
	.clip-thumb {
		width: 100%;
		aspect-ratio: 9 / 14;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--bg-subtle);
		margin-bottom: var(--space-xs);
		position: relative;
	}
	.clip-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
	}
	.thumb-score {
		position: absolute;
		top: var(--space-xs);
		right: var(--space-xs);
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--text-muted);
	}
	.clip-caption {
		font-size: 0.6875rem;
		color: var(--text-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.3;
	}
</style>

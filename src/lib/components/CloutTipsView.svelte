<script lang="ts">
	import UnderperformingClips from './UnderperformingClips.svelte';
	import MinusCircleIcon from 'phosphor-svelte/lib/MinusCircleIcon';
	import ThumbsUpIcon from 'phosphor-svelte/lib/ThumbsUpIcon';
	import FireIcon from 'phosphor-svelte/lib/FireIcon';

	const TIER_INFO: Record<string, { label: string; icon: string }> = {
		fresh: { label: 'Fresh', icon: '/icons/clout/fresh.png' },
		rising: { label: 'Rising', icon: '/icons/clout/rising.png' },
		viral: { label: 'Viral', icon: '/icons/clout/viral.png' },
		iconic: { label: 'Iconic', icon: '/icons/clout/iconic.png' }
	};

	const TIER_ORDER = ['fresh', 'rising', 'viral', 'iconic'];

	const TIER_ABILITIES: Record<
		string,
		{ burst: number; cooldownMultiplier: number; queueLimit: number | null }
	> = {
		fresh: { burst: 1, cooldownMultiplier: 3.0, queueLimit: 6 },
		rising: { burst: 2, cooldownMultiplier: 2.0, queueLimit: 10 },
		viral: { burst: 3, cooldownMultiplier: 1.0, queueLimit: null },
		iconic: { burst: 5, cooldownMultiplier: 0.5, queueLimit: null }
	};

	let selectedTier = $state<string | null>(null);

	// Auto-select current tier on load
	$effect(() => {
		if (selectedTier === null) {
			selectedTier = currentTier;
		}
	});

	function toggleTier(tier: string) {
		selectedTier = selectedTier === tier ? null : tier;
	}

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
		baseCooldownMinutes = 120,
		ondismiss
	}: {
		currentTier: string;
		nextTier: NextTierInfo | null;
		underperforming: Underperformer[];
		breakdown: { clipId: string; score: number }[];
		baseCooldownMinutes?: number;
		ondismiss: () => void;
	} = $props();

	function formatCooldown(minutes: number): string {
		if (minutes < 60) return `${minutes}m`;
		const h = Math.round(minutes / 60);
		return `${h}h`;
	}

	const neededUpgrades = $derived.by(() => {
		if (!nextTier || !breakdown.length) return 0;
		const total = breakdown.reduce((s, b) => s + b.score, 0);
		const count = breakdown.length;
		const targetAvg = nextTier.minScore;
		const needed = Math.ceil(targetAvg * count) - total;
		return Math.max(0, needed);
	});
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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="tier-step"
						class:current={isCurrent}
						class:next={isNext}
						class:past={isPast}
						class:future={i > nextIdx}
						class:selected={selectedTier === tier}
						onclick={() => toggleTier(tier)}
					>
						<div class="step-icon-wrap">
							<img
								src={TIER_INFO[tier]?.icon ?? ''}
								alt={TIER_INFO[tier]?.label ?? ''}
								class="step-icon"
							/>
							{#if isCurrent}
								<span class="you-badge">YOU</span>
							{/if}
						</div>
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
			{#if selectedTier}
				{@const abilities = TIER_ABILITIES[selectedTier]}
				<div class="tier-abilities">
					<div class="ability">
						<span class="ability-value">{abilities.burst}</span>
						<span class="ability-label">per burst</span>
					</div>
					<div class="ability-divider"></div>
					<div class="ability">
						<span class="ability-value"
							>{formatCooldown(
								Math.round(baseCooldownMinutes * abilities.cooldownMultiplier)
							)}</span
						>
						<span class="ability-label">cooldown</span>
					</div>
					<div class="ability-divider"></div>
					<div class="ability">
						<span class="ability-value">{abilities.queueLimit ?? '∞'}</span>
						<span class="ability-label">queue depth</span>
					</div>
				</div>
			{/if}
			{#if neededUpgrades > 0}
				<p class="target-distance">
					{neededUpgrades} clip{neededUpgrades === 1 ? '' : 's'} need better engagement to reach
					<strong>{nextTier.tierName}</strong>
				</p>
			{/if}
		</div>

		<div class="tips-section">
			<span class="section-label">How ranking works</span>
			<div class="score-columns">
				<div class="score-col score-0">
					<span class="score-icon"><MinusCircleIcon size={20} /></span>
					<span class="score-title">Nothing</span>
					<span class="score-sub">No engagement</span>
				</div>
				<div class="score-col score-1">
					<span class="score-icon"><ThumbsUpIcon size={20} weight="fill" /></span>
					<span class="score-title">Reaction</span>
					<span class="score-sub">Or a favorite</span>
				</div>
				<div class="score-col score-2">
					<span class="score-icon"><FireIcon size={20} weight="fill" /></span>
					<span class="score-title">Both</span>
					<span class="score-sub">Reaction + comment</span>
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
		<UnderperformingClips clips={underperforming} {ondismiss} />
	{/if}
</div>

<style>
	.tips-view {
		text-align: left;
	}
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
		margin-bottom: var(--space-sm);
	}
	.tier-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		opacity: 0.3;
		transition: opacity 0.2s ease;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.tier-step.past {
		opacity: 0.5;
	}
	.tier-step.current,
	.tier-step.selected {
		opacity: 1;
	}
	.tier-step.next {
		opacity: 0.8;
	}
	.step-icon-wrap {
		position: relative;
		margin-bottom: var(--space-sm);
	}
	.step-icon {
		width: 36px;
		height: 36px;
		object-fit: contain;
		transition: transform 0.15s ease;
	}
	.you-badge {
		position: absolute;
		bottom: -8px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.4375rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		background: var(--bg-surface);
		padding: 0 3px;
		border-radius: var(--radius-full);
		line-height: 1.5;
	}
	.step-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.tier-step.current .step-label {
		font-weight: 700;
	}
	.tier-step.next .step-label {
		color: var(--text-secondary);
	}
	.tier-step.selected .step-icon {
		transform: scale(1.15);
	}
	.tier-step.selected .step-label {
		color: var(--accent-primary);
		font-weight: 700;
	}
	.tier-abilities {
		display: flex;
		align-items: center;
		background: var(--bg-surface);
		border-radius: var(--radius-sm);
		padding: var(--space-sm) var(--space-md);
		margin-top: var(--space-sm);
		animation: abilities-in 0.15s ease-out;
	}
	@keyframes abilities-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.ability {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}
	.ability-value {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}
	.ability-label {
		font-size: 0.625rem;
		color: var(--text-muted);
		font-weight: 500;
	}
	.ability-divider {
		width: 1px;
		height: 24px;
		background: var(--border);
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
		background: linear-gradient(
			90deg,
			var(--accent-primary) 0%,
			var(--border) 50%,
			var(--accent-primary) 100%
		);
		background-size: 200% 100%;
		animation: connector-shimmer 2s ease-in-out infinite;
	}
	@keyframes connector-shimmer {
		0% {
			background-position: 100% 0;
		}
		100% {
			background-position: -100% 0;
		}
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
	.section-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		display: block;
		margin-bottom: var(--space-sm);
	}
	.tips-section {
		margin-bottom: var(--space-lg);
	}
	.score-columns {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-xs);
	}
	.score-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: var(--space-md) var(--space-xs);
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
		text-align: center;
	}
	.score-icon {
		display: flex;
		margin-bottom: 2px;
	}
	.score-0 .score-icon {
		color: var(--text-muted);
	}
	.score-1 .score-icon {
		color: var(--accent-blue);
	}
	.score-2 .score-icon {
		color: var(--accent-primary);
	}
	.score-title {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.score-sub {
		font-size: 0.625rem;
		color: var(--text-muted);
		line-height: 1.3;
	}
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
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-6px);
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
</style>

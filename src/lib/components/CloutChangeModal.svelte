<script lang="ts">
	import { cloutChange } from '$lib/stores/cloutChange';
	import { anySheetOpen } from '$lib/stores/sheetOpen';
	import { confirmState } from '$lib/stores/confirm';
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

	let visible = $state(false);
	let change = $state<typeof $cloutChange>(null);
	let showTips = $state(false);
	let tipsData = $state<{
		nextTier: NextTierInfo | null;
		underperforming: Underperformer[];
		breakdown: { clipId: string; score: number }[];
	} | null>(null);
	let tipsLoading = $state(false);
	let autoTimer: ReturnType<typeof setTimeout> | undefined;

	// Deferred display: wait until no sheets or confirm dialogs are open
	$effect(() => {
		const pending = $cloutChange;
		const sheetsOpen = $anySheetOpen;
		const confirmOpen = $confirmState.open;

		if (pending && !sheetsOpen && !confirmOpen) {
			change = pending;
			showTips = false;
			tipsData = null;
			requestAnimationFrame(() => {
				visible = true;
			});
			autoTimer = setTimeout(dismiss, 5000);
		}
	});

	function dismiss() {
		if (autoTimer) clearTimeout(autoTimer);
		visible = false;
		setTimeout(() => {
			change = null;
			showTips = false;
			tipsData = null;
			cloutChange.set(null);
		}, 200);
	}

	async function openTips() {
		if (autoTimer) clearTimeout(autoTimer);
		if (tipsData) {
			showTips = true;
			return;
		}
		tipsLoading = true;
		try {
			const res = await fetch('/api/clout');
			if (res.ok) {
				const data = await res.json();
				tipsData = {
					nextTier: data.nextTier,
					underperforming: data.underperforming ?? [],
					breakdown: data.breakdown ?? []
				};
			}
		} catch {
			// silently fail
		}
		tipsLoading = false;
		showTips = true;
	}

	function closeTips() {
		showTips = false;
	}

	const isRankUp = $derived(() => {
		if (!change) return false;
		return TIER_ORDER.indexOf(change.newTier) > TIER_ORDER.indexOf(change.previousTier);
	});

	function formatCooldown(minutes: number): string {
		if (minutes < 60) return `${minutes}min`;
		return `${Math.round(minutes / 60)}h`;
	}

	function clipTitle(clip: Underperformer): string {
		if (clip.title) return clip.title;
		try {
			return new URL(clip.originalUrl).hostname;
		} catch {
			return clip.originalUrl;
		}
	}

	// How many score-0 clips need to become score-1+ to reach next tier
	const neededUpgrades = $derived(() => {
		if (!tipsData?.nextTier || !tipsData.breakdown.length) return 0;
		const total = tipsData.breakdown.reduce((s, b) => s + b.score, 0);
		const count = tipsData.breakdown.length;
		const targetAvg = tipsData.nextTier.minScore;
		const needed = Math.ceil(targetAvg * count) - total;
		return Math.max(0, needed);
	});
</script>

{#if change}
	{@const prev = TIER_INFO[change.previousTier] ?? TIER_INFO.fresh}
	{@const next = TIER_INFO[change.newTier] ?? TIER_INFO.fresh}
	{@const rankUp = isRankUp()}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" class:visible onclick={dismiss}>
		<div class="modal" class:visible class:expanded={showTips} onclick={(e) => e.stopPropagation()}>
			{#if !showTips}
				<div class="tier-transition">
					<div class="tier-icon old">
						<img src={prev.icon} alt={prev.label} width="64" height="64" />
					</div>
					<span class="arrow">&rarr;</span>
					<div class="tier-icon new" class:glow={rankUp}>
						<img src={next.icon} alt={next.label} width="64" height="64" />
					</div>
				</div>

				<h3 class="tier-name">{next.label}</h3>

				<p class="tier-desc">
					{formatCooldown(change.cooldownMinutes)} between clips &middot; {change.burstSize} per burst
				</p>

				{#if !rankUp}
					<button class="tips-btn" onclick={openTips} disabled={tipsLoading}>
						{tipsLoading ? 'Loading...' : 'How to rank up'}
					</button>
				{/if}
			{:else if tipsData}
				<div class="tips-view">
					<button class="back-btn" onclick={closeTips}>&larr; Back</button>

					{#if tipsData.nextTier}
						<div class="next-tier-target">
							<img
								src={TIER_INFO[tipsData.nextTier.tier]?.icon ?? ''}
								alt={tipsData.nextTier.tierName}
								width="32"
								height="32"
							/>
							<span class="next-label">Next: {tipsData.nextTier.tierName}</span>
						</div>

						<ul class="tips-list">
							<li>Share clips your group will react to or comment on</li>
							<li>Clips with reactions <strong>and</strong> comments score highest</li>
							{#if neededUpgrades() > 0}
								<li>
									{neededUpgrades()} more clip{neededUpgrades() === 1 ? '' : 's'} need engagement to reach
									{tipsData.nextTier.tierName}
								</li>
							{/if}
							<li>
								At {tipsData.nextTier.tierName}: {tipsData.nextTier.burst} per burst{tipsData
									.nextTier.queueLimit
									? `, ${tipsData.nextTier.queueLimit} max queued`
									: ', uncapped queue'}
							</li>
						</ul>
					{:else}
						<p class="at-top">You're at the highest tier!</p>
					{/if}

					{#if tipsData.underperforming.length > 0}
						<div class="underperforming">
							<span class="section-label">Clips with no engagement</span>
							<ul class="clip-list">
								{#each tipsData.underperforming.slice(0, 5) as clip (clip.clipId)}
									<li class="clip-row">
										<div class="clip-thumb">
											{#if clip.thumbnailPath}
												<img src="/api/thumbnails/{basename(clip.thumbnailPath)}" alt="" />
											{:else}
												<div class="thumb-placeholder">
													<PlatformIcon platform={clip.platform} size={14} />
												</div>
											{/if}
										</div>
										<span class="clip-title">{clipTitle(clip)}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 350;
		opacity: 0;
		transition: opacity 0.2s ease;
		padding: var(--space-lg);
	}

	.overlay.visible {
		opacity: 1;
	}

	.modal {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-2xl) var(--space-xl);
		max-width: 300px;
		width: 100%;
		text-align: center;
		transform: scale(0.95);
		transition:
			transform 0.2s ease,
			max-width 0.2s ease;
	}

	.modal.visible {
		transform: scale(1);
	}

	.modal.expanded {
		max-width: 340px;
		text-align: left;
	}

	.tier-transition {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-lg);
		margin-bottom: var(--space-lg);
	}

	.tier-icon img {
		width: 64px;
		height: 64px;
		object-fit: contain;
	}

	.tier-icon.old {
		opacity: 0.4;
	}

	.tier-icon.new.glow {
		filter: drop-shadow(0 0 8px var(--accent-primary));
	}

	.arrow {
		font-size: 1.5rem;
		color: var(--text-muted);
	}

	.tier-name {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs);
	}

	.tier-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin: 0 0 var(--space-lg);
		line-height: 1.4;
	}

	.tips-btn {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		color: var(--text-primary);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: var(--space-sm) var(--space-lg);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.tips-btn:active {
		background: var(--bg-subtle);
	}

	.tips-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Tips view */
	.tips-view {
		text-align: left;
	}

	.back-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0;
		margin-bottom: var(--space-md);
		cursor: pointer;
	}

	.back-btn:active {
		opacity: 0.7;
	}

	.next-tier-target {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}

	.next-tier-target img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}

	.next-label {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.tips-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-lg);
	}

	.tips-list li {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.5;
		padding: var(--space-xs) 0;
		padding-left: var(--space-lg);
		position: relative;
	}

	.tips-list li::before {
		content: '\2022';
		position: absolute;
		left: var(--space-xs);
		color: var(--text-muted);
	}

	.at-top {
		font-size: 0.875rem;
		color: var(--text-secondary);
		text-align: center;
		margin: var(--space-lg) 0;
	}

	/* Underperforming clips */
	.underperforming {
		border-top: 1px solid var(--border);
		padding-top: var(--space-md);
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

	.clip-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.clip-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) 0;
	}

	.clip-thumb {
		width: 32px;
		height: 40px;
		border-radius: 4px;
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-subtle);
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

	.clip-title {
		font-size: 0.75rem;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
</style>

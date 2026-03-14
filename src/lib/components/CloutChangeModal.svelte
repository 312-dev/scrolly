<script lang="ts">
	import { cloutChange } from '$lib/stores/cloutChange';
	import { anySheetOpen } from '$lib/stores/sheetOpen';
	import { confirmState } from '$lib/stores/confirm';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CloutTipsView from './CloutTipsView.svelte';

	const TIER_INFO: Record<string, { label: string; icon: string }> = {
		fresh: { label: 'Fresh', icon: '/icons/clout/fresh.png' },
		rising: { label: 'Rising', icon: '/icons/clout/rising.png' },
		viral: { label: 'Viral', icon: '/icons/clout/viral.png' },
		iconic: { label: 'Iconic', icon: '/icons/clout/iconic.png' }
	};

	const TIER_ORDER = ['fresh', 'rising', 'viral', 'iconic'];

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
		breakdown: { clipId: string; score: number }[];
		baseCooldownMinutes: number;
	} | null>(null);
	let tipsLoading = $state(false);

	// Tier cycling animation state
	let cycleIndex = $state(0);
	let cycling = $state(false);
	let cycleTimers: ReturnType<typeof setTimeout>[] = [];

	const displayTier = $derived.by(() => {
		if (!change) return TIER_INFO.fresh;
		if (!cycling) return TIER_INFO[change.newTier] ?? TIER_INFO.fresh;
		const startIdx = TIER_ORDER.indexOf(change.previousTier);
		const tierKey = TIER_ORDER[startIdx + cycleIndex] ?? change.newTier;
		return TIER_INFO[tierKey] ?? TIER_INFO.fresh;
	});

	const animationDone = $derived(!cycling);

	function startCycleAnimation() {
		if (!change) return;
		const startIdx = TIER_ORDER.indexOf(change.previousTier);
		const endIdx = TIER_ORDER.indexOf(change.newTier);
		const steps = Math.abs(endIdx - startIdx);
		if (steps <= 0) return;

		cycling = true;
		cycleIndex = 0;
		cycleTimers = [];

		for (let i = 1; i <= steps; i++) {
			const timer = setTimeout(() => {
				const dir =
					TIER_ORDER.indexOf(change!.newTier) > TIER_ORDER.indexOf(change!.previousTier) ? 1 : -1;
				cycleIndex = dir * i;
				if (i === steps) {
					cycling = false;
				}
			}, i * 400);
			cycleTimers.push(timer);
		}
	}

	function clearCycleTimers() {
		cycleTimers.forEach(clearTimeout);
		cycleTimers = [];
	}

	// Drag-to-dismiss state
	let dragZoneEl: HTMLElement | null = $state(null);
	let dragY = $state(0);
	let dragging = $state(false);
	let dragTracking = false;
	let dragStartY = 0;
	let dragStartX = 0;
	const DRAG_COMMIT = 6;
	const DRAG_DISMISS = 120;

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
				// Start cycling after sheet slides up
				setTimeout(() => startCycleAnimation(), 350);
			});
		}
	});

	function dismiss() {
		visible = false;
		clearCycleTimers();
		cycling = false;
		setTimeout(() => {
			change = null;
			showTips = false;
			tipsData = null;
			cloutChange.set(null);
		}, 300);
	}

	function startDrag(e: PointerEvent) {
		dragTracking = true;
		dragStartY = e.clientY;
		dragStartX = e.clientX;
		dragY = 0;
	}

	function moveDrag(e: PointerEvent) {
		if (!dragTracking) return;
		const dy = e.clientY - dragStartY;
		const dx = e.clientX - dragStartX;

		if (!dragging) {
			if (dy > DRAG_COMMIT && dy > Math.abs(dx)) {
				dragging = true;
				dragZoneEl?.setPointerCapture(e.pointerId);
			} else if (Math.abs(dx) > DRAG_COMMIT || dy < -DRAG_COMMIT) {
				dragTracking = false;
			}
			return;
		}
		dragY = Math.max(0, dy);
	}

	function endDrag() {
		if (!dragTracking) return;
		dragTracking = false;
		if (!dragging) return;
		dragging = false;
		if (dragY > DRAG_DISMISS) {
			dragY = 0;
			dismiss();
		} else {
			dragY = 0;
		}
	}

	async function openTips() {
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
					breakdown: data.breakdown ?? [],
					baseCooldownMinutes: data.baseCooldownMinutes ?? 120
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

	const isSameRank = $derived.by(() => {
		if (!change) return false;
		return change.previousTier === change.newTier;
	});

	const isRankUp = $derived.by(() => {
		if (!change) return false;
		return TIER_ORDER.indexOf(change.newTier) > TIER_ORDER.indexOf(change.previousTier);
	});

	function formatCooldown(minutes: number): string {
		if (minutes < 60) return `${minutes}min`;
		return `${Math.round(minutes / 60)}h`;
	}
</script>

{#if change}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" class:visible onclick={dismiss}></div>

	<div
		class="sheet"
		class:visible
		class:dragging
		style:transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
		onclick={(e) => e.stopPropagation()}
	>
		<div
			class="drag-zone"
			bind:this={dragZoneEl}
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			role="presentation"
		>
			<div class="drag-bar"></div>
			<div class="sheet-header">
				{#if showTips}
					<button class="close-btn" onclick={closeTips} aria-label="Back">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
							<path
								d="M12.5 15L7.5 10L12.5 5"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
					<span class="sheet-title">How to rank up</span>
				{/if}
				<button class="close-btn" onclick={dismiss} aria-label="Close">
					<XIcon size={18} />
				</button>
			</div>
		</div>

		<div class="sheet-body">
			{#if !showTips}
				{@const final = TIER_INFO[change.newTier] ?? TIER_INFO.fresh}
				<div class="tier-display">
					<div class="icon-wrap">
						{#key displayTier.icon}
							<img
								src={displayTier.icon}
								alt={displayTier.label}
								class="tier-icon"
								class:glow={animationDone && isRankUp}
								class:cycling
							/>
						{/key}
					</div>
					<h2 class="tier-name">{final.label}</h2>
					<p class="tier-headline">
						{#if isSameRank}
							Your rank
						{:else if isRankUp}
							You ranked up!
						{:else}
							Your rank changed
						{/if}
					</p>
					<p class="tier-context">
						{#if isSameRank && change.newTier === 'iconic'}
							Your clips hit different. Maximum speed unlocked.
						{:else if isSameRank && change.newTier === 'viral'}
							The group loves your taste. Keep it coming.
						{:else if isSameRank && change.newTier === 'rising'}
							You're building momentum. Keep sharing hits.
						{:else if isSameRank}
							Share clips the group engages with to climb up.
						{:else if change.newTier === 'iconic'}
							Your clips hit different. Maximum speed unlocked.
						{:else if change.newTier === 'viral' && isRankUp}
							The group loves your taste. Keep it coming.
						{:else if change.newTier === 'viral'}
							Still solid — get more comments to climb back.
						{:else if change.newTier === 'rising' && isRankUp}
							You're building momentum. Nice picks.
						{:else if change.newTier === 'rising'}
							Share clips the group reacts to and you'll bounce back.
						{:else if isRankUp}
							Your clips are starting to land.
						{:else}
							Share clips the group engages with to climb back up.
						{/if}
					</p>
					<div class="tier-stats">
						<span class="stat">{formatCooldown(change.cooldownMinutes)} between clips</span>
						<span class="stat-dot">&middot;</span>
						<span class="stat">{change.burstSize} per burst</span>
						<span class="stat-dot">&middot;</span>
						<span class="stat">{change.queueLimit ?? '∞'} queue depth</span>
					</div>
				</div>

				{#if change.newTier !== 'iconic'}
					<button class="tips-btn" onclick={openTips} disabled={tipsLoading}>
						{tipsLoading ? 'Loading...' : 'Tips on ranking up'}
					</button>
				{/if}
			{:else if tipsData}
				<CloutTipsView
					currentTier={change.newTier}
					nextTier={tipsData.nextTier}
					breakdown={tipsData.breakdown}
					baseCooldownMinutes={tipsData.baseCooldownMinutes}
				/>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 350;
		opacity: 0;
		transition: opacity 300ms ease;
	}
	.overlay.visible {
		opacity: 1;
	}

	.sheet {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--bg-surface);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		z-index: 351;
		display: flex;
		flex-direction: column;
		max-height: 80dvh;
		transform: translateY(100%);
		transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	.sheet.visible {
		transform: translateY(0);
	}
	.sheet.dragging {
		transition: none;
	}

	.drag-zone {
		touch-action: none;
	}

	.drag-bar {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--text-muted);
		margin: var(--space-sm) auto var(--space-xs);
		opacity: 0.5;
	}

	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-sm);
		padding: 0 var(--space-lg) var(--space-xs);
	}
	.sheet-title {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--text-primary);
		flex: 1;
		text-align: center;
	}
	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--bg-subtle);
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.close-btn:active {
		background: var(--border);
	}

	.sheet-body {
		padding: var(--space-sm) var(--space-xl) var(--space-2xl);
		overflow-y: auto;
		padding-bottom: calc(var(--space-2xl) + env(safe-area-inset-bottom, 0px));
	}

	.tier-display {
		text-align: center;
		margin-bottom: var(--space-lg);
	}
	.icon-wrap {
		padding: 0 var(--space-lg) var(--space-sm);
		margin: 0 auto;
		width: fit-content;
		overflow: visible;
	}
	.tier-icon {
		width: 80px;
		height: 80px;
		object-fit: contain;
		transition:
			transform 0.25s ease,
			opacity 0.25s ease;
	}
	.tier-icon.cycling {
		animation: icon-pop 0.35s ease;
	}
	.tier-icon.glow {
		animation:
			glow-settle 1.2s ease-out,
			float-orbit 4s ease-in-out 1.2s infinite;
	}
	@keyframes icon-pop {
		0% {
			transform: scale(0.6) translateY(8px);
			opacity: 0;
		}
		60% {
			transform: scale(1.1) translateY(-2px);
			opacity: 1;
		}
		100% {
			transform: scale(1) translateY(0);
			opacity: 1;
		}
	}
	@keyframes glow-settle {
		0% {
			filter: drop-shadow(0 0 0px var(--accent-primary));
			transform: scale(1);
		}
		40% {
			filter: drop-shadow(0 0 28px var(--accent-primary));
			transform: scale(1.1);
		}
		70% {
			filter: drop-shadow(0 0 14px var(--accent-primary));
			transform: scale(1.02);
		}
		100% {
			filter: drop-shadow(0 0 18px var(--accent-primary));
			transform: scale(1);
		}
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

	.tier-name {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs);
	}
	.tier-headline {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--accent-primary);
		margin: 0 0 var(--space-sm);
	}
	.tier-context {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin: 0 0 var(--space-lg);
		line-height: 1.5;
	}
	.tier-stats {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-muted);
	}
	.stat-dot {
		color: var(--border);
	}

	.tips-btn {
		display: block;
		width: 100%;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.875rem;
		font-weight: 600;
		padding: var(--space-md) var(--space-lg);
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.tips-btn:active {
		background: var(--border);
	}
	.tips-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

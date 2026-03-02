<script lang="ts">
	import type { FeedFilter } from '$lib/feed';

	const {
		filter,
		onfilter,
		swipeProgress = 0,
		swiping = false,
		hidden = false,
		unwatchedCount = 0,
		pullOffset = 0
	}: {
		filter: FeedFilter;
		onfilter: (f: FeedFilter) => void;
		swipeProgress?: number;
		swiping?: boolean;
		hidden?: boolean;
		unwatchedCount?: number;
		pullOffset?: number;
	} = $props();

	const filters: FeedFilter[] = ['unwatched', 'watched'];
	const labels = ['New', 'Seen'];
	const activeIndex = $derived(filters.indexOf(filter));

	let containerEl: HTMLDivElement | undefined = $state();
	let labelEls: HTMLSpanElement[] = $state([]);
	let indicatorStyle = $state('');

	function getLabelPos(idx: number) {
		const el = labelEls[idx];
		if (!el || !containerEl) return null;
		const containerRect = containerEl.getBoundingClientRect();
		const labelRect = el.getBoundingClientRect();
		return {
			left: labelRect.left - containerRect.left,
			width: labelRect.width
		};
	}

	$effect(() => {
		const idx = activeIndex;
		const progress = swipeProgress;
		// eslint-disable-next-line sonarjs/void-use -- re-run when badge appears/disappears so width updates
		void unwatchedCount;
		const base = getLabelPos(idx);
		if (!base) return;

		let left = base.left;
		let width = base.width;

		if (progress !== 0) {
			const targetIdx = idx + (progress > 0 ? 1 : -1);
			const target = getLabelPos(targetIdx);
			if (target) {
				const t = Math.abs(progress);
				left = base.left + (target.left - base.left) * t;
				width = base.width + (target.width - base.width) * t;
			}
		}

		indicatorStyle = `left:${left}px;width:${width}px`;
	});
</script>

<div
	class="filter-bar"
	class:ui-hidden={hidden}
	class:pull-snapping={pullOffset === 0}
	style:transform={pullOffset > 0 ? `translateY(${pullOffset}px)` : undefined}
>
	<div class="filter-tabs" role="tablist" bind:this={containerEl}>
		{#each filters as f, i (f)}
			<button
				role="tab"
				aria-selected={filter === f}
				class:active={filter === f}
				onclick={() => onfilter(f)}
			>
				<span class="tab-label" bind:this={labelEls[i]}>
					{labels[i]}
					{#if f === 'unwatched' && unwatchedCount > 0}
						<span class="badge">{unwatchedCount > 99 ? '99+' : unwatchedCount}</span>
					{/if}
				</span>
			</button>
		{/each}
		<div class="tab-indicator" class:instant={swiping} style={indicatorStyle}></div>
	</div>
</div>

<style>
	.filter-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 20;
		display: flex;
		justify-content: center;
		padding: max(var(--space-md), env(safe-area-inset-top)) var(--space-lg) var(--space-sm);
		background: linear-gradient(
			to bottom,
			var(--reel-gradient-soft) 0%,
			var(--reel-gradient-faint) 70%,
			transparent 100%
		);
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.filter-bar.ui-hidden {
		opacity: 0;
	}

	.filter-bar.pull-snapping {
		transition:
			opacity 0.3s ease,
			transform 0.25s ease;
	}

	.filter-tabs {
		position: relative;
		display: flex;
		gap: 0;
		pointer-events: auto;
	}

	.filter-tabs button {
		position: relative;
		padding: 8px var(--space-md);
		background: none;
		color: var(--reel-text-subtle);
		border: none;
		border-radius: 0;
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.filter-tabs button.active {
		color: var(--reel-text);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		margin-left: 4px;
		background: var(--accent-magenta);
		color: #fff;
		font-family: var(--font-body);
		font-size: 0.6875rem;
		font-weight: 700;
		line-height: 1;
		border-radius: var(--radius-full);
		vertical-align: middle;
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		height: 3px;
		background: var(--reel-text);
		border-radius: var(--radius-full);
		transition:
			left 0.25s cubic-bezier(0.32, 0.72, 0, 1),
			width 0.25s cubic-bezier(0.32, 0.72, 0, 1);
		pointer-events: none;
	}
	.tab-indicator.instant {
		transition: none;
	}
</style>

<script lang="ts">
	const { used, total }: { used: number; total: number } = $props();

	const DOT_SIZE = 8;
	const DOT_GAP = 6;

	let containerEl: HTMLDivElement | undefined = $state();
	let dotsVisible = $state(false);

	$effect(() => {
		if (!containerEl) return;

		const check = () => {
			const width = containerEl!.clientWidth;
			const needed = total * DOT_SIZE + (total - 1) * DOT_GAP;
			dotsVisible = needed <= width;
		};

		check();

		const ro = new ResizeObserver(check);
		ro.observe(containerEl);
		return () => ro.disconnect();
	});
</script>

<div class="share-limit-dots" bind:this={containerEl}>
	<span class="count-text">{used}/{total} shared today</span>
	{#if dotsVisible}
		<div class="dot-row">
			{#each Array(total) as _, i (i)}
				<span
					class="dot"
					class:active={i < used}
					style={i < used ? `animation-delay: ${i * 60}ms` : ''}
				></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.share-limit-dots {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}
	.count-text {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-secondary);
	}
	.dot-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
		opacity: 0.25;
		flex-shrink: 0;
	}
	.dot.active {
		background: var(--accent-primary);
		opacity: 1;
		animation: dot-pop 0.3s cubic-bezier(0.32, 0.72, 0, 1) both;
	}
	@keyframes dot-pop {
		from {
			transform: scale(0);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>

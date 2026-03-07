<script lang="ts">
	const { used, total }: { used: number; total: number } = $props();
</script>

<div class="share-limit-dots">
	<span class="count-text">{used}/{total} shared today</span>
	{#if total <= 15}
		<div class="dot-row">
			{#each Array(total) as _, i (i)}
				<span
					class="dot"
					class:active={i < used}
					style={i < used ? `animation-delay: ${i * 60}ms` : ''}
				></span>
			{/each}
		</div>
	{:else}
		<div class="progress-bar">
			<div class="progress-fill" style="width: {(used / total) * 100}%"></div>
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
		flex-wrap: wrap;
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
	.progress-bar {
		width: 100%;
		max-width: 200px;
		height: 4px;
		background: var(--bg-surface);
		border-radius: 2px;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--accent-primary);
		border-radius: 2px;
		transition: width 0.3s ease;
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

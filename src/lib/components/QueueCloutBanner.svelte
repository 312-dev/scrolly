<script lang="ts">
	interface CloutData {
		enabled: boolean;
		tier: string;
		tierName: string;
		cooldownMinutes: number;
		burstSize: number;
		queueLimit: number | null;
		icon: string;
		score: number;
		breakdown: { clipId: string; score: number }[];
	}

	let { clout }: { clout: CloutData } = $props();

	function formatCooldown(minutes: number): string {
		if (minutes < 60) return `${minutes}min`;
		const h = Math.round(minutes / 60);
		return `${h}h`;
	}
</script>

<div class="clout-banner">
	<div class="clout-top">
		<img src={clout.icon} alt={clout.tierName} class="clout-icon" width="32" height="32" />
		<div class="clout-info">
			<span class="clout-tier-name">{clout.tierName}</span>
			<span class="clout-stats">
				{formatCooldown(clout.cooldownMinutes)} between clips &middot; {clout.burstSize} per burst
			</span>
		</div>
	</div>
	{#if clout.breakdown.length > 0}
		<div class="clout-dots">
			{#each clout.breakdown as entry (entry.clipId)}
				<span class="dot" class:filled={entry.score > 0} class:full={entry.score === 2}></span>
			{/each}
			<span class="dot-label">
				{clout.breakdown.filter((b) => b.score > 0).length}/{clout.breakdown.length} got reactions
			</span>
		</div>
	{:else if clout.score === -1}
		<span class="clout-new-user">Share more clips to build your score</span>
	{/if}
</div>

<style>
	.clout-banner {
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
		background: var(--bg-elevated);
	}
	.clout-top {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.clout-icon {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}
	.clout-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.clout-tier-name {
		font-family: var(--font-display);
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.clout-stats {
		font-size: 0.6875rem;
		color: var(--text-secondary);
	}
	.clout-dots {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: var(--space-sm);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--bg-subtle);
		flex-shrink: 0;
	}
	.dot.filled {
		background: var(--accent-primary);
		opacity: 0.6;
	}
	.dot.full {
		background: var(--accent-primary);
		opacity: 1;
	}
	.dot-label {
		font-size: 0.6875rem;
		color: var(--text-muted);
		margin-left: var(--space-xs);
	}
	.clout-new-user {
		display: block;
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: var(--space-xs);
	}
</style>

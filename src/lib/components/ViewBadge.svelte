<script lang="ts">
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon';

	const {
		viewCount,
		ontap
	}: {
		viewCount: number;
		ontap: () => void;
	} = $props();
</script>

<button
	class="view-badge"
	onclick={(e) => {
		e.stopPropagation();
		ontap();
	}}
	onpointerdown={(e) => e.stopPropagation()}
	ontouchstart={(e) => e.stopPropagation()}
	ontouchmove={(e) => e.stopPropagation()}
	ontouchend={(e) => e.stopPropagation()}
>
	<EyeIcon size={14} weight="fill" />
	<span>{viewCount}</span>
</button>

<style>
	.view-badge {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: 5px 10px;
		background: transparent;
		border: none;
		border-radius: var(--radius-full);
		color: var(--reel-text);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		min-height: 30px;
		text-shadow: 0 1px 1px var(--reel-text-shadow);
		transition: transform 0.1s ease;
	}

	.view-badge:active {
		transform: scale(0.95);
	}

	.view-badge :global(svg) {
		filter: drop-shadow(0 1px 1px var(--reel-text-shadow));
	}
</style>

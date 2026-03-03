<script lang="ts">
	import ChatIcon from 'phosphor-svelte/lib/ChatIcon';

	const {
		commentCount = 0,
		onclick
	}: {
		commentCount?: number;
		onclick: (e: MouseEvent) => void;
	} = $props();
</script>

<button type="button" class="comment-prompt" {onclick}>
	<ChatIcon size={18} />
	{#if commentCount > 0}
		<span>{commentCount} comment{commentCount === 1 ? '' : 's'}</span>
	{:else}
		<span>Add a comment...</span>
	{/if}
</button>

<style>
	.comment-prompt {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: 44px;
		padding: 0 var(--space-md);
		border-radius: var(--radius-full);
		background: var(--reel-glass-pill-bg);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid var(--reel-glass-border);
		cursor: pointer;
		font: inherit;
		text-align: left;
		transition: background 0.2s ease;
	}
	.comment-prompt:active {
		background: var(--reel-frosted-bg-active);
	}
	.comment-prompt :global(svg) {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--reel-text-subtle);
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
	}
	.comment-prompt span {
		font-size: 0.875rem;
		color: var(--reel-text-subtle);
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
</style>

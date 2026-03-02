<script lang="ts">
	import ChatIcon from 'phosphor-svelte/lib/ChatIcon';

	const {
		discInset = false,
		uiHidden = false,
		onclick
	}: {
		discInset?: boolean;
		uiHidden?: boolean;
		onclick: (e: MouseEvent) => void;
	} = $props();
</script>

<button
	type="button"
	class="comment-prompt"
	class:disc-inset={discInset}
	class:ui-hidden={uiHidden}
	{onclick}
>
	<ChatIcon size={18} />
	<span>Add a comment...</span>
</button>

<style>
	.comment-prompt {
		position: absolute;
		bottom: calc(var(--bottom-nav-height, 64px) + 4px);
		left: var(--space-lg);
		right: var(--space-lg);
		z-index: 5;
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
		transition:
			background 0.2s ease,
			opacity 0.3s ease;
	}
	.comment-prompt.disc-inset {
		right: calc(var(--space-lg) + 52px);
	}
	.comment-prompt.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}
	.comment-prompt:active {
		background: var(--reel-frosted-bg-active);
	}
	.comment-prompt :global(svg) {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--reel-text-subtle);
	}
	.comment-prompt span {
		font-size: 0.875rem;
		color: var(--reel-text-subtle);
	}
</style>

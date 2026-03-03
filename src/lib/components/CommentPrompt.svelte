<script lang="ts">
	import { cubicInOut } from 'svelte/easing';
	import ChatIcon from 'phosphor-svelte/lib/ChatIcon';

	const {
		commentCount = 0,
		previews = [],
		onclick
	}: {
		commentCount?: number;
		previews?: { username: string; text: string }[];
		onclick: (e: MouseEvent) => void;
	} = $props();

	let currentIndex = $state(0);

	const countSuffix = $derived(commentCount === 1 ? '' : 's');
	const countLabel = $derived(commentCount > 0 ? `${commentCount} comment${countSuffix}` : null);

	const cycleItems = $derived(
		countLabel
			? [countLabel, ...previews.map((p) => `${p.username}: ${p.text}`), 'Add a comment...']
			: []
	);

	$effect(() => {
		const count = cycleItems.length;
		if (count <= 1) {
			currentIndex = 0;
			return;
		}
		currentIndex = 0;
		const id = setInterval(() => {
			currentIndex = (currentIndex + 1) % count;
		}, 6000);
		return () => clearInterval(id);
	});

	// Slide up into view from below
	function tickIn(_node: Element) {
		return {
			duration: 500,
			easing: cubicInOut,
			css: (t: number) => `transform: translateY(${(1 - t) * 100}%)`
		};
	}

	// Slide up out of view above
	function tickOut(_node: Element) {
		return {
			duration: 500,
			easing: cubicInOut,
			css: (t: number) => `transform: translateY(${(t - 1) * 100}%)`
		};
	}
</script>

<button
	type="button"
	class="comment-prompt"
	{onclick}
	onpointerdown={(e) => e.stopPropagation()}
	ontouchstart={(e) => e.stopPropagation()}
	ontouchmove={(e) => e.stopPropagation()}
	ontouchend={(e) => e.stopPropagation()}
>
	<ChatIcon size={18} />
	{#if cycleItems.length > 1}
		<div class="preview-container">
			{#key currentIndex}
				<span class="preview-text" in:tickIn out:tickOut>
					{cycleItems[currentIndex]}
				</span>
			{/key}
		</div>
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
		background: var(--reel-icon-circle-bg);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: none;
		cursor: pointer;
		font: inherit;
		text-align: left;
		transition: background 0.2s ease;
	}
	.comment-prompt:active {
		background: var(--reel-icon-circle-active);
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
	.preview-container {
		flex: 1;
		min-width: 0;
		position: relative;
		overflow: hidden;
		height: 1.25rem;
		line-height: 1.25rem;
	}
	.preview-text {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1.25rem;
		line-height: 1.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>

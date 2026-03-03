<script lang="ts">
	import SpeakerXIcon from 'phosphor-svelte/lib/SpeakerXIcon';
	import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';

	const {
		showMuteIndicator,
		muted,
		showPlayIndicator,
		paused
	}: {
		showMuteIndicator: boolean;
		muted: boolean;
		showPlayIndicator: boolean;
		paused: boolean;
	} = $props();
</script>

{#if showMuteIndicator}
	<div class="center-indicator icon">
		{#if muted}
			<SpeakerXIcon size={24} />
		{:else}
			<SpeakerHighIcon size={24} />
		{/if}
	</div>
{/if}

{#if showPlayIndicator}
	<div class="center-indicator icon">
		{#if paused}
			<PauseIcon size={24} weight="fill" />
		{:else}
			<PlayIcon size={24} weight="fill" />
		{/if}
	</div>
{/if}

<style>
	.center-indicator {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 10;
		min-width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--reel-text);
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		padding: 0 16px;
		animation: indicator-fade 0.8s ease forwards;
		pointer-events: none;
	}

	.center-indicator.icon {
		width: 56px;
		min-width: unset;
		padding: 0;
		font-size: inherit;
	}

	.center-indicator :global(svg) {
		width: 24px;
		height: 24px;
	}

	@keyframes indicator-fade {
		0% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(1.1);
		}
	}
</style>

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

{#if paused && !showPlayIndicator}
	<div class="paused-indicator icon">
		<PlayIcon size={40} weight="fill" />
	</div>
{/if}

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

	.paused-indicator {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 9;
		width: 90px;
		height: 90px;
		border-radius: var(--radius-full);
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		pointer-events: none;
		animation: paused-fade-in 0.3s ease forwards;
	}

	.paused-indicator :global(svg) {
		width: 40px;
		height: 40px;
		margin-left: 3px;
	}

	@keyframes paused-fade-in {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
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

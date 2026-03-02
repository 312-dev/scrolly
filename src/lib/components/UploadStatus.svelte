<script lang="ts">
	import { showShortcutNudge, dismissShortcutNudge } from '$lib/stores/shortcutNudge';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import LightbulbIcon from 'phosphor-svelte/lib/LightbulbIcon';

	const {
		phase,
		clipContentType,
		serverArtist,
		serverAlbumArt,
		ondismiss,
		onretry,
		onsaveandview,
		ondismissnudge
	}: {
		phase: 'uploading' | 'done' | 'failed';
		clipContentType: string;
		serverArtist: string | null;
		serverAlbumArt: string | null;
		ondismiss: () => void;
		onretry: () => void;
		onsaveandview: () => void;
		ondismissnudge: () => void;
	} = $props();

	function getStatusText(p: typeof phase, ct: string): string {
		if (p === 'uploading') return ct === 'music' ? 'Finding song...' : 'Downloading video...';
		if (p === 'done') return 'Ready!';
		return 'Download failed';
	}

	const statusText = $derived(getStatusText(phase, clipContentType));
</script>

<button class="close-btn" onclick={ondismiss} aria-label="Close">
	<XIcon size={20} />
</button>

<div class="upload-screen">
	{#if serverAlbumArt && clipContentType === 'music'}
		<div class="album-bg" style="background-image: url({serverAlbumArt})"></div>
	{/if}

	<div class="upload-content">
		<!-- Circle progress -->
		<div class="circle-wrap" class:done={phase === 'done'} class:failed={phase === 'failed'}>
			<svg class="circle-svg" viewBox="0 0 120 120">
				<circle class="circle-track" cx="60" cy="60" r="54" />
				<circle
					class="circle-progress"
					class:complete={phase === 'done'}
					class:error={phase === 'failed'}
					cx="60"
					cy="60"
					r="54"
				/>
			</svg>
			<div class="circle-inner">
				{#if phase === 'uploading'}
					<div class="pulse-dot"></div>
				{:else if phase === 'done'}
					<CheckIcon size={36} weight="bold" class="check-icon" />
				{:else}
					<XIcon size={32} class="error-icon" />
				{/if}
			</div>
		</div>

		<p class="status-label">{statusText}</p>

		{#if serverArtist && clipContentType === 'music'}
			<p class="artist-label">{serverArtist}</p>
		{/if}

		<!-- Action buttons -->
		{#if phase === 'done'}
			<button class="primary-btn" onclick={onsaveandview}>View in feed</button>

			{#if $showShortcutNudge}
				<div class="shortcut-nudge">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href="/share/setup" class="nudge-link" onclick={ondismissnudge}>
						<LightbulbIcon size={14} />
						Share clips faster from other apps
					</a>
					<button class="nudge-dismiss" onclick={dismissShortcutNudge} aria-label="Dismiss">
						<XIcon size={14} />
					</button>
				</div>
			{/if}
		{:else if phase === 'failed'}
			<button class="primary-btn" onclick={onretry}>Try again</button>
		{/if}
	</div>
</div>

<style>
	/* Close button */
	.close-btn {
		position: absolute;
		top: max(var(--space-lg), env(safe-area-inset-top));
		right: var(--space-lg);
		z-index: 10;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: var(--radius-full);
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--reel-text);
		cursor: pointer;
	}
	.close-btn :global(svg) {
		width: 20px;
		height: 20px;
	}

	/* Upload screen */
	.upload-screen {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}
	.album-bg {
		position: absolute;
		inset: -40px;
		background-size: cover;
		background-position: center;
		filter: blur(40px) brightness(0.2);
	}
	.upload-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--space-2xl);
		width: 100%;
		max-width: 320px;
	}

	/* Circle progress */
	.circle-wrap {
		width: 120px;
		height: 120px;
		position: relative;
		margin-bottom: var(--space-xl);
	}
	.circle-svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}
	.circle-track {
		fill: none;
		stroke: rgba(255, 255, 255, 0.08);
		stroke-width: 4;
	}
	.circle-progress {
		fill: none;
		stroke: var(--accent-primary);
		stroke-width: 4;
		stroke-linecap: round;
		stroke-dasharray: 339.292;
		stroke-dashoffset: 169.646;
		animation: circle-spin 2s linear infinite;
		transform-origin: center;
	}
	.circle-progress.complete {
		animation: circle-complete 0.6s cubic-bezier(0.32, 0.72, 0, 1) forwards;
	}
	.circle-progress.error {
		stroke: var(--error);
		animation: circle-complete 0.6s cubic-bezier(0.32, 0.72, 0, 1) forwards;
		stroke-dashoffset: 339.292;
	}
	.circle-inner {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pulse-dot {
		width: 10px;
		height: 10px;
		border-radius: var(--radius-full);
		background: var(--accent-primary);
		animation: pulse 1.5s ease-in-out infinite;
	}
	.circle-inner :global(.check-icon) {
		width: 36px;
		height: 36px;
		color: var(--accent-primary);
		animation: check-pop 0.4s cubic-bezier(0.32, 0.72, 0, 1);
	}
	.circle-inner :global(.error-icon) {
		width: 32px;
		height: 32px;
		color: var(--error);
	}

	/* Status labels */
	.status-label {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--reel-text);
		margin: 0;
		text-align: center;
	}
	.artist-label {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
		margin: 0 0 var(--space-xl);
	}

	/* Primary button */
	.primary-btn {
		margin-top: var(--space-xl);
		padding: 14px 32px;
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.9375rem;
		font-weight: 700;
		font-family: var(--font-body);
		cursor: pointer;
		transition: transform 0.1s ease;
		min-width: 160px;
	}
	.primary-btn:active {
		transform: scale(0.97);
	}
	.primary-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Shortcut nudge */
	.shortcut-nudge {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin-top: var(--space-lg);
		animation: fade-in 0.3s ease 0.5s both;
	}
	.nudge-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.nudge-link :global(svg) {
		flex-shrink: 0;
	}
	.nudge-dismiss {
		background: none;
		border: none;
		padding: 2px;
		color: rgba(255, 255, 255, 0.3);
		cursor: pointer;
	}
	.nudge-dismiss :global(svg) {
		width: 14px;
		height: 14px;
	}

	/* Keyframe animations */
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes circle-spin {
		0% {
			stroke-dashoffset: 169.646;
			transform: rotate(0deg);
		}
		50% {
			stroke-dashoffset: 254.469;
		}
		100% {
			stroke-dashoffset: 169.646;
			transform: rotate(360deg);
		}
	}
	@keyframes circle-complete {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.5);
			opacity: 0.5;
		}
	}
	@keyframes check-pop {
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

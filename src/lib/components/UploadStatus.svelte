<script lang="ts">
	import { onDestroy } from 'svelte';
	import { showShortcutNudge, dismissShortcutNudge } from '$lib/stores/shortcutNudge';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import LightbulbIcon from 'phosphor-svelte/lib/LightbulbIcon';
	import ScissorsIcon from 'phosphor-svelte/lib/ScissorsIcon';

	const {
		phase,
		clipContentType,
		serverTitle,
		serverArtist,
		serverAlbumArt,
		trimDeadline = null,
		ondismiss,
		onretry,
		onsaveandview,
		ondismissnudge,
		ontrim,
		onskiptrim
	}: {
		phase: 'uploading' | 'done' | 'failed' | 'trim_prompt';
		clipContentType: string;
		serverTitle: string | null;
		serverArtist: string | null;
		serverAlbumArt: string | null;
		trimDeadline?: number | null;
		ondismiss: () => void;
		onretry: () => void;
		onsaveandview: () => void;
		ondismissnudge: () => void;
		ontrim?: () => void;
		onskiptrim?: () => void;
	} = $props();

	let secondsLeft = $state(120);
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (phase !== 'trim_prompt' || !trimDeadline) {
			if (countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
			return;
		}

		const tick = () => {
			const remaining = Math.max(0, Math.ceil((trimDeadline - Date.now()) / 1000));
			secondsLeft = remaining;
			if (remaining <= 0 && countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
				onskiptrim?.();
			}
		};
		tick();
		countdownTimer = setInterval(tick, 1000);

		return () => {
			if (countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		};
	});

	onDestroy(() => {
		if (countdownTimer) clearInterval(countdownTimer);
	});

	function getStatusText(p: typeof phase, ct: string): string {
		if (p === 'uploading') return ct === 'music' ? 'Hang tight...' : 'Downloading video...';
		if (p === 'trim_prompt') return 'Share the best part?';
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
		<!-- Circle progress / icon -->
		<div
			class="circle-wrap"
			class:done={phase === 'done'}
			class:failed={phase === 'failed'}
			class:trim={phase === 'trim_prompt'}
		>
			{#if phase === 'trim_prompt'}
				<div class="trim-icon-wrap">
					<ScissorsIcon size={36} weight="bold" />
				</div>
			{:else}
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
			{/if}
		</div>

		<p class="status-label">{statusText}</p>

		{#if clipContentType === 'music' && (serverTitle || serverArtist)}
			<div class="song-card">
				{#if serverTitle}<span class="song-title">{serverTitle}</span>{/if}
				{#if serverTitle && serverArtist}<span class="song-dot">&middot;</span>{/if}
				{#if serverArtist}<span class="song-artist">{serverArtist}</span>{/if}
			</div>
		{/if}

		{#if phase === 'uploading' && clipContentType === 'music'}
			<button class="primary-btn" disabled><span class="spinner"></span> Trim</button>
		{/if}

		<!-- Action buttons -->
		{#if phase === 'trim_prompt'}
			<button class="primary-btn" onclick={ontrim}
				><ScissorsIcon size={18} weight="bold" /> Trim</button
			>
			<button class="skip-btn" onclick={onskiptrim}>
				Skip — publish full song
				{#if secondsLeft > 0}
					<span class="countdown">({secondsLeft}s)</span>
				{/if}
			</button>
		{:else if phase === 'done'}
			<button class="primary-btn" onclick={onsaveandview}>View in feed</button>

			{#if $showShortcutNudge}
				<div class="shortcut-nudge">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href="/share/setup" class="nudge-link" onclick={ondismissnudge}>
						<LightbulbIcon size={13} />
						<span>Share clips faster from other apps</span>
					</a>
					<button class="nudge-dismiss" onclick={dismissShortcutNudge} aria-label="Dismiss">
						<XIcon size={12} />
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

	/* Trim prompt icon */
	.circle-wrap.trim {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.trim-icon-wrap {
		width: 80px;
		height: 80px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-primary);
		animation: check-pop 0.4s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.skip-btn {
		margin-top: var(--space-md);
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		padding: var(--space-sm);
	}
	.skip-btn:active {
		opacity: 0.7;
	}
	.countdown {
		color: var(--text-muted);
	}

	/* Status labels */
	.status-label {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--reel-text);
		margin: 0 0 var(--space-xs);
		text-align: center;
	}
	.song-card {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		background: rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		padding: var(--space-sm) var(--space-lg);
		margin-top: var(--space-md);
		max-width: 100%;
		overflow: hidden;
	}
	.song-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 1;
		min-width: 0;
	}
	.song-dot {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.3);
		flex-shrink: 0;
	}
	.song-artist {
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.45);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 1;
		min-width: 0;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
	}
	.primary-btn:active {
		transform: scale(0.97);
	}
	.primary-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Shortcut nudge */
	.shortcut-nudge {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		margin-top: var(--space-xl);
		animation: fade-in 0.3s ease 0.5s both;
	}
	.nudge-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
		text-decoration: none;
	}
	.nudge-link span {
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: rgba(255, 255, 255, 0.2);
	}
	.nudge-link :global(svg) {
		flex-shrink: 0;
		opacity: 0.7;
	}
	.nudge-dismiss {
		background: none;
		border: none;
		padding: 4px;
		color: rgba(255, 255, 255, 0.25);
		cursor: pointer;
		flex-shrink: 0;
	}
	.nudge-dismiss :global(svg) {
		width: 12px;
		height: 12px;
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

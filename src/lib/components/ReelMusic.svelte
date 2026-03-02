<script lang="ts">
	import { basename } from '$lib/utils';
	import { connectNormalizer } from '$lib/audio/normalizer';

	let {
		clip,
		active,
		muted,
		autoScroll,
		playbackRate = 1,
		onretry,
		onended,
		audioEl = $bindable(null)
	}: {
		clip: {
			id: string;
			audioPath: string | null;
			albumArt: string | null;
			title: string | null;
			artist: string | null;
			durationSeconds: number | null;
			status: string;
			originalUrl: string;
		};
		active: boolean;
		muted: boolean;
		autoScroll: boolean;
		playbackRate?: number;
		onretry: (id: string) => void;
		onended: () => void;
		audioEl: HTMLAudioElement | null;
	} = $props();

	let playing = $state(false);

	function getAudioUrl(path: string | null): string {
		if (!path) return '';
		return `/api/videos/${basename(path)}`;
	}

	// Autoplay/pause based on active state + connect volume normalizer
	$effect(() => {
		if (!audioEl) return;
		if (active) {
			connectNormalizer(audioEl);
			audioEl.currentTime = 0;
			audioEl.play().catch(() => {});
		} else {
			audioEl.pause();
		}
	});

	// Sync muted prop to audio element
	$effect(() => {
		if (audioEl) {
			audioEl.muted = muted;
		}
	});

	// Sync playback rate
	$effect(() => {
		if (audioEl) {
			audioEl.playbackRate = playbackRate;
		}
	});
</script>

<div class="reel-music">
	{#if clip.albumArt}
		<div class="music-bg" style="background-image: url({clip.albumArt})"></div>
	{:else}
		<div class="music-bg-fallback"></div>
	{/if}

	<div class="music-content">
		{#if clip.albumArt}
			<img
				class="album-art"
				class:is-playing={clip.status === 'ready' && playing}
				src={clip.albumArt}
				alt="Album art"
			/>
		{:else}
			<div
				class="album-art album-art-placeholder"
				class:is-playing={clip.status === 'ready' && playing}
			>
				♫
			</div>
		{/if}

		<p class="song-title">{clip.title || 'Unknown Title'}</p>
		{#if clip.artist}
			<p class="song-artist">{clip.artist}</p>
		{/if}

		{#if clip.status === 'ready' && clip.audioPath}
			<audio
				bind:this={audioEl}
				src={getAudioUrl(clip.audioPath)}
				preload="auto"
				loop={!autoScroll}
				onplay={() => (playing = true)}
				onpause={() => (playing = false)}
				onended={() => {
					if (autoScroll) onended();
				}}
			></audio>
		{/if}

		{#if clip.status === 'downloading'}
			<div class="status-row">
				<span class="spinner"></span>
				<span class="status-label">Finding song...</span>
			</div>
		{:else if clip.status === 'failed'}
			<div class="status-row">
				<span class="status-label error-label">Couldn't download audio</span>
				<button class="retry-btn" onclick={() => onretry(clip.id)}>Retry</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.reel-music {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding-bottom: calc(var(--bottom-nav-height, 64px) + 34px);
	}

	.music-bg {
		position: absolute;
		inset: -40px;
		background-size: cover;
		background-position: center;
		filter: blur(40px) brightness(0.3);
	}

	.music-bg-fallback {
		position: absolute;
		inset: 0;
		background: var(--bg-primary);
	}

	.music-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--space-2xl);
		width: 100%;
		max-width: 340px;
		text-align: center;
		user-select: none;
		-webkit-user-select: none;
	}

	.album-art {
		width: 220px;
		height: 220px;
		border-radius: var(--radius-lg);
		object-fit: cover;
		margin-bottom: var(--space-xl);
		box-shadow: 0 12px 40px var(--reel-text-shadow);
		transition: transform 0.3s ease;
	}

	.album-art.is-playing {
		animation: pulse-art 3s ease-in-out infinite;
	}

	@keyframes pulse-art {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.02);
		}
	}

	.album-art-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-subtle);
		color: var(--text-muted);
		font-size: 3rem;
	}

	.song-title {
		margin: 0 0 2px;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--reel-text);
		text-shadow: 0 1px 4px var(--reel-text-shadow);
	}

	.song-artist {
		margin: 0;
		font-size: 1rem;
		color: var(--reel-text-dim);
	}

	.status-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-top: var(--space-lg);
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid var(--reel-spinner-track);
		border-top-color: var(--reel-spinner-head);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.status-label {
		font-size: 0.875rem;
		color: var(--reel-text-subtle);
	}

	.error-label {
		color: var(--reel-text-faint);
	}

	.retry-btn {
		background: none;
		border: 1px solid var(--reel-input-border);
		color: var(--reel-text-medium);
		padding: 4px 16px;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-btn:active {
		background: var(--reel-glass-pill-bg);
	}
</style>

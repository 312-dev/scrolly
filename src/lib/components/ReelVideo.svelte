<script lang="ts">
	import { basename } from '$lib/utils';
	import { connectNormalizer } from '$lib/audio/normalizer';

	let {
		clip,
		active,
		muted,
		autoScroll,
		forceLoop = false,
		playbackRate = 1,
		onretry,
		onended,
		videoEl = $bindable(null)
	}: {
		clip: {
			id: string;
			videoPath: string | null;
			thumbnailPath: string | null;
			status: string;
			originalUrl: string;
		};
		active: boolean;
		muted: boolean;
		autoScroll: boolean;
		forceLoop?: boolean;
		playbackRate?: number;
		onretry: (id: string) => void;
		onended: () => void;
		videoEl: HTMLVideoElement | null;
	} = $props();

	let isPortrait = $state(false);

	function getVideoUrl(path: string | null): string {
		if (!path) return '';
		return `/api/videos/${basename(path)}`;
	}

	function getThumbnailUrl(path: string | null): string {
		if (!path) return '';
		return `/api/thumbnails/${basename(path)}`;
	}

	// Autoplay/pause based on active state + connect volume normalizer
	$effect(() => {
		if (!videoEl) return;
		if (active) {
			connectNormalizer(videoEl);
			videoEl.currentTime = 0;
			videoEl.play().catch(() => {});
		} else {
			videoEl.pause();
		}
	});

	// Sync muted prop
	$effect(() => {
		if (videoEl) {
			videoEl.muted = muted;
		}
	});

	// Sync playback rate
	$effect(() => {
		if (videoEl) {
			videoEl.playbackRate = playbackRate;
		}
	});
</script>

{#if clip.status === 'ready' && clip.videoPath}
	<div class="reel-video-container">
		<div
			class="reel-video-bg"
			style:background-image="url({getThumbnailUrl(clip.thumbnailPath)})"
			aria-hidden="true"
		></div>
		<video
			bind:this={videoEl}
			src={getVideoUrl(clip.videoPath)}
			poster={getThumbnailUrl(clip.thumbnailPath)}
			playsinline
			preload="auto"
			loop={!autoScroll || forceLoop}
			muted
			class="reel-video"
			class:portrait={isPortrait}
			onloadedmetadata={() => {
				if (videoEl) isPortrait = videoEl.videoHeight > videoEl.videoWidth;
			}}
			oncontextmenu={(e) => e.preventDefault()}
			onended={() => {
				if (autoScroll && !forceLoop) onended();
			}}
		></video>
	</div>
{:else if clip.status === 'downloading'}
	<div class="reel-placeholder">
		<span class="spinner"></span>
		<p>Downloading...</p>
	</div>
{:else if clip.status === 'failed'}
	<div class="reel-placeholder">
		<p class="failed-text">Download failed</p>
		<button class="retry-btn" onclick={() => onretry(clip.id)}>Retry</button>
		<a href={clip.originalUrl} target="_blank" rel="external noopener">View original</a>
	</div>
{/if}

<style>
	.reel-video-container {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.reel-video-bg {
		position: absolute;
		inset: -40px;
		background-size: cover;
		background-position: center;
		filter: blur(32px) brightness(0.4) saturate(1.3);
		pointer-events: none;
	}

	.reel-video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
	}

	.reel-video.portrait {
		object-fit: cover;
	}

	.reel-placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		color: rgba(255, 255, 255, 0.6);
		background: var(--bg-primary);
	}

	.reel-placeholder a {
		color: var(--accent-blue);
		text-decoration: none;
		font-size: 0.875rem;
	}

	.failed-text {
		color: var(--error);
		margin: 0;
	}

	.retry-btn {
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		padding: 8px 20px;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}

	.spinner {
		display: inline-block;
		width: 32px;
		height: 32px;
		border: 2.5px solid var(--reel-spinner-track);
		border-top-color: var(--reel-text);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	p {
		margin: 0;
		font-size: 0.875rem;
	}
</style>

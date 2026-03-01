<script lang="ts">
	import PlatformIcon from './PlatformIcon.svelte';

	let {
		albumArt,
		spotifyUrl = null,
		appleMusicUrl = null,
		youtubeMusicUrl = null,
		active,
		paused,
		uiHidden
	}: {
		albumArt: string;
		spotifyUrl?: string | null;
		appleMusicUrl?: string | null;
		youtubeMusicUrl?: string | null;
		active: boolean;
		paused: boolean;
		uiHidden: boolean;
	} = $props();

	let showMusicLinks = $state(false);
	const hasMusicLinks = $derived(!!(spotifyUrl || appleMusicUrl || youtubeMusicUrl));
</script>

<div class="music-disc-area" class:ui-hidden={uiHidden}>
	{#if showMusicLinks && hasMusicLinks}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="music-links-popout"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			{#if spotifyUrl}
				<a
					href={spotifyUrl}
					target="_blank"
					rel="external noopener"
					class="music-link-pill"
					aria-label="Spotify"
				>
					<PlatformIcon platform="spotify" size={16} />
				</a>
			{/if}
			{#if appleMusicUrl}
				<a
					href={appleMusicUrl}
					target="_blank"
					rel="external noopener"
					class="music-link-pill"
					aria-label="Apple Music"
				>
					<PlatformIcon platform="apple_music" size={16} />
				</a>
			{/if}
			{#if youtubeMusicUrl}
				<a
					href={youtubeMusicUrl}
					target="_blank"
					rel="external noopener"
					class="music-link-pill"
					aria-label="YouTube Music"
				>
					<PlatformIcon platform="youtube" size={16} />
				</a>
			{/if}
		</div>
	{/if}
	<button
		type="button"
		class="music-disc"
		class:spinning={active && !paused && !showMusicLinks}
		onclick={(e) => {
			e.stopPropagation();
			if (hasMusicLinks) showMusicLinks = !showMusicLinks;
		}}
		aria-label={showMusicLinks ? 'Close music links' : 'Open music links'}
	>
		<img src={albumArt} alt="" class="music-disc-img" />
	</button>
</div>

<style>
	.music-disc-area {
		position: absolute;
		right: var(--space-lg);
		bottom: calc(var(--bottom-nav-height, 64px) + 10px);
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		z-index: 5;
		transition: opacity 0.3s ease;
	}
	.music-disc-area.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}
	.music-disc {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		overflow: hidden;
		box-shadow: 0 2px 8px var(--reel-icon-shadow);
		border: 2px solid rgba(255, 255, 255, 0.2);
		padding: 0;
		background: none;
		cursor: pointer;
		flex-shrink: 0;
	}
	.music-disc.spinning {
		animation: spin-disc 4s linear infinite;
	}
	.music-disc-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.music-links-popout {
		display: flex;
		align-items: center;
		gap: 6px;
		animation: links-slide-in 200ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	@keyframes links-slide-in {
		from {
			opacity: 0;
			transform: translateX(12px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
	.music-link-pill {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background: var(--reel-icon-circle-bg);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		color: var(--reel-text);
		text-decoration: none;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
	}
	.music-link-pill:active {
		transform: scale(0.93);
		background: var(--reel-icon-circle-active);
	}
	@keyframes spin-disc {
		to {
			transform: rotate(360deg);
		}
	}
</style>

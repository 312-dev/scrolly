<script lang="ts">
	import PlatformIcon from './PlatformIcon.svelte';

	let {
		albumArt,
		spotifyUrl = null,
		appleMusicUrl = null,
		youtubeMusicUrl = null,
		active,
		paused
	}: {
		albumArt: string;
		spotifyUrl?: string | null;
		appleMusicUrl?: string | null;
		youtubeMusicUrl?: string | null;
		active: boolean;
		paused: boolean;
	} = $props();

	let showMusicLinks = $state(false);
	const hasMusicLinks = $derived(!!(spotifyUrl || appleMusicUrl || youtubeMusicUrl));
</script>

{#if showMusicLinks}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="music-links-backdrop"
		onclick={() => (showMusicLinks = false)}
		onkeydown={(e) => e.stopPropagation()}
	></div>
{/if}

<div class="music-disc-area">
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
					<PlatformIcon platform="spotify" size={18} />
					<span class="music-link-label">Spotify</span>
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
					<PlatformIcon platform="apple_music" size={18} />
					<span class="music-link-label">Apple Music</span>
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
					<PlatformIcon platform="youtube" size={18} />
					<span class="music-link-label">YouTube</span>
				</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	.music-links-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9;
	}
	.music-disc-area {
		position: relative;
		flex-shrink: 0;
		margin-top: var(--space-xs);
	}
	.music-disc {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		overflow: hidden;
		box-shadow: 0 2px 8px var(--reel-icon-shadow);
		border: 2px solid rgba(255, 255, 255, 0.2);
		padding: 0;
		background: none;
		cursor: pointer;
		flex-shrink: 0;
		display: block;
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
		position: absolute;
		right: calc(36px + var(--space-sm));
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--space-sm);
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		animation: links-slide-in 200ms cubic-bezier(0.32, 0.72, 0, 1);
		z-index: 10;
	}
	@keyframes links-slide-in {
		from {
			opacity: 0;
			transform: translateX(12px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}
	.music-link-pill {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-primary);
		text-decoration: none;
		white-space: nowrap;
		transition: background 0.15s ease;
	}
	.music-link-pill:active {
		background: var(--bg-surface);
	}
	.music-link-label {
		font-size: 0.8125rem;
		font-weight: 600;
	}
	@keyframes spin-disc {
		to {
			transform: rotate(360deg);
		}
	}
</style>

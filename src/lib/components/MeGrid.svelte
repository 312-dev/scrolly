<script lang="ts">
	import { basename } from '$lib/utils';
	import type { FeedClip } from '$lib/types';
	import FilmStripIcon from 'phosphor-svelte/lib/FilmStripIcon';
	import MusicNoteIcon from 'phosphor-svelte/lib/MusicNoteIcon';

	const {
		clips,
		showAvatars = false,
		ontap
	}: {
		clips: FeedClip[];
		showAvatars?: boolean;
		ontap: (index: number) => void;
	} = $props();

	function getThumbnailSrc(clip: FeedClip): string | null {
		if (clip.thumbnailPath) return `/api/thumbnails/${basename(clip.thumbnailPath)}`;
		if (clip.albumArt) return clip.albumArt;
		return null;
	}
</script>

<div class="grid">
	{#each clips as clip, i (clip.id)}
		{@const thumbSrc = getThumbnailSrc(clip)}
		<button class="grid-cell" onclick={() => ontap(i)} aria-label={clip.title ?? 'Clip'}>
			{#if thumbSrc}
				<img src={thumbSrc} alt="" class="grid-thumb" loading="lazy" />
			{:else}
				<div class="grid-thumb-placeholder"></div>
			{/if}
			<span class="grid-content-type">
				{#if clip.contentType === 'music'}<MusicNoteIcon size={18} weight="fill" />
				{:else}<FilmStripIcon size={18} weight="fill" />{/if}
			</span>
			{#if showAvatars}
				<span class="grid-avatar">
					{#if clip.addedByAvatar}
						<img
							src="/api/profile/avatar/{clip.addedByAvatar}"
							alt={clip.addedByUsername}
							class="grid-avatar-img"
						/>
					{:else}
						<span class="grid-avatar-initials">{clip.addedByUsername[0].toUpperCase()}</span>
					{/if}
				</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
	}
	.grid-cell {
		position: relative;
		aspect-ratio: 1 / 1;
		overflow: hidden;
		background: var(--bg-elevated);
		border: none;
		padding: 0;
		cursor: pointer;
		display: block;
	}
	.grid-cell:active {
		opacity: 0.85;
	}
	.grid-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.grid-thumb-placeholder {
		width: 100%;
		height: 100%;
		background: var(--bg-surface);
	}
	.grid-content-type {
		position: absolute;
		bottom: var(--space-xs);
		left: var(--space-xs);
		display: flex;
		align-items: center;
		color: rgba(255, 255, 255, 0.85);
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
	}
	.grid-avatar {
		position: absolute;
		top: var(--space-xs);
		right: var(--space-xs);
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		overflow: hidden;
		border: 1.5px solid rgba(255, 255, 255, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-surface);
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
	}
	.grid-avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.grid-avatar-initials {
		font-size: 0.5625rem;
		font-weight: 700;
		color: var(--text-secondary);
		line-height: 1;
	}
</style>

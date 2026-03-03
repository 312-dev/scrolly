<script lang="ts">
	import PlatformIcon from './PlatformIcon.svelte';
	import ReelOverlayActions from './ReelOverlayActions.svelte';
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';

	const {
		username,
		avatarPath = null,
		platform,
		creatorName = null,
		creatorUrl = null,
		contentType = 'video',
		caption,
		canEditCaption = false,
		seenByOthers = false,
		clipId = '',
		uiHidden = false,
		oncaptionedit,
		ondelete
	}: {
		username: string;
		avatarPath?: string | null;
		platform: string;
		creatorName?: string | null;
		creatorUrl?: string | null;
		contentType?: string;
		caption: string | null;
		canEditCaption?: boolean;
		seenByOthers?: boolean;
		clipId?: string;
		uiHidden?: boolean;
		oncaptionedit?: (clipId: string, newCaption: string) => void;
		ondelete?: (clipId: string) => void;
	} = $props();

	let expanded = $state(false);
	let editing = $state(false);
	let confirmingDelete = $state(false);
	const canModify = $derived(canEditCaption && !seenByOthers);
	const initials = $derived(username.replace('@', '').slice(0, 2).toUpperCase());
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- external creator URL -->
<div class="reel-overlay" class:ui-hidden={uiHidden}>
	<div class="overlay-content">
		<div class="overlay-user">
			{#if avatarPath}
				<img src="/api/profile/avatar/{avatarPath}" alt="" class="overlay-avatar" />
			{:else}
				<span class="overlay-avatar overlay-avatar-fallback">{initials}</span>
			{/if}
			{#if contentType !== 'music' && creatorName}
				{#if creatorUrl}
					<a
						href={creatorUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="username"
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => e.stopPropagation()}>{creatorName}</a
					>
				{:else}
					<span class="username">{creatorName}</span>
				{/if}
				<span class="platform-badge"><PlatformIcon {platform} size={12} /></span>
			{/if}
			{#if canModify && !editing && !confirmingDelete}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="host-actions-inline"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					<button class="host-icon-btn" onclick={() => (editing = true)} aria-label="Edit caption">
						<PencilSimpleIcon size={13} />
					</button>
					<button
						class="host-icon-btn delete"
						onclick={() => (confirmingDelete = true)}
						aria-label="Delete clip"
					>
						<TrashIcon size={13} />
					</button>
				</span>
			{/if}
		</div>

		<ReelOverlayActions
			{clipId}
			{caption}
			{canModify}
			{expanded}
			onexpandtoggle={() => (expanded = !expanded)}
			{oncaptionedit}
			{ondelete}
			bind:editing
			bind:confirmingDelete
		/>
	</div>
</div>

<style>
	.reel-overlay {
		position: absolute;
		bottom: 74px;
		left: var(--space-lg);
		right: var(--space-lg);
		z-index: 5;
		transition: opacity 0.3s ease;
	}
	.reel-overlay.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}
	.overlay-content {
		margin-right: 64px;
	}
	.overlay-user {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-xs);
	}
	.overlay-avatar {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-full);
		object-fit: cover;
		flex-shrink: 0;
		border: 2px solid var(--reel-avatar-border);
	}
	.overlay-avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--reel-frosted-bg);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		color: var(--reel-text-medium);
		font-family: var(--font-display);
		font-size: 0.6875rem;
		font-weight: 700;
	}
	.username {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.875rem;
		color: var(--reel-text);
		text-shadow: 0 1px 4px var(--reel-text-shadow);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.username:active {
		opacity: 0.7;
	}
	.platform-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: var(--radius-full);
		background: var(--reel-frosted-bg);
		color: var(--reel-text-medium);
		flex-shrink: 0;
	}
	.host-actions-inline {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.host-icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		border-radius: var(--radius-full);
		color: var(--reel-text-ghost);
		cursor: pointer;
		padding: 0;
		transition: color 0.15s ease;
	}
	.host-icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		filter: drop-shadow(0 1px 2px var(--reel-icon-shadow));
	}
	.host-icon-btn:active {
		color: var(--reel-text-dim);
		transform: scale(0.9);
	}
	.host-icon-btn.delete:active {
		color: var(--error);
	}
</style>

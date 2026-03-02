<script lang="ts">
	import { REACTION_MAP } from '$lib/icons';
	import SpeakerXIcon from 'phosphor-svelte/lib/SpeakerXIcon';
	import SpeakerHighIcon from 'phosphor-svelte/lib/SpeakerHighIcon';
	import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
	import ChatIcon from 'phosphor-svelte/lib/ChatIcon';
	import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';

	const {
		favorited,
		reactedEmoji = null,
		commentCount,
		unreadCommentCount = 0,
		originalUrl,
		muted = true,
		uiHidden = false,
		isOwn = false,
		onsave,
		oncomment,
		onreactionhold,
		onmute
	}: {
		favorited: boolean;
		reactedEmoji?: string | null;
		commentCount: number;
		unreadCommentCount?: number;
		originalUrl: string;
		muted?: boolean;
		uiHidden?: boolean;
		isOwn?: boolean;
		onsave: () => void;
		oncomment: () => void;
		onreactionhold?: (x: number, y: number) => void;
		onmute?: () => void;
	} = $props();

	const saveLabel = $derived.by(() => {
		if (isOwn) return 'Cannot like own clip';
		return favorited ? 'Unsave' : 'Save';
	});
	let saveBtnEl: HTMLButtonElement | null = $state(null);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdFired = false;

	let justSaved = $state(false);
	let prevFavorited = $state(false);
	$effect(() => {
		if (favorited && !prevFavorited) {
			justSaved = true;
			setTimeout(() => {
				justSaved = false;
			}, 300);
		}
		prevFavorited = favorited;
	});

	function stop(e: MouseEvent | PointerEvent) {
		e.stopPropagation();
	}

	function handleSaveDown(e: PointerEvent) {
		e.stopPropagation();
		holdFired = false;
		holdTimer = setTimeout(() => {
			holdFired = true;
			if (onreactionhold && saveBtnEl) {
				const rect = saveBtnEl.getBoundingClientRect();
				onreactionhold(rect.left + rect.width / 2, rect.top);
			}
		}, 350);
	}

	function handleSaveUp(e: PointerEvent) {
		e.stopPropagation();
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		if (!holdFired) {
			onsave();
		}
		holdFired = false;
	}

	function formatCount(n: number): string {
		if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
		return String(n);
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- only external URLs in this component -->
<div class="action-sidebar" class:ui-hidden={uiHidden}>
	{#if onmute}
		<button
			class="sidebar-btn"
			onclick={(e) => {
				stop(e);
				onmute?.();
			}}
			aria-label={muted ? 'Unmute' : 'Mute'}
		>
			<span class="icon-circle">
				{#if muted}
					<SpeakerXIcon size={24} />
				{:else}
					<SpeakerHighIcon size={24} />
				{/if}
			</span>
		</button>
	{/if}

	<button
		class="sidebar-btn"
		class:active={favorited}
		class:disabled={isOwn}
		bind:this={saveBtnEl}
		onpointerdown={isOwn ? stop : handleSaveDown}
		onpointerup={isOwn ? stop : handleSaveUp}
		aria-label={saveLabel}
		disabled={isOwn}
	>
		<span class="icon-circle" class:pop={justSaved}>
			{#if reactedEmoji && reactedEmoji !== '❤️' && REACTION_MAP.has(reactedEmoji)}
				<span class="reaction-emoji">{reactedEmoji}</span>
			{:else}
				<HeartIcon size={24} weight={favorited ? 'fill' : 'regular'} />
			{/if}
		</span>
	</button>

	<button
		class="sidebar-btn"
		onclick={(e) => {
			stop(e);
			oncomment();
		}}
	>
		<span class="icon-circle">
			<ChatIcon size={24} />
			{#if unreadCommentCount > 0}
				<span class="unread-badge">{unreadCommentCount > 9 ? '9+' : unreadCommentCount}</span>
			{/if}
		</span>
		{#if commentCount > 0}
			<span class="sidebar-count">{formatCount(commentCount)}</span>
		{/if}
	</button>

	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL, not app navigation -->
	<a
		href={originalUrl}
		target="_blank"
		rel="noopener noreferrer"
		class="sidebar-btn"
		onclick={stop}
		aria-label="Open original"
	>
		<span class="icon-circle">
			<ArrowSquareOutIcon size={24} />
		</span>
	</a>
</div>

<style>
	.action-sidebar {
		position: absolute;
		right: var(--space-lg);
		bottom: calc(var(--bottom-nav-height, 64px) + 92px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-lg);
		z-index: 5;
		transition: opacity 0.3s ease;
	}

	.action-sidebar.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.sidebar-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: var(--reel-text);
		cursor: pointer;
		padding: 0;
		min-width: 44px;
		justify-content: center;
		text-decoration: none;
	}

	.icon-circle {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		background: var(--reel-icon-circle-bg);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		transition: background 0.15s ease;
	}

	.sidebar-btn:active .icon-circle {
		background: var(--reel-icon-circle-active);
		transform: scale(0.93);
	}

	.icon-circle :global(svg) {
		width: 24px;
		height: 24px;
		filter: drop-shadow(0 1px 2px var(--reel-icon-shadow));
	}

	.reaction-emoji {
		font-size: 22px;
		line-height: 1;
		user-select: none;
		pointer-events: none;
	}

	.sidebar-btn.active .icon-circle {
		background: color-mix(in srgb, var(--accent-magenta) 20%, transparent);
	}

	.sidebar-btn.active {
		color: var(--accent-magenta);
	}

	.sidebar-btn.disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.sidebar-btn.disabled .icon-circle {
		background: var(--reel-icon-circle-bg);
	}

	.sidebar-btn.disabled:active .icon-circle {
		transform: none;
	}

	.unread-badge {
		position: absolute;
		top: -2px;
		right: -2px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--accent-magenta);
		color: var(--reel-text);
		font-size: 0.5625rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.sidebar-count {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--reel-text);
		text-shadow: 0 1px 3px var(--reel-text-shadow);
	}

	.icon-circle.pop {
		animation: icon-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes icon-pop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.3);
		}
		100% {
			transform: scale(1);
		}
	}

	.unread-badge {
		animation: badge-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes badge-pop {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}
</style>

<script lang="ts">
	const {
		username,
		avatarPath = null,
		expanded = false,
		ontap
	}: {
		username: string;
		avatarPath?: string | null;
		expanded?: boolean;
		ontap: () => void;
	} = $props();

	const initials = $derived(username.replace('@', '').slice(0, 2).toUpperCase());

	/** Deterministic hue from username — same user always gets the same ring color */
	const userHue = $derived.by(() => {
		let h = 0;
		for (let i = 0; i < username.length; i++) {
			h = (h * 31 + username.charCodeAt(i)) | 0;
		}
		return ((h % 360) + 360) % 360;
	});

	const ringColor = $derived(`hsl(${userHue}, 70%, 55%)`);
	const pillBg = $derived(`hsl(${userHue}, 50%, 20%)`);
	const fallbackBg = $derived(`hsl(${userHue}, 45%, 25%)`);
</script>

<button
	class="contributor-pill"
	class:expanded
	style:--pill-bg={pillBg}
	onclick={(e) => {
		e.stopPropagation();
		ontap();
	}}
	onpointerdown={(e) => e.stopPropagation()}
	ontouchstart={(e) => e.stopPropagation()}
	ontouchmove={(e) => e.stopPropagation()}
	ontouchend={(e) => e.stopPropagation()}
>
	<span class="pill-avatar-ring" style:background={ringColor}>
		{#if avatarPath}
			<img src="/api/profile/avatar/{avatarPath}" alt="" class="pill-avatar" />
		{:else}
			<span class="pill-avatar pill-avatar-fallback" style:background={fallbackBg}>{initials}</span>
		{/if}
	</span>
	<span class="pill-name">{username}</span>
</button>

<style>
	.contributor-pill {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 2px;
		background: color-mix(in srgb, var(--pill-bg) 55%, rgba(0, 0, 0, 0.55));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-full);
		cursor: pointer;
		min-height: 34px;
		overflow: hidden;
		transition:
			transform 0.15s ease,
			box-shadow 0.3s ease;
		animation: pill-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}

	@keyframes pill-enter {
		from {
			opacity: 0;
			transform: scale(0.7) translateX(-8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateX(0);
		}
	}

	.contributor-pill:active {
		transform: scale(0.93);
	}

	.contributor-pill.expanded {
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
	}

	.pill-avatar-ring {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-full);
		/* color set via inline style per-user */
		padding: 1.5px;
		flex-shrink: 0;
	}

	.pill-avatar {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-full);
		object-fit: cover;
		display: block;
	}

	.pill-avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		/* background set via inline style per-user */
		color: var(--reel-text);
		font-family: var(--font-display);
		font-size: 0.6875rem;
		font-weight: 700;
	}

	.pill-name {
		font-family: var(--font-display);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--reel-text);
		text-shadow: 0 1px 4px var(--reel-text-shadow);
		white-space: nowrap;
		overflow: hidden;
		max-width: 0;
		padding-right: 0;
		opacity: 0;
		transition:
			max-width 0.4s cubic-bezier(0.32, 0.72, 0, 1),
			padding 0.4s cubic-bezier(0.32, 0.72, 0, 1),
			opacity 0.3s ease;
	}

	.expanded .pill-name {
		max-width: 150px;
		padding-right: 10px;
		padding-left: 11px;
		opacity: 1;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import iconSvg from '$lib/assets/icon.svg?raw';

	const { data } = $props();
	let loading = $state(false);
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});
</script>

<svelte:head>
	<title>Join {data.groupName} — scrolly</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Unbounded:wght@800;900&family=Space+Mono:wght@400;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="join-page" class:mounted>
	<div class="bg-noise"></div>

	<div class="content">
		<div class="brand">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted local SVG asset -->
			<div class="brand-logo" aria-label="scrolly">{@html iconSvg}</div>
			<h1>scrolly</h1>
			<p class="tagline">your crew's <span class="tagline-accent">private</span> feed</p>
		</div>

		<div class="form-card">
			<p class="invite-text">You've been invited to</p>
			<p class="group-name">{data.groupName}</p>

			<form method="POST" onsubmit={() => (loading = true)}>
				<button type="submit" class="btn-primary" disabled={loading}>
					{#if loading}
						<span class="spinner"></span>
						Joining...
					{:else}
						Join Group
					{/if}
				</button>
			</form>
		</div>
	</div>

	<p class="footer-note">a private place to share videos with your people.</p>
</div>

<style>
	.join-page {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--space-xl);
		padding-bottom: calc(var(--space-xl) + 72px);
		background: var(--bg-primary);
		overflow-y: auto;
	}

	.bg-noise {
		position: absolute;
		inset: 0;
		opacity: 0.04;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 256px 256px;
	}

	.content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 380px;
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 0.6s ease,
			transform 0.6s ease;
	}

	.mounted .content {
		opacity: 1;
		transform: translateY(0);
	}

	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: var(--space-3xl);
	}

	.brand-logo {
		width: 72px;
		height: 72px;
		margin-bottom: var(--space-lg);
		color: var(--accent-primary);
	}

	.brand-logo :global(svg) {
		width: 100%;
		height: 100%;
	}

	h1 {
		font-family: 'Unbounded', var(--font-display), sans-serif;
		font-size: 2.75rem;
		font-weight: 900;
		letter-spacing: -0.02em;
		line-height: 1;
		margin: 0;
		color: var(--text-primary);
		text-transform: lowercase;
	}

	.tagline {
		font-family: 'Space Mono', monospace;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--text-muted);
		margin: var(--space-md) 0 0;
		letter-spacing: 0.02em;
	}

	.tagline-accent {
		color: var(--accent-primary);
		font-weight: 700;
	}

	.form-card {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.invite-text {
		font-size: 0.9375rem;
		color: var(--text-secondary);
		margin: 0 0 var(--space-sm);
		text-align: center;
	}

	.group-name {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent-primary);
		margin: 0 0 var(--space-xl);
		text-align: center;
	}

	form {
		width: 100%;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 1rem;
		font-weight: 700;
		font-family: var(--font-display);
		cursor: pointer;
		transition:
			transform 0.1s ease,
			opacity 0.2s ease;
	}

	.btn-primary:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn-primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid color-mix(in srgb, var(--bg-primary) 20%, transparent);
		border-top-color: var(--bg-primary);
		border-radius: var(--radius-full);
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.footer-note {
		position: relative;
		z-index: 1;
		margin-top: var(--space-3xl);
		font-family: 'Space Mono', monospace;
		font-size: 0.6875rem;
		color: var(--text-muted);
		text-align: center;
		letter-spacing: 0.03em;
	}
</style>

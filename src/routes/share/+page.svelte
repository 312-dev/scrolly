<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		isSupportedUrl,
		platformLabel,
		detectPlatform,
		isPlatformAllowed
	} from '$lib/url-validation';
	import { addToast } from '$lib/stores/toasts';
	import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import ExportIcon from 'phosphor-svelte/lib/ExportIcon';

	const shareUrl = $derived(page.data.shareUrl as string);
	const platform = $derived(platformLabel(shareUrl));
	const isValid = $derived(isSupportedUrl(shareUrl));
	const detectedPlatform = $derived(shareUrl ? detectPlatform(shareUrl) : null);
	const platformFilterMode = $derived((page.data.group?.platformFilterMode as string) ?? 'all');
	const platformFilterList = $derived<string[] | null>(
		page.data.group?.platformFilterList
			? JSON.parse(page.data.group.platformFilterList as string)
			: null
	);
	const platformAllowed = $derived(
		detectedPlatform
			? isPlatformAllowed(detectedPlatform, platformFilterMode, platformFilterList)
			: true
	);

	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let clipId = $state('');
	let contentType = $state('');
	let autoSubmitted = $state(false);

	$effect(() => {
		if (isValid && platformAllowed && !autoSubmitted) {
			autoSubmitted = true;
			handleSubmit();
		}
	});

	async function handleSubmit() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/clips', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: shareUrl })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error || 'Failed to add clip';
				return;
			}
			clipId = data.clip.id;
			contentType = data.clip.contentType ?? 'video';
			success = true;
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	function openFeed() {
		if (clipId) {
			const label = contentType === 'music' ? 'song' : 'video';
			addToast({
				type: 'processing',
				message: `Adding ${label} to feed...`,
				clipId,
				contentType,
				autoDismiss: 0
			});
		}
		goto(resolve('/'));
	}
</script>

<svelte:head>
	<title>Share to scrolly</title>
</svelte:head>

<div class="share-page">
	<div class="share-card">
		{#if !isValid}
			<div class="icon-wrap error">
				<XCircleIcon size={28} />
			</div>
			<h1 class="share-title">Unsupported link</h1>
			<p class="share-desc">This URL isn't from a supported platform.</p>
			<p class="share-url">{shareUrl}</p>
			<a href={resolve('/')} class="btn-secondary">Go to feed</a>
		{:else if !platformAllowed}
			<div class="icon-wrap error">
				<ProhibitIcon size={28} />
			</div>
			<h1 class="share-title">Platform not allowed</h1>
			<p class="share-desc">{platform} links aren't allowed in this group.</p>
			<p class="share-url">{shareUrl}</p>
			<a href={resolve('/')} class="btn-secondary">Go to feed</a>
		{:else if success}
			<div class="icon-wrap success">
				<CheckIcon size={28} weight="bold" />
			</div>
			<h1 class="share-title">Added!</h1>
			<p class="share-desc">Your clip is downloading.</p>
			<button class="btn-primary" onclick={openFeed}>Open Scrolly</button>
		{:else if loading}
			<div class="icon-wrap">
				<ExportIcon size={28} />
			</div>
			<h1 class="share-title">Adding to feed…</h1>
			{#if platform}
				<span class="platform-pill">{platform}</span>
			{/if}
			<p class="share-url">{shareUrl}</p>
		{:else if error}
			<div class="icon-wrap err">
				<XCircleIcon size={28} />
			</div>
			<h1 class="share-title">Couldn't add clip</h1>
			<p class="share-error">{error}</p>
			{#if platform}
				<span class="platform-pill">{platform}</span>
			{/if}
			<p class="share-url">{shareUrl}</p>
			<button class="btn-primary" onclick={handleSubmit} disabled={loading}>Try again</button>
			<a href={resolve('/')} class="btn-ghost">Cancel</a>
		{/if}
	</div>
</div>

<style>
	.share-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--space-xl);
		background: var(--bg-primary);
	}

	.share-card {
		width: 100%;
		max-width: 380px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-sm);
	}

	.icon-wrap {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--space-sm);
		color: var(--accent-primary);
	}

	.icon-wrap.success {
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		animation: pop 0.3s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.icon-wrap.error,
	.icon-wrap.err {
		background: color-mix(in srgb, var(--error) 12%, transparent);
		color: var(--error);
	}

	.share-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.share-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: 0;
	}

	.platform-pill {
		display: inline-flex;
		padding: 3px var(--space-sm);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		color: var(--accent-primary);
		border-radius: var(--radius-full);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.share-url {
		font-size: 0.75rem;
		color: var(--text-muted);
		word-break: break-all;
		line-height: 1.4;
		margin: 0;
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-surface);
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.share-error {
		font-size: 0.8125rem;
		color: var(--error);
		margin: 0;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		justify-content: center;
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
		transition: transform 0.1s ease;
		margin-top: var(--space-sm);
	}

	.btn-primary:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn-primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-ghost {
		background: transparent;
		color: var(--text-secondary);
		border: none;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		padding: var(--space-sm);
		text-decoration: none;
	}

	.btn-secondary {
		display: inline-flex;
		padding: var(--space-sm) var(--space-xl);
		background: var(--bg-surface);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		margin-top: var(--space-sm);
	}

	@keyframes pop {
		from {
			transform: scale(0.8);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>

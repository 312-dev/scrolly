<script lang="ts">
	import { onDestroy } from 'svelte';
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
	import MusicTrimModal from '$lib/components/MusicTrimModal.svelte';
	import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
	import ProhibitIcon from 'phosphor-svelte/lib/ProhibitIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import ExportIcon from 'phosphor-svelte/lib/ExportIcon';
	import ScissorsIcon from 'phosphor-svelte/lib/ScissorsIcon';

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
	const source = $derived(page.data.source as string | null);
	const shortcutError = $derived(page.data.shortcutError as string | undefined);
	const isShortcut = $derived(source === 'shortcut');
	const isIOS = $derived(
		typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
	);
	const closeText = $derived(
		isIOS ? 'Tap the ✕ in the top left to close this window.' : 'Tap Done to close this window.'
	);

	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let clipId = $state('');
	let contentType = $state('');
	let autoSubmitted = $state(false);
	let polling = $state(false);
	let showTrimPrompt = $state(false);
	let showTrimModal = $state(false);
	let serverArtist = $state<string | null>(null);
	let serverAlbumArt = $state<string | null>(null);
	let serverAudioPath = $state<string | null>(null);
	let serverDuration = $state<number | null>(null);
	let serverTitle = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pingTimer: ReturnType<typeof setInterval> | null = null;

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (pingTimer) clearInterval(pingTimer);
	});

	$effect(() => {
		if (isValid && platformAllowed && !autoSubmitted) {
			// Guard against iOS web view double-loads (SFSafariViewController can reload after initial render)
			const key = `share_submitted:${shareUrl}`;
			if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
				autoSubmitted = true;
				success = true;
				return;
			}
			autoSubmitted = true;
			if (typeof sessionStorage !== 'undefined') {
				sessionStorage.setItem(key, '1');
			}
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
				if (res.status === 409 && data.addedBy === page.data.user?.id) {
					// Same user double-submitted — treat as success (iOS web view reload)
					success = true;
					return;
				}
				error = data.error || 'Failed to add clip';
				return;
			}
			clipId = data.clip.id;
			contentType = data.clip.contentType ?? 'video';

			if (contentType === 'music') {
				// Start polling for music clips — wait for download + trim opportunity
				polling = true;
				startPolling();
			} else {
				success = true;
			}
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	function stopPolling() {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
		polling = false;
	}

	function handlePollData(data: Record<string, unknown>) {
		if (data.artist) serverArtist = data.artist as string;
		if (data.albumArt) serverAlbumArt = data.albumArt as string;
		if (data.audioPath) serverAudioPath = data.audioPath as string;
		if (data.durationSeconds !== null && data.durationSeconds !== undefined)
			serverDuration = data.durationSeconds as number;
		if (data.title) serverTitle = data.title as string;
		if (data.status === 'pending_trim') {
			stopPolling();
			showTrimPrompt = true;
			startPinging();
		} else if (data.status === 'ready') {
			stopPolling();
			success = true;
		} else if (data.status === 'failed') {
			stopPolling();
			error = 'Download failed';
		}
	}

	function startPolling() {
		pollTimer = setInterval(async () => {
			try {
				const res = await fetch(`/api/clips/${clipId}`);
				if (!res.ok) return;
				handlePollData(await res.json());
			} catch {
				/* keep polling */
			}
		}, 3000);
	}

	const sendPing = () => fetch(`/api/clips/${clipId}/ping`, { method: 'POST' }).catch(() => {});
	function startPinging() {
		sendPing();
		pingTimer = setInterval(sendPing, 10_000);
	}
	function stopPinging() {
		if (pingTimer) clearInterval(pingTimer);
		pingTimer = null;
	}

	function openFeed() {
		if (clipId) {
			addToast({
				type: 'processing',
				message: `Adding ${contentType === 'music' ? 'song' : 'video'} to feed...`,
				clipId,
				contentType,
				autoDismiss: 0
			});
		}
		goto(resolve('/'));
	}

	async function handleSkipTrim() {
		stopPinging();
		showTrimPrompt = false;
		try {
			await fetch(`/api/clips/${clipId}/publish`, { method: 'POST' });
		} catch {
			// Server auto-publishes if pings stop
		}
		success = true;
	}

	function handleTrimComplete() {
		stopPinging();
		showTrimModal = false;
		showTrimPrompt = false;
		success = true;
	}
</script>

<svelte:head>
	<title>Share to scrolly</title>
</svelte:head>

<div class="share-page">
	<div class="share-card">
		{#if shortcutError}
			<div class="icon-wrap error">
				<XCircleIcon size={28} />
			</div>
			<h1 class="share-title">Couldn't share</h1>
			<p class="share-error">{shortcutError}</p>
			<p class="share-desc">{closeText}</p>
		{:else if !isValid}
			<div class="icon-wrap error">
				<XCircleIcon size={28} />
			</div>
			<h1 class="share-title">Unsupported link</h1>
			<p class="share-desc">This URL isn't from a supported platform.</p>
			<p class="share-url">{shareUrl}</p>
			{#if isShortcut}
				<p class="share-desc">{closeText}</p>
			{:else}
				<a href={resolve('/')} class="btn-secondary">Go to feed</a>
			{/if}
		{:else if !platformAllowed}
			<div class="icon-wrap error">
				<ProhibitIcon size={28} />
			</div>
			<h1 class="share-title">Platform not allowed</h1>
			<p class="share-desc">{platform} links aren't allowed in this group.</p>
			<p class="share-url">{shareUrl}</p>
			{#if isShortcut}
				<p class="share-desc">{closeText}</p>
			{:else}
				<a href={resolve('/')} class="btn-secondary">Go to feed</a>
			{/if}
		{:else if success}
			<div class="icon-wrap success">
				<CheckIcon size={28} weight="bold" />
			</div>
			<h1 class="share-title">Added!</h1>
			{#if isShortcut}
				<p class="share-desc">Your clip is downloading. {closeText}</p>
			{:else}
				<p class="share-desc">You can close this anytime. We'll handle the rest.</p>
				<button class="btn-primary" onclick={openFeed}>Open Scrolly</button>
			{/if}
		{:else if showTrimPrompt}
			<div class="icon-wrap trim">
				<ScissorsIcon size={28} weight="bold" />
			</div>
			<h1 class="share-title">Trim your song?</h1>
			{#if serverTitle || serverArtist}
				<div class="song-card">
					{#if serverAlbumArt}
						<img class="song-art" src={serverAlbumArt} alt="" />
					{/if}
					<div class="song-info">
						{#if serverTitle}<span class="song-title">{serverTitle}</span>{/if}
						{#if serverArtist}<span class="song-artist">{serverArtist}</span>{/if}
					</div>
				</div>
			{/if}
			<p class="share-desc">Pick your favorite part before sharing</p>
			<button class="btn-primary" onclick={() => (showTrimModal = true)}
				><ScissorsIcon size={18} weight="bold" /> Trim</button
			>
			<button class="btn-ghost" onclick={handleSkipTrim}>Skip — publish full song</button>
		{:else if polling}
			<div class="icon-wrap">
				<ExportIcon size={28} />
			</div>
			<h1 class="share-title">Finding song...</h1>
			{#if platform}
				<span class="platform-pill">{platform}</span>
			{/if}
			<p class="share-desc">Close anytime, or hang tight to trim it.</p>
			<button class="btn-primary" disabled><span class="spinner"></span> Trim</button>
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
			{#if isShortcut}
				<p class="share-desc">Or {closeText.toLowerCase()}</p>
			{:else}
				<a href={resolve('/')} class="btn-ghost">Cancel</a>
			{/if}
		{/if}
	</div>
</div>

{#if showTrimModal && serverAudioPath}
	<MusicTrimModal
		{clipId}
		audioPath={serverAudioPath}
		durationSeconds={serverDuration}
		albumArt={serverAlbumArt}
		artist={serverArtist}
		title={serverTitle}
		ondismiss={() => {
			showTrimModal = false;
			handleSkipTrim();
		}}
		ontrimcomplete={handleTrimComplete}
	/>
{/if}

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
	.icon-wrap.success,
	.icon-wrap.trim {
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
	.song-card {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		background: var(--bg-surface);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		width: 100%;
		text-align: left;
	}
	.song-art {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-sm);
		object-fit: cover;
		flex-shrink: 0;
	}
	.song-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.song-title,
	.song-artist {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.song-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.song-artist {
		font-size: 0.8125rem;
		color: var(--text-secondary);
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
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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

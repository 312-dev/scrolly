<script lang="ts">
	import { onDestroy } from 'svelte';
	import { untrack } from 'svelte';
	import { createSafeTimeout } from '$lib/safeTimeout';
	import AddVideo from './AddVideo.svelte';
	import UploadStatus from './UploadStatus.svelte';
	import MusicTrimModal from './MusicTrimModal.svelte';
	import BaseSheet from './BaseSheet.svelte';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { addToast, toasts, clipReadySignal, clipOverlaySignal } from '$lib/stores/toasts';
	import { dismissShortcutNudge } from '$lib/stores/shortcutNudge';
	import { groupMembers } from '$lib/stores/members';

	const { ondismiss, initialUrl }: { ondismiss: () => void; initialUrl?: string } = $props();

	let phase = $state<'form' | 'uploading' | 'trim_prompt' | 'done' | 'failed'>('form');
	let clipId = $state('');
	let clipContentType = $state('');
	let serverArtist = $state<string | null>(null);
	let serverAlbumArt = $state<string | null>(null);
	let serverAudioPath = $state<string | null>(null);
	let serverDuration = $state<number | null>(null);
	let serverTitle = $state<string | null>(null);
	let showTrimModal = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pingTimer: ReturnType<typeof setInterval> | null = null;
	let addVideoRef = $state<ReturnType<typeof AddVideo> | null>(null);
	let sheetRef = $state<ReturnType<typeof BaseSheet> | null>(null);

	const { safeTimeout, clearAll } = createSafeTimeout();

	// Focus URL input after sheet animates in
	$effect(() => {
		if (untrack(() => phase) === 'form') {
			safeTimeout(() => addVideoRef?.focus(), 350);
		}
	});

	// Clean up timers on unmount
	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (pingTimer) clearInterval(pingTimer);
		clearAll();
	});

	function handleSubmitted(clip: { id: string; status: string; contentType: string }) {
		clipId = clip.id;
		clipContentType = clip.contentType;
		// Remove the processing toast AddVideo created — UploadStatus screen takes over
		toasts.update((t) => t.filter((item) => item.clipId !== clip.id));
		phase = 'uploading';
		startPolling();
	}

	function stopPolling() {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
	}

	function startPinging() {
		sendPing();
		pingTimer = setInterval(sendPing, 10_000);
	}

	function stopPinging() {
		if (pingTimer) clearInterval(pingTimer);
		pingTimer = null;
	}

	async function sendPing() {
		try {
			await fetch(`/api/clips/${clipId}/ping`, { method: 'POST' });
		} catch {
			// Best-effort — server auto-publishes if pings stop
		}
	}

	function handlePollData(data: Record<string, unknown>) {
		if (data.artist) serverArtist = data.artist as string;
		if (data.albumArt) serverAlbumArt = data.albumArt as string;
		if (data.audioPath) serverAudioPath = data.audioPath as string;
		if (data.durationSeconds !== null && data.durationSeconds !== undefined)
			serverDuration = data.durationSeconds as number;
		if (data.title) serverTitle = data.title as string;

		if (data.status === 'pending_trim' && data.contentType === 'music') {
			stopPolling();
			phase = 'trim_prompt';
			startPinging();
		} else if (data.status === 'ready') {
			stopPolling();
			phase = 'done';
		} else if (data.status === 'failed') {
			stopPolling();
			phase = 'failed';
		}
	}

	function startPolling() {
		pollTimer = setInterval(async () => {
			try {
				const res = await fetch(`/api/clips/${clipId}`);
				if (!res.ok) return;
				handlePollData(await res.json());
			} catch {
				// Network error, keep polling
			}
		}, 3000);
	}

	async function handleRetry() {
		phase = 'uploading';
		try {
			const res = await fetch(`/api/clips/${clipId}/retry`, { method: 'POST' });
			if (res.ok) {
				startPolling();
			} else {
				phase = 'failed';
			}
		} catch {
			phase = 'failed';
		}
	}

	function dismiss() {
		stopPinging();
		// If still uploading or waiting for trim, push a background toast
		if (phase === 'uploading' || phase === 'trim_prompt') {
			addToast({
				type: 'processing',
				message: `Adding ${clipContentType === 'music' ? 'song' : 'video'} to feed...`,
				clipId,
				contentType: clipContentType,
				autoDismiss: 0
			});
		}
		sheetRef?.dismiss();
	}

	async function handleSaveAndView() {
		clipReadySignal.set(clipId);
		clipOverlaySignal.set(clipId);
		sheetRef?.dismiss();
	}

	function handleDismissNudge() {
		dismissShortcutNudge();
		sheetRef?.dismiss();
	}

	function handleOpenTrim() {
		showTrimModal = true;
	}

	async function handleSkipTrim() {
		stopPinging();
		try {
			await fetch(`/api/clips/${clipId}/publish`, { method: 'POST' });
		} catch {
			// Server auto-publishes if pings stop
		}
		phase = 'done';
	}

	function handleTrimComplete() {
		stopPinging();
		showTrimModal = false;
		phase = 'done';
	}

	function handleTrimDismiss() {
		showTrimModal = false;
		// User cancelled trim — skip and publish full song
		handleSkipTrim();
	}
</script>

<div class="add-video-wrapper" class:fullscreen={phase !== 'form'}>
	<BaseSheet bind:this={sheetRef} sheetId="addVideo" {ondismiss}>
		{#snippet header()}
			{#if phase === 'form'}
				<div class="add-header">
					<span class="add-title">Add to feed</span>
					<button class="close-btn" onclick={dismiss} aria-label="Close">
						<XIcon size={18} />
					</button>
				</div>
			{/if}
		{/snippet}

		{#if phase === 'form'}
			<div class="sheet-body">
				<AddVideo
					bind:this={addVideoRef}
					onsubmitted={handleSubmitted}
					{initialUrl}
					members={$groupMembers}
				/>
			</div>
		{:else}
			<UploadStatus
				{phase}
				{clipContentType}
				{serverTitle}
				{serverArtist}
				{serverAlbumArt}
				ondismiss={dismiss}
				onretry={handleRetry}
				onsaveandview={handleSaveAndView}
				ondismissnudge={handleDismissNudge}
				ontrim={handleOpenTrim}
				onskiptrim={handleSkipTrim}
			/>
		{/if}
	</BaseSheet>
</div>

{#if showTrimModal && serverAudioPath}
	<MusicTrimModal
		{clipId}
		audioPath={serverAudioPath}
		durationSeconds={serverDuration}
		albumArt={serverAlbumArt}
		artist={serverArtist}
		title={serverTitle}
		ondismiss={handleTrimDismiss}
		ontrimcomplete={handleTrimComplete}
	/>
{/if}

<style>
	/* Override BaseSheet styles for add-video look */
	.add-video-wrapper :global(.base-sheet) {
		max-height: 80vh;
		transition:
			transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
			height 400ms cubic-bezier(0.32, 0.72, 0, 1),
			border-radius 400ms ease;
	}
	.add-video-wrapper.fullscreen :global(.base-sheet) {
		top: 0;
		max-height: none;
		border-radius: 0;
		background: var(--bg-primary);
	}

	.add-header {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
		position: relative;
	}
	.add-title {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
	}
	.close-btn {
		position: absolute;
		right: var(--space-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: background 0.2s ease;
	}
	.close-btn:active {
		background: var(--bg-subtle);
	}

	.sheet-body {
		padding-bottom: max(var(--space-lg), env(safe-area-inset-bottom));
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
</style>

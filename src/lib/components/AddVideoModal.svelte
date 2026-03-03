<script lang="ts">
	import { onDestroy } from 'svelte';
	import { untrack } from 'svelte';
	import { createSafeTimeout } from '$lib/safeTimeout';
	import AddVideo from './AddVideo.svelte';
	import UploadStatus from './UploadStatus.svelte';
	import BaseSheet from './BaseSheet.svelte';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { addToast, toasts, clipReadySignal, clipOverlaySignal } from '$lib/stores/toasts';
	import { dismissShortcutNudge } from '$lib/stores/shortcutNudge';
	import { groupMembers } from '$lib/stores/members';

	const { ondismiss, initialUrl }: { ondismiss: () => void; initialUrl?: string } = $props();

	let phase = $state<'form' | 'uploading' | 'done' | 'failed'>('form');
	let clipId = $state('');
	let clipContentType = $state('');
	let serverArtist = $state<string | null>(null);
	let serverAlbumArt = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let addVideoRef = $state<ReturnType<typeof AddVideo> | null>(null);
	let sheetRef = $state<ReturnType<typeof BaseSheet> | null>(null);

	const { safeTimeout, clearAll } = createSafeTimeout();

	// Focus URL input after sheet animates in
	$effect(() => {
		if (untrack(() => phase) === 'form') {
			safeTimeout(() => addVideoRef?.focus(), 350);
		}
	});

	// Clean up poll timer on unmount
	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
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

	function startPolling() {
		pollTimer = setInterval(async () => {
			try {
				const res = await fetch(`/api/clips/${clipId}`);
				if (!res.ok) return;
				const data = await res.json();

				if (data.artist) serverArtist = data.artist;
				if (data.albumArt) serverAlbumArt = data.albumArt;

				if (data.status === 'ready') {
					if (pollTimer) clearInterval(pollTimer);
					pollTimer = null;
					phase = 'done';
				} else if (data.status === 'failed') {
					if (pollTimer) clearInterval(pollTimer);
					pollTimer = null;
					phase = 'failed';
				}
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
		// If still uploading, push a background toast
		if (phase === 'uploading') {
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
				{serverArtist}
				{serverAlbumArt}
				ondismiss={dismiss}
				onretry={handleRetry}
				onsaveandview={handleSaveAndView}
				ondismissnudge={handleDismissNudge}
			/>
		{/if}
	</BaseSheet>
</div>

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

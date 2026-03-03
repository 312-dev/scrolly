<script lang="ts">
	import { pushState, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { basename } from '$lib/utils';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import TrimWaveform from './TrimWaveform.svelte';

	const {
		clipId,
		audioPath,
		durationSeconds: durationProp = null,
		albumArt,
		artist,
		title,
		ondismiss,
		ontrimcomplete
	}: {
		clipId: string;
		audioPath: string;
		durationSeconds?: number | null;
		albumArt: string | null;
		artist: string | null;
		title: string | null;
		ondismiss: () => void;
		ontrimcomplete: () => void;
	} = $props();

	let visible = $state(false);
	let saving = $state(false);
	let playing = $state(false);
	let currentTime = $state(0);
	let audioEl = $state<HTMLAudioElement | null>(null);
	let waveformPeaks = $state<number[] | null>(null);
	let waveformLoading = $state(true);
	let closedViaBack = false;
	let detectedDuration = $state<number | null>(null);

	beforeNavigate(() => {
		closedViaBack = true;
	});

	const durationSeconds = $derived(durationProp ?? detectedDuration ?? 0);

	let startTime = $state(0);
	let endTime = $state(0);

	const selectedDuration = $derived(endTime - startTime);
	const audioSrc = `/api/videos/${basename(audioPath)}`;

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// Initialize modal + history state
	$effect(() => {
		requestAnimationFrame(() => {
			visible = true;
		});
		document.body.style.overflow = 'hidden';

		pushState('', { sheet: 'musicTrim' });
		const handlePopState = () => {
			setTimeout(() => {
				if (page.state?.sheet === 'musicTrim') return;
				closedViaBack = true;
				ondismiss();
			}, 0);
		};
		const handleBeforeUnload = () => {
			closedViaBack = true;
		};
		window.addEventListener('popstate', handlePopState);
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('popstate', handlePopState);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			if (!closedViaBack) history.back();
		};
	});

	// Fetch waveform data
	$effect(() => {
		fetch(`/api/clips/${clipId}/waveform`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.peaks) waveformPeaks = data.peaks;
			})
			.catch(() => {})
			.finally(() => {
				waveformLoading = false;
			});
	});

	// Detect duration from audio element
	$effect(() => {
		if (!audioEl) return;
		const handleLoaded = () => {
			if (audioEl && isFinite(audioEl.duration)) detectedDuration = audioEl.duration;
		};
		if (audioEl.duration && isFinite(audioEl.duration)) detectedDuration = audioEl.duration;
		audioEl.addEventListener('loadedmetadata', handleLoaded);
		return () => {
			audioEl?.removeEventListener('loadedmetadata', handleLoaded);
		};
	});

	// Initialize endTime when duration becomes known
	$effect(() => {
		if (durationSeconds > 0 && endTime === 0) endTime = Math.min(durationSeconds, 60);
	});

	// Loop audio within selected range
	$effect(() => {
		if (!audioEl) return;
		const handleTimeUpdate = () => {
			if (!audioEl) return;
			currentTime = audioEl.currentTime;
			if (audioEl.currentTime >= endTime) audioEl.currentTime = startTime;
		};
		const handlePlay = () => {
			playing = true;
		};
		const handlePause = () => {
			playing = false;
		};
		audioEl.addEventListener('timeupdate', handleTimeUpdate);
		audioEl.addEventListener('play', handlePlay);
		audioEl.addEventListener('pause', handlePause);
		return () => {
			audioEl?.removeEventListener('timeupdate', handleTimeUpdate);
			audioEl?.removeEventListener('play', handlePlay);
			audioEl?.removeEventListener('pause', handlePause);
		};
	});

	function togglePlayback() {
		if (!audioEl) return;
		if (playing) {
			audioEl.pause();
		} else {
			if (audioEl.currentTime < startTime || audioEl.currentTime >= endTime) {
				audioEl.currentTime = startTime;
			}
			audioEl.play();
		}
	}

	function handleSeek(time: number) {
		if (audioEl) audioEl.currentTime = time;
	}

	function dismiss() {
		visible = false;
		setTimeout(() => ondismiss(), 300);
	}

	async function handleSave() {
		if (saving) return;
		saving = true;
		audioEl?.pause();
		try {
			const res = await fetch(`/api/clips/${clipId}/trim`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					startSeconds: Math.round(startTime * 10) / 10,
					endSeconds: Math.round(endTime * 10) / 10
				})
			});
			if (res.ok) ontrimcomplete();
		} finally {
			saving = false;
		}
	}
</script>

<div class="overlay" class:visible onclick={dismiss} role="presentation"></div>

<div class="modal" class:visible>
	{#if albumArt}
		<div class="album-bg" style="background-image: url({albumArt})"></div>
	{/if}

	<div class="modal-content">
		<div class="trim-header">
			<button class="header-btn cancel" onclick={dismiss}>Cancel</button>
			<span class="header-title">Trim</span>
			<button class="header-btn save" onclick={handleSave} disabled={saving}>
				{#if saving}
					<SpinnerGapIcon size={16} class="spin" />
					Saving
				{:else}
					Save
				{/if}
			</button>
		</div>

		<div class="trim-info">
			{#if title}
				<p class="song-title">{title}</p>
			{/if}
			{#if artist}
				<p class="song-artist">{artist}</p>
			{/if}
		</div>

		<div class="trim-body">
			<TrimWaveform
				peaks={waveformPeaks}
				loading={waveformLoading}
				{durationSeconds}
				bind:startTime
				bind:endTime
				{currentTime}
				{playing}
				onseek={handleSeek}
			/>

			<div class="time-labels">
				<span class="time-label">{formatTime(startTime)}</span>
				<span class="time-duration">{formatTime(selectedDuration)}</span>
				<span class="time-label">{formatTime(endTime)}</span>
			</div>

			<button class="play-btn" onclick={togglePlayback}>
				{#if playing}
					<PauseIcon size={28} weight="fill" />
				{:else}
					<PlayIcon size={28} weight="fill" />
				{/if}
			</button>
		</div>

		<audio bind:this={audioEl} src={audioSrc} preload="auto"></audio>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		z-index: 99;
		opacity: 0;
		transition: opacity 300ms ease;
	}
	.overlay.visible {
		opacity: 1;
	}
	.modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100dvh;
		z-index: 100;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
		opacity: 0;
		transition: opacity 300ms ease;
		overflow: hidden;
	}
	.modal.visible {
		opacity: 1;
	}
	.album-bg {
		position: absolute;
		inset: -40px;
		background-size: cover;
		background-position: center;
		filter: blur(40px) brightness(0.15);
		z-index: 0;
	}
	.modal-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.trim-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		padding-top: max(var(--space-md), env(safe-area-inset-top));
		flex-shrink: 0;
	}
	.header-title {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	.header-btn {
		border: none;
		background: none;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		padding: var(--space-sm) var(--space-xs);
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.header-btn.cancel {
		color: var(--text-secondary);
	}
	.header-btn.save {
		color: var(--accent-primary);
	}
	.header-btn.save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.trim-info {
		text-align: center;
		padding: var(--space-lg) var(--space-xl) var(--space-sm);
		flex-shrink: 0;
	}
	.song-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.song-artist {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin: var(--space-xs) 0 0;
	}
	.trim-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
		padding-bottom: max(var(--space-2xl), env(safe-area-inset-bottom));
		gap: var(--space-xl);
	}
	.time-labels {
		display: flex;
		justify-content: space-between;
		width: 100%;
		padding: 0 var(--space-xs);
	}
	.time-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.time-duration {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--accent-primary);
		font-variant-numeric: tabular-nums;
	}
	.play-btn {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		border: none;
		color: var(--accent-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.play-btn:active {
		transform: scale(0.93);
	}
	.trim-header :global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

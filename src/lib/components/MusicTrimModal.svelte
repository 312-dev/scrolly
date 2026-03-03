<script lang="ts">
	import { pushState, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { basename } from '$lib/utils';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';

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

	const MIN_DURATION = 30;

	let visible = $state(false);
	let saving = $state(false);
	let playing = $state(false);
	let currentTime = $state(0);
	let audioEl = $state<HTMLAudioElement | null>(null);
	let waveformPeaks = $state<number[] | null>(null);
	let waveformLoading = $state(true);
	let closedViaBack = false;
	let detectedDuration = $state<number | null>(null);

	// Prevent history.back() in cleanup when a real navigation or reload occurs
	beforeNavigate(() => {
		closedViaBack = true;
	});

	const durationSeconds = $derived(durationProp ?? detectedDuration ?? 0);

	// Range state
	let startTime = $state(0);
	let endTime = $state(0);
	let dragging = $state<'start' | 'end' | null>(null);

	// Waveform container ref for position calculations
	let waveformContainer = $state<HTMLDivElement | null>(null);

	const selectedDuration = $derived(endTime - startTime);
	const audioSrc = `/api/videos/${basename(audioPath)}`;

	// Format seconds to M:SS
	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// Initialize modal
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

	// Detect duration from audio element when not provided by server
	$effect(() => {
		if (!audioEl) return;
		const handleLoaded = () => {
			if (audioEl && isFinite(audioEl.duration)) {
				detectedDuration = audioEl.duration;
			}
		};
		// May already be loaded
		if (audioEl.duration && isFinite(audioEl.duration)) {
			detectedDuration = audioEl.duration;
		}
		audioEl.addEventListener('loadedmetadata', handleLoaded);
		return () => {
			audioEl?.removeEventListener('loadedmetadata', handleLoaded);
		};
	});

	// Initialize endTime when duration becomes known
	$effect(() => {
		if (durationSeconds > 0 && endTime === 0) {
			endTime = Math.min(durationSeconds, 60);
		}
	});

	// Loop audio within selected range
	$effect(() => {
		if (!audioEl) return;

		const handleTimeUpdate = () => {
			if (!audioEl) return;
			currentTime = audioEl.currentTime;
			if (audioEl.currentTime >= endTime) {
				audioEl.currentTime = startTime;
			}
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

	// Pointer handling for range dragging
	function timeFromPointer(clientX: number): number {
		if (!waveformContainer) return 0;
		const rect = waveformContainer.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return ratio * durationSeconds;
	}

	function handlePointerDown(e: PointerEvent, handle: 'start' | 'end') {
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		dragging = handle;
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const time = timeFromPointer(e.clientX);

		if (dragging === 'start') {
			const maxStart = endTime - MIN_DURATION;
			startTime = Math.max(0, Math.min(maxStart, time));
			// Seek audio to new start point while dragging
			if (audioEl) {
				audioEl.currentTime = startTime;
			}
		} else {
			const minEnd = startTime + MIN_DURATION;
			endTime = Math.min(durationSeconds, Math.max(minEnd, time));
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!dragging) return;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		dragging = null;

		// Snap playback to start of range if outside
		if (audioEl && (audioEl.currentTime < startTime || audioEl.currentTime >= endTime)) {
			audioEl.currentTime = startTime;
		}
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

			if (res.ok) {
				ontrimcomplete();
			}
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
			<!-- Waveform / Timeline -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="waveform-wrapper"
				bind:this={waveformContainer}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
			>
				<!-- Selected range background -->
				<div
					class="range-bg"
					style="left: {(startTime / durationSeconds) * 100}%; width: {((endTime - startTime) /
						durationSeconds) *
						100}%"
				></div>

				<!-- Waveform bars -->
				{#if waveformPeaks && waveformPeaks.length > 0}
					<svg
						class="waveform-svg"
						viewBox="0 0 {waveformPeaks.length} 100"
						preserveAspectRatio="none"
					>
						{#each waveformPeaks as peak, i (i)}
							{@const time = (i / waveformPeaks.length) * durationSeconds}
							{@const inRange = time >= startTime && time <= endTime}
							{@const h = Math.max(4, peak * 80)}
							<rect
								x={i}
								y={50 - h / 2}
								width={0.6}
								height={h}
								rx={0.3}
								fill={inRange ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)'}
								opacity={inRange ? 1 : 0.6}
							/>
						{/each}
					</svg>
				{:else if !waveformLoading}
					<!-- Fallback: plain timeline bar -->
					<div class="fallback-timeline"></div>
				{/if}

				<!-- Playhead -->
				{#if playing || currentTime > 0}
					<div class="playhead" style="left: {(currentTime / durationSeconds) * 100}%"></div>
				{/if}

				<!-- Start handle -->
				<div
					class="handle handle-start"
					class:active={dragging === 'start'}
					style="left: {(startTime / durationSeconds) * 100}%"
					onpointerdown={(e) => handlePointerDown(e, 'start')}
					role="slider"
					aria-label="Trim start"
					aria-valuemin={0}
					aria-valuemax={durationSeconds}
					aria-valuenow={startTime}
					tabindex={0}
				>
					<div class="handle-line"></div>
				</div>

				<!-- End handle -->
				<div
					class="handle handle-end"
					class:active={dragging === 'end'}
					style="left: {(endTime / durationSeconds) * 100}%"
					onpointerdown={(e) => handlePointerDown(e, 'end')}
					role="slider"
					aria-label="Trim end"
					aria-valuemin={0}
					aria-valuemax={durationSeconds}
					aria-valuenow={endTime}
					tabindex={0}
				>
					<div class="handle-line"></div>
				</div>
			</div>

			<!-- Time labels -->
			<div class="time-labels">
				<span class="time-label">{formatTime(startTime)}</span>
				<span class="time-duration">{formatTime(selectedDuration)}</span>
				<span class="time-label">{formatTime(endTime)}</span>
			</div>

			<!-- Playback control -->
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
	.waveform-wrapper {
		position: relative;
		width: 100%;
		height: 100px;
		touch-action: none;
		user-select: none;
	}
	.range-bg {
		position: absolute;
		top: 0;
		height: 100%;
		background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
		border-radius: 4px;
		pointer-events: none;
	}
	.waveform-svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.fallback-timeline {
		width: 100%;
		height: 4px;
		background: var(--bg-subtle);
		border-radius: 2px;
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
	}
	.playhead {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		background: var(--text-primary);
		transform: translateX(-1px);
		pointer-events: none;
		border-radius: 1px;
	}
	.handle {
		position: absolute;
		top: -8px;
		width: 44px;
		height: calc(100% + 16px);
		transform: translateX(-22px);
		cursor: grab;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
	}
	.handle:active,
	.handle.active {
		cursor: grabbing;
	}
	.handle-line {
		width: 4px;
		height: 100%;
		max-height: 50px;
		background: var(--accent-primary);
		border-radius: 2px;
		box-shadow: 0 0 8px color-mix(in srgb, var(--accent-primary) 40%, transparent);
	}
	.handle.active .handle-line {
		width: 5px;
		box-shadow: 0 0 12px color-mix(in srgb, var(--accent-primary) 60%, transparent);
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

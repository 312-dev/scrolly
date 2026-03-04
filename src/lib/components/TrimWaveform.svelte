<script lang="ts">
	const MIN_DURATION = 30;
	const STEP_NORMAL = 1;
	const STEP_LARGE = 5;

	let {
		peaks = null,
		loading = true,
		durationSeconds,
		startTime = $bindable(0),
		endTime = $bindable(0),
		currentTime = 0,
		playing = false,
		onseek,
		formatTime
	}: {
		peaks: number[] | null;
		loading?: boolean;
		durationSeconds: number;
		startTime: number;
		endTime: number;
		currentTime?: number;
		playing?: boolean;
		onseek?: (time: number) => void;
		formatTime?: (seconds: number) => string;
	} = $props();

	let dragging = $state<'start' | 'end' | null>(null);
	let scrubbing = $state(false);
	let dragTime = $state<number | null>(null);
	let atBoundary = $state(false);
	let container = $state<HTMLDivElement | null>(null);

	// Derived percentages for positioning
	const leftPct = $derived(durationSeconds > 0 ? (startTime / durationSeconds) * 100 : 0);
	const rightPct = $derived(durationSeconds > 0 ? (endTime / durationSeconds) * 100 : 100);
	const rangePct = $derived(rightPct - leftPct);

	// Tooltip logic
	const tooltipTime = $derived.by(() => {
		if (dragging === 'start') return startTime;
		if (dragging === 'end') return endTime;
		if (scrubbing && dragTime !== null) return dragTime;
		return null;
	});
	const tooltipLeftClamped = $derived(
		tooltipTime !== null && durationSeconds > 0
			? Math.max(5, Math.min(95, (tooltipTime / durationSeconds) * 100))
			: null
	);

	function defaultFormatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
	const fmt = $derived(formatTime ?? defaultFormatTime);

	function haptic(ms: number | number[] = 10) {
		try {
			navigator?.vibrate?.(ms);
		} catch {
			// iOS Safari and some browsers don't support vibrate
		}
	}

	function timeFromPointer(clientX: number): number {
		if (!container) return 0;
		const rect = container.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return ratio * durationSeconds;
	}

	function handlePointerDown(e: PointerEvent, handle: 'start' | 'end') {
		e.preventDefault();
		e.stopPropagation();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		dragging = handle;
		dragTime = handle === 'start' ? startTime : endTime;
		atBoundary = false;
		haptic(10);
	}

	function handleWaveformPointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('.handle')) return;
		e.preventDefault();
		scrubbing = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const time = timeFromPointer(e.clientX);
		dragTime = time;
		onseek?.(time);
		haptic(6);
	}

	function handlePointerMove(e: PointerEvent) {
		if (dragging) {
			const time = timeFromPointer(e.clientX);
			if (dragging === 'start') {
				const maxStart = endTime - MIN_DURATION;
				const clamped = Math.max(0, Math.min(maxStart, time));
				const nowAtBoundary = clamped <= 0 || clamped >= maxStart;
				if (nowAtBoundary && !atBoundary) haptic(4);
				atBoundary = nowAtBoundary;
				startTime = clamped;
				dragTime = clamped;
				onseek?.(startTime);
			} else {
				const minEnd = startTime + MIN_DURATION;
				const clamped = Math.min(durationSeconds, Math.max(minEnd, time));
				const nowAtBoundary = clamped >= durationSeconds || clamped <= minEnd;
				if (nowAtBoundary && !atBoundary) haptic(4);
				atBoundary = nowAtBoundary;
				endTime = clamped;
				dragTime = clamped;
			}
		} else if (scrubbing) {
			const time = timeFromPointer(e.clientX);
			dragTime = time;
			onseek?.(time);
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (dragging) {
			try {
				(e.target as HTMLElement).releasePointerCapture(e.pointerId);
			} catch {
				/* may not have capture */
			}
			dragging = null;
			dragTime = null;
			atBoundary = false;
			haptic(6);
		}
		if (scrubbing) {
			scrubbing = false;
			dragTime = null;
			try {
				(e.currentTarget as HTMLElement)?.releasePointerCapture(e.pointerId);
			} catch {
				/* may not have capture */
			}
		}
	}

	function handleKeyDown(e: KeyboardEvent, handle: 'start' | 'end') {
		const step = e.shiftKey ? STEP_LARGE : STEP_NORMAL;
		let handled = true;

		if (handle === 'start') {
			if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
				startTime = Math.max(0, startTime - step);
				onseek?.(startTime);
			} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
				startTime = Math.min(endTime - MIN_DURATION, startTime + step);
				onseek?.(startTime);
			} else {
				handled = false;
			}
		} else {
			if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
				endTime = Math.min(durationSeconds, endTime + step);
			} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
				endTime = Math.max(startTime + MIN_DURATION, endTime - step);
			} else {
				handled = false;
			}
		}

		if (handled) {
			e.preventDefault();
			haptic(4);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="waveform-wrapper"
	class:scrubbing
	bind:this={container}
	onpointerdown={handleWaveformPointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
>
	<!-- Dimmed overlays outside trim region -->
	<div class="dim-overlay dim-left" style="width: {leftPct}%"></div>
	<div class="dim-overlay dim-right" style="left: {rightPct}%; width: {100 - rightPct}%"></div>

	<!-- Bracket frame bars connecting handles -->
	<div class="bracket-bar bracket-bar-top" style="left: {leftPct}%; width: {rangePct}%"></div>
	<div class="bracket-bar bracket-bar-bottom" style="left: {leftPct}%; width: {rangePct}%"></div>

	<!-- Waveform SVG -->
	{#if peaks && peaks.length > 0}
		<svg class="waveform-svg" viewBox="0 0 {peaks.length} 100" preserveAspectRatio="none">
			{#each peaks as peak, i (i)}
				{@const time = (i / peaks.length) * durationSeconds}
				{@const inRange = time >= startTime && time <= endTime}
				{@const h = Math.max(4, peak * 80)}
				<rect
					x={i}
					y={50 - h / 2}
					width={0.6}
					height={h}
					rx={0.3}
					fill={inRange ? 'var(--accent-primary)' : 'rgba(255,255,255,0.15)'}
					opacity={inRange ? 1 : 0.5}
				/>
			{/each}
		</svg>
	{:else if !loading}
		<div class="fallback-timeline"></div>
	{/if}

	<!-- Playhead -->
	{#if playing || currentTime > 0}
		<div class="playhead" style="left: {(currentTime / durationSeconds) * 100}%"></div>
	{/if}

	<!-- Time tooltip during drag -->
	{#if tooltipTime !== null && tooltipLeftClamped !== null}
		<div class="time-tooltip" style="left: {tooltipLeftClamped}%">
			{fmt(tooltipTime)}
		</div>
	{/if}

	<!-- Start handle -->
	<div
		class="handle handle-start"
		class:active={dragging === 'start'}
		style="left: {leftPct}%"
		onpointerdown={(e) => handlePointerDown(e, 'start')}
		onkeydown={(e) => handleKeyDown(e, 'start')}
		role="slider"
		aria-label="Trim start"
		aria-valuemin={0}
		aria-valuemax={durationSeconds}
		aria-valuenow={startTime}
		aria-valuetext={fmt(startTime)}
		tabindex={0}
	>
		<div class="handle-bracket">
			<div class="grip-lines">
				<span></span>
				<span></span>
				<span></span>
			</div>
		</div>
	</div>

	<!-- End handle -->
	<div
		class="handle handle-end"
		class:active={dragging === 'end'}
		style="left: {rightPct}%"
		onpointerdown={(e) => handlePointerDown(e, 'end')}
		onkeydown={(e) => handleKeyDown(e, 'end')}
		role="slider"
		aria-label="Trim end"
		aria-valuemin={0}
		aria-valuemax={durationSeconds}
		aria-valuenow={endTime}
		aria-valuetext={fmt(endTime)}
		tabindex={0}
	>
		<div class="handle-bracket">
			<div class="grip-lines">
				<span></span>
				<span></span>
				<span></span>
			</div>
		</div>
	</div>
</div>

<style>
	.waveform-wrapper {
		position: relative;
		width: 100%;
		height: 110px;
		padding: 4px 0;
		touch-action: none;
		user-select: none;
		cursor: pointer;
	}
	.waveform-wrapper.scrubbing {
		cursor: grabbing;
	}

	/* Dimmed overlays outside trim region */
	.dim-overlay {
		position: absolute;
		top: 0;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		pointer-events: none;
		z-index: 1;
	}
	.dim-left {
		left: 0;
		border-radius: 4px 0 0 4px;
	}
	.dim-right {
		border-radius: 0 4px 4px 0;
	}

	/* Bracket frame bars */
	.bracket-bar {
		position: absolute;
		height: 3px;
		background: var(--accent-primary);
		pointer-events: none;
		z-index: 1;
	}
	.bracket-bar-top {
		top: 0;
	}
	.bracket-bar-bottom {
		bottom: 0;
	}

	/* Waveform SVG */
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

	/* Playhead */
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

	/* Time tooltip */
	.time-tooltip {
		position: absolute;
		top: -30px;
		transform: translateX(-50%);
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-size: 0.75rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		pointer-events: none;
		z-index: 10;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	/* Handles */
	.handle {
		position: absolute;
		top: -4px;
		width: 44px;
		height: calc(100% + 8px);
		transform: translateX(-22px);
		cursor: grab;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
	}
	.handle:focus-visible {
		outline: 2px solid var(--accent-primary);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
	.handle:active,
	.handle.active {
		cursor: grabbing;
	}

	/* Bracket-style handle visual */
	.handle-bracket {
		width: 14px;
		height: 100%;
		max-height: 56px;
		background: var(--accent-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
		box-shadow: 0 0 6px color-mix(in srgb, var(--accent-primary) 30%, transparent);
	}
	.handle-start .handle-bracket {
		border-radius: 4px 2px 2px 4px;
	}
	.handle-end .handle-bracket {
		border-radius: 2px 4px 4px 2px;
	}
	.handle.active .handle-bracket {
		transform: scaleX(1.15);
		box-shadow: 0 0 14px color-mix(in srgb, var(--accent-primary) 55%, transparent);
	}

	/* Grip lines inside handle bracket */
	.grip-lines {
		display: flex;
		flex-direction: column;
		gap: 3px;
		align-items: center;
	}
	.grip-lines span {
		display: block;
		width: 6px;
		height: 1.5px;
		background: var(--bg-primary);
		border-radius: 1px;
		opacity: 0.7;
	}
	.handle.active .grip-lines span {
		opacity: 1;
	}
</style>

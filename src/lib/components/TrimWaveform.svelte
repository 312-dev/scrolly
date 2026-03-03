<script lang="ts">
	const MIN_DURATION = 30;

	let {
		peaks = null,
		loading = true,
		durationSeconds,
		startTime = $bindable(0),
		endTime = $bindable(0),
		currentTime = 0,
		playing = false,
		onseek
	}: {
		peaks: number[] | null;
		loading?: boolean;
		durationSeconds: number;
		startTime: number;
		endTime: number;
		currentTime?: number;
		playing?: boolean;
		onseek?: (time: number) => void;
	} = $props();

	let dragging = $state<'start' | 'end' | null>(null);
	let container = $state<HTMLDivElement | null>(null);

	function timeFromPointer(clientX: number): number {
		if (!container) return 0;
		const rect = container.getBoundingClientRect();
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
			onseek?.(startTime);
		} else {
			const minEnd = startTime + MIN_DURATION;
			endTime = Math.min(durationSeconds, Math.max(minEnd, time));
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!dragging) return;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		dragging = null;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="waveform-wrapper"
	bind:this={container}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
	<div
		class="range-bg"
		style="left: {(startTime / durationSeconds) * 100}%; width: {((endTime - startTime) /
			durationSeconds) *
			100}%"
	></div>

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
					fill={inRange ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)'}
					opacity={inRange ? 1 : 0.6}
				/>
			{/each}
		</svg>
	{:else if !loading}
		<div class="fallback-timeline"></div>
	{/if}

	{#if playing || currentTime > 0}
		<div class="playhead" style="left: {(currentTime / durationSeconds) * 100}%"></div>
	{/if}

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

<style>
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
</style>

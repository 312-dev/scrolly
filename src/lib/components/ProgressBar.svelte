<script lang="ts">
	const {
		currentTime,
		duration,
		isDesktop,
		onseek,
		uiHidden = false
	}: {
		currentTime: number;
		duration: number;
		isDesktop: boolean;
		onseek: (time: number) => void;
		uiHidden?: boolean;
	} = $props();

	let barEl: HTMLDivElement | null = $state(null);
	let scrubbing = $state(false);
	let hoverProgress = $state<number | null>(null);

	const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);

	function getTimeFromX(clientX: number): number {
		if (!barEl) return 0;
		const rect = barEl.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return ratio * duration;
	}

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		scrubbing = true;
		onseek(getTimeFromX(e.clientX));

		function handleMouseMove(ev: MouseEvent) {
			onseek(getTimeFromX(ev.clientX));
		}

		function handleMouseUp() {
			scrubbing = false;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		}

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	function handleHover(e: MouseEvent) {
		if (scrubbing) return;
		hoverProgress = getTimeFromX(e.clientX);
	}

	function handleMouseLeave() {
		if (!scrubbing) {
			hoverProgress = null;
		}
	}

	function handleTouchStart(e: TouchEvent) {
		e.stopPropagation();
		scrubbing = true;
		const touch = e.touches[0];
		onseek(getTimeFromX(touch.clientX));
	}

	function handleTouchMove(e: TouchEvent) {
		if (!scrubbing) return;
		e.stopPropagation();
		const touch = e.touches[0];
		onseek(getTimeFromX(touch.clientX));
	}

	function handleTouchEnd() {
		scrubbing = false;
	}
</script>

<div
	class="progress-bar"
	class:desktop={isDesktop}
	class:scrubbing
	class:ui-hidden={uiHidden}
	bind:this={barEl}
	onmousedown={handleMouseDown}
	onmousemove={handleHover}
	onmouseleave={handleMouseLeave}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	tabindex="0"
	role="slider"
	aria-label="Video progress"
	aria-valuenow={currentTime}
	aria-valuemin={0}
	aria-valuemax={duration}
>
	<div class="progress-track">
		{#if hoverProgress !== null}
			<div class="progress-hover" style="width: {(hoverProgress / duration) * 100}%"></div>
		{/if}
		<div class="progress-fill" style="width: {progress}%">
			<div class="progress-thumb"></div>
		</div>
	</div>
</div>

<style>
	.progress-bar {
		position: absolute;
		bottom: calc(var(--bottom-nav-height, 64px) - 8px);
		left: 0;
		right: 0;
		z-index: 6;
		height: 48px;
		display: flex;
		align-items: center;
		cursor: pointer;
		padding: 0;
		transition: opacity 0.3s ease;
	}

	.progress-bar.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.progress-track {
		width: 100%;
		height: 3px;
		background: rgba(255, 255, 255, 0.2);
		position: relative;
		transition: height 0.2s ease;
	}

	.progress-bar:hover .progress-track,
	.progress-bar.scrubbing .progress-track {
		height: 6px;
	}

	.progress-fill {
		height: 100%;
		background: rgba(255, 255, 255, 0.85);
		position: absolute;
		top: 0;
		left: 0;
	}

	.progress-thumb {
		position: absolute;
		right: -6px;
		top: 50%;
		transform: translateY(-50%) scale(0);
		width: 12px;
		height: 12px;
		border-radius: var(--radius-full);
		background: var(--reel-text);
		box-shadow: 0 0 4px var(--reel-icon-shadow);
		transition: transform 0.15s ease;
	}

	.progress-bar:hover .progress-thumb,
	.progress-bar.scrubbing .progress-thumb {
		transform: translateY(-50%) scale(1);
	}

	.progress-hover {
		height: 100%;
		background: rgba(255, 255, 255, 0.3);
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}
</style>

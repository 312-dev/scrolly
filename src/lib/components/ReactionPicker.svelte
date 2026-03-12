<script lang="ts">
	import { REACTIONS } from '$lib/icons';
	import { openSheet, closeSheet } from '$lib/stores/sheetOpen';
	import { onDestroy } from 'svelte';

	// Reorder: heart last (rightmost, anchoring the bar)
	const BAR_EMOJIS = [...REACTIONS.filter((e) => e !== '❤️'), '❤️'];

	const {
		x,
		y,
		onpick,
		ondismiss,
		dragMode = false
	}: {
		x: number;
		y: number;
		onpick: (emoji: string) => void;
		ondismiss: () => void;
		dragMode?: boolean;
	} = $props();

	let barEl: HTMLDivElement | null = $state(null);
	let visible = $state(false);
	let hoveredIndex = $state(-1);
	const btnEls: HTMLButtonElement[] = $state([]);

	// Block feed swipe while picker is open
	openSheet();
	onDestroy(closeSheet);

	// Animate in
	$effect(() => {
		const raf = requestAnimationFrame(() => {
			visible = true;
		});
		return () => cancelAnimationFrame(raf);
	});

	// Auto-dismiss after 4s (tap mode only)
	$effect(() => {
		if (dragMode) return;
		const timer = setTimeout(ondismiss, 4000);
		return () => clearTimeout(timer);
	});

	// Dismiss on outside click (tap mode only)
	$effect(() => {
		if (dragMode) return;

		function handleOutsideClick(e: PointerEvent) {
			if (barEl && !barEl.contains(e.target as Node)) {
				ondismiss();
			}
		}

		const timer = setTimeout(() => {
			document.addEventListener('pointerup', handleOutsideClick);
		}, 50);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('pointerup', handleOutsideClick);
		};
	});

	// Drag mode: track pointer and pick on release
	$effect(() => {
		if (!dragMode) return;

		function hitTestEmoji(cx: number, cy: number): number {
			for (let i = 0; i < btnEls.length; i++) {
				const el = btnEls[i];
				if (!el) continue;
				const rect = el.getBoundingClientRect();
				const pad = 8;
				if (
					cx >= rect.left - pad &&
					cx <= rect.right + pad &&
					cy >= rect.top - pad &&
					cy <= rect.bottom + pad
				) {
					return i;
				}
			}
			return -1;
		}

		function handleMove(e: PointerEvent) {
			hoveredIndex = hitTestEmoji(e.clientX, e.clientY);
		}

		function handleUp(e: PointerEvent) {
			const idx = hitTestEmoji(e.clientX, e.clientY);
			if (idx >= 0) {
				onpick(BAR_EMOJIS[idx]);
			} else {
				ondismiss();
			}
		}

		document.addEventListener('pointermove', handleMove);
		document.addEventListener('pointerup', handleUp);

		return () => {
			document.removeEventListener('pointermove', handleMove);
			document.removeEventListener('pointerup', handleUp);
		};
	});
</script>

<!-- x,y = center of the heart icon-circle (44x44) -->
<!-- Bar right edge should align so the last emoji (❤️) sits exactly over the heart -->
<div
	class="reaction-bar"
	class:visible
	style="left:{x}px;top:{y}px"
	bind:this={barEl}
	role="listbox"
	aria-label="Reaction picker"
	ontouchstart={(e) => e.stopPropagation()}
	ontouchmove={(e) => e.stopPropagation()}
	ontouchend={(e) => e.stopPropagation()}
	onpointerdown={(e) => e.stopPropagation()}
>
	{#each BAR_EMOJIS as emoji, i (emoji)}
		{@const delayIndex = BAR_EMOJIS.length - 1 - i}
		<button
			class="reaction-btn"
			class:visible
			class:hovered={hoveredIndex === i}
			style="transition-delay:{visible ? delayIndex * 25 : 0}ms"
			bind:this={btnEls[i]}
			onclick={() => {
				if (!dragMode) onpick(emoji);
			}}
			aria-label="React with {emoji}"
		>
			<span class="emoji">{emoji}</span>
		</button>
	{/each}
</div>

<style>
	.reaction-bar {
		position: fixed;
		z-index: 200;
		display: flex;
		align-items: center;
		gap: 0;
		padding: 4px;
		border-radius: var(--radius-full);
		background: var(--reel-icon-circle-bg);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
		/* Right-align: shift left by full width, then back by half the last emoji (22px = 44/2) */
		transform-origin: right center;
		transform: translate(calc(-100% + 22px), -50%) scaleX(0);
		opacity: 0;
		transition:
			transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1),
			opacity 150ms ease;
	}

	.reaction-bar.visible {
		transform: translate(calc(-100% + 22px), -50%) scaleX(1);
		opacity: 1;
	}

	.reaction-btn {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		cursor: pointer;
		padding: 0;
		border-radius: var(--radius-full);
		background: none;
		transform: scale(0);
		opacity: 0;
		transition:
			transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
			opacity 150ms ease;
		-webkit-tap-highlight-color: transparent;
		pointer-events: none;
	}

	.reaction-btn.visible {
		transform: scale(1);
		opacity: 1;
		pointer-events: auto;
	}

	.reaction-btn.hovered {
		transform: scale(1.5) translateY(-16px);
	}

	.reaction-btn:not(.hovered):hover .emoji {
		transform: scale(1.15);
	}

	.emoji {
		font-size: 24px;
		line-height: 1;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
		transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
		pointer-events: none;
		user-select: none;
	}
</style>

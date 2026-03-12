<script lang="ts">
	import { onMount } from 'svelte';

	const {
		emoji,
		x,
		y,
		oncomplete
	}: {
		emoji: string;
		x: number;
		y: number;
		oncomplete: () => void;
	} = $props();

	interface Particle {
		id: number;
		emoji: string;
		x: number;
		y: number;
		scale: number;
		travel: number;
		wobble: number;
		rotation: number;
		duration: number;
		delay: number;
	}

	let particles = $state<Particle[]>([]);

	onMount(() => {
		const count = 8 + Math.floor(Math.random() * 5); // 8–12 particles
		let maxEnd = 0;

		particles = Array.from({ length: count }, (_, i) => {
			const dur = 0.8 + Math.random() * 0.6; // 0.8–1.4s (snappy)
			const del = Math.random() * 200; // tight stagger
			maxEnd = Math.max(maxEnd, dur * 1000 + del);

			return {
				id: i,
				emoji,
				x: x + (Math.random() - 0.5) * 80, // moderate spread
				y: y + (Math.random() - 0.5) * 40,
				scale: 0.6 + Math.random() * 0.8, // 0.6–1.4x
				travel: 120 + Math.random() * 160, // 120–280px upward
				wobble: 15 + Math.random() * 30, // gentle lateral drift
				rotation: (Math.random() - 0.5) * 30,
				duration: dur,
				delay: del
			};
		});

		setTimeout(oncomplete, maxEnd + 50);
	});
</script>

<div class="shower-container">
	{#each particles as p (p.id)}
		<div
			class="particle"
			style="
				left:{p.x}px;
				top:{p.y}px;
				--travel:{p.travel}px;
				--wobble:{p.wobble}px;
				--scale:{p.scale};
				--rotation:{p.rotation}deg;
				--duration:{p.duration}s;
				--delay:{p.delay}ms;
			"
		>
			{p.emoji}
		</div>
	{/each}
</div>

<style>
	.shower-container {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 300;
		overflow: hidden;
	}

	.particle {
		position: absolute;
		font-size: 1.5rem;
		opacity: 0;
		transform: translate(-50%, -50%) scale(0);
		animation: float-up var(--duration) ease-out var(--delay) forwards;
		will-change: transform, opacity;
	}

	@keyframes float-up {
		0% {
			opacity: 0.9;
			transform: translate(-50%, -50%) scale(0) rotate(0deg);
		}
		10% {
			opacity: 0.9;
			transform: translate(-50%, -50%) scale(var(--scale)) rotate(0deg);
		}
		40% {
			opacity: 0.7;
			transform: translate(calc(-50% + var(--wobble)), calc(-50% - var(--travel) * 0.4))
				scale(var(--scale)) rotate(var(--rotation));
		}
		70% {
			opacity: 0.3;
			transform: translate(calc(-50% - var(--wobble) * 0.4), calc(-50% - var(--travel) * 0.7))
				scale(calc(var(--scale) * 0.85)) rotate(calc(var(--rotation) * -0.5));
		}
		100% {
			opacity: 0;
			transform: translate(calc(-50% + var(--wobble) * 0.2), calc(-50% - var(--travel)))
				scale(calc(var(--scale) * 0.6)) rotate(calc(var(--rotation) * -1));
		}
	}
</style>

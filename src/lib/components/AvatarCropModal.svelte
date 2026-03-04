<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { createOverlayHistory } from '$lib/overlayHistory';
	import Cropper from 'svelte-easy-crop';

	const {
		imageUrl,
		ondismiss,
		onuploaded
	}: {
		imageUrl: string;
		ondismiss: () => void;
		onuploaded: (avatarPath: string) => void;
	} = $props();

	let visible = $state(false);
	let uploading = $state(false);

	const overlay = createOverlayHistory('sheet', 'avatarCrop');
	beforeNavigate(overlay.onBeforeNavigate);

	let crop = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let croppedPixels = $state<{ x: number; y: number; width: number; height: number } | null>(null);

	$effect(() => {
		requestAnimationFrame(() => {
			visible = true;
		});
		document.body.style.overflow = 'hidden';

		const cleanupHistory = overlay.attach(ondismiss);

		return () => {
			document.body.style.overflow = '';
			cleanupHistory();
		};
	});

	function handleCropComplete(e: {
		pixels: { x: number; y: number; width: number; height: number };
	}) {
		croppedPixels = e.pixels;
	}

	function dismiss() {
		visible = false;
		setTimeout(() => ondismiss(), 300);
	}

	function getCroppedBlob(
		src: string,
		pixels: { x: number; y: number; width: number; height: number }
	): Promise<Blob | null> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = 512;
				canvas.height = 512;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(null);
					return;
				}
				ctx.drawImage(img, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, 512, 512);
				canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
			};
			img.onerror = () => resolve(null);
			img.src = src;
		});
	}

	async function handleSave() {
		if (!croppedPixels || uploading) return;
		uploading = true;

		try {
			const blob = await getCroppedBlob(imageUrl, croppedPixels);
			if (!blob) return;

			const formData = new FormData();
			formData.append('avatar', blob, 'avatar.jpg');

			const res = await fetch('/api/profile/avatar', {
				method: 'POST',
				body: formData
			});

			if (res.ok) {
				const data = await res.json();
				onuploaded(data.avatarPath);
				dismiss();
			}
		} finally {
			uploading = false;
		}
	}
</script>

<div class="overlay" class:visible onclick={dismiss} role="presentation"></div>

<div class="modal" class:visible>
	<div class="crop-header">
		<button class="header-btn cancel" onclick={dismiss}>Cancel</button>
		<span class="header-title">Move and scale</span>
		<button class="header-btn save" onclick={handleSave} disabled={uploading}>
			{uploading ? 'Saving...' : 'Save'}
		</button>
	</div>

	<div class="crop-area">
		<Cropper
			image={imageUrl}
			bind:crop
			bind:zoom
			aspect={1}
			cropShape="round"
			showGrid={false}
			minZoom={1}
			maxZoom={5}
			restrictPosition={true}
			oncropcomplete={handleCropComplete}
		/>
	</div>

	<div class="zoom-controls">
		<input type="range" min={1} max={5} step={0.01} bind:value={zoom} class="zoom-slider" />
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
	}
	.modal.visible {
		opacity: 1;
	}

	.crop-header {
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

	.crop-area {
		flex: 1 1 0%;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	.zoom-controls {
		padding: var(--space-lg) var(--space-xl);
		padding-bottom: max(var(--space-lg), env(safe-area-inset-bottom));
		flex-shrink: 0;
	}

	.zoom-slider {
		width: 100%;
		accent-color: var(--accent-primary);
		height: 4px;
	}
</style>

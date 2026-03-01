<script lang="ts">
	import {
		toasts,
		removeToast,
		replaceToast,
		clipReadySignal,
		viewClipSignal,
		type Toast
	} from '$lib/stores/toasts';
	import { onDestroy } from 'svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive tracking maps, cleaned up in onDestroy
	const pollIntervals = new Map<string, ReturnType<typeof setInterval>>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive tracking maps, cleaned up in onDestroy
	const dismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	$effect(() => {
		const currentToasts = $toasts;

		for (const toast of currentToasts) {
			// Start polling for processing toasts with clipId
			if (toast.type === 'processing' && toast.clipId && !pollIntervals.has(toast.id)) {
				const interval = setInterval(() => pollClipStatus(toast), 3000);
				pollIntervals.set(toast.id, interval);
			}

			// Schedule auto-dismiss
			if (toast.autoDismiss && toast.autoDismiss > 0 && !dismissTimeouts.has(toast.id)) {
				const timeout = setTimeout(() => {
					dismissTimeouts.delete(toast.id);
					handleDismiss(toast.id);
				}, toast.autoDismiss);
				dismissTimeouts.set(toast.id, timeout);
			}
		}

		// Clean up intervals for removed toasts
		const activeIds = new Set(currentToasts.map((t) => t.id));
		for (const [id, interval] of pollIntervals) {
			if (!activeIds.has(id)) {
				clearInterval(interval);
				pollIntervals.delete(id);
			}
		}
		for (const [id, timeout] of dismissTimeouts) {
			if (!activeIds.has(id)) {
				clearTimeout(timeout);
				dismissTimeouts.delete(id);
			}
		}
	});

	async function pollClipStatus(toast: Toast) {
		if (!toast.clipId) return;
		try {
			const res = await fetch(`/api/clips/${toast.clipId}`);
			if (!res.ok) return;
			const data = await res.json();

			if (data.status === 'ready') {
				const interval = pollIntervals.get(toast.id);
				if (interval) clearInterval(interval);
				pollIntervals.delete(toast.id);

				const contentLabel = toast.contentType === 'music' ? 'song' : 'video';
				replaceToast(toast.id, {
					type: 'success',
					message: data.title ? `"${data.title}" is ready` : `Your ${contentLabel} is ready`
				});

				const timeout = setTimeout(() => removeToast(toast.id), 6000);
				dismissTimeouts.set(toast.id, timeout);

				clipReadySignal.set(toast.clipId);
			} else if (data.status === 'failed') {
				const interval = pollIntervals.get(toast.id);
				if (interval) clearInterval(interval);
				pollIntervals.delete(toast.id);

				replaceToast(toast.id, {
					type: 'error',
					message: 'Download failed'
				});
			}
		} catch {
			// Network error — keep polling
		}
	}

	function handleView(toast: Toast) {
		if (toast.clipId) {
			viewClipSignal.set(toast.clipId);
		}
		handleDismiss(toast.id);
	}

	let dismissingIds = $state(new Set<string>());

	function handleDismiss(id: string) {
		if (dismissingIds.has(id)) return;
		const interval = pollIntervals.get(id);
		if (interval) clearInterval(interval);
		pollIntervals.delete(id);
		const timeout = dismissTimeouts.get(id);
		if (timeout) clearTimeout(timeout);
		dismissTimeouts.delete(id);

		dismissingIds = new Set([...dismissingIds, id]);
		setTimeout(() => {
			dismissingIds = new Set([...dismissingIds].filter((d) => d !== id));
			removeToast(id);
		}, 200);
	}

	onDestroy(() => {
		for (const interval of pollIntervals.values()) clearInterval(interval);
		for (const timeout of dismissTimeouts.values()) clearTimeout(timeout);
	});
</script>

{#if $toasts.length > 0}
	<div class="toast-stack">
		{#each $toasts as toast (toast.id)}
			<div
				class="toast toast-{toast.type}"
				class:dismissing={dismissingIds.has(toast.id)}
				role="alert"
			>
				<div class="toast-icon">
					{#if toast.type === 'processing'}
						<div class="spinner-ring"></div>
					{:else if toast.type === 'success'}
						<CheckIcon size={16} weight="bold" />
					{:else if toast.type === 'info'}
						<InfoIcon size={16} />
					{:else}
						<XCircleIcon size={16} />
					{/if}
				</div>
				<span class="toast-message">{toast.message}</span>
				{#if toast.type === 'success' && toast.clipId}
					<button class="toast-view" onclick={() => handleView(toast)}>View</button>
				{/if}
				<button class="toast-dismiss" onclick={() => handleDismiss(toast.id)} aria-label="Dismiss">
					<XIcon size={14} />
				</button>
				{#if toast.type === 'processing'}
					<div class="progress-track">
						<div class="progress-bar"></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-stack {
		position: fixed;
		bottom: var(--bottom-nav-height, 64px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 300;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: calc(100% - var(--space-lg) * 2);
		max-width: 400px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 500;
		pointer-events: auto;
		animation: toast-in 0.35s cubic-bezier(0.32, 0.72, 0, 1);
		position: relative;
		overflow: hidden;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
	}

	.toast-success {
		background: color-mix(in srgb, var(--success) 10%, var(--bg-elevated));
	}

	.toast-error {
		background: color-mix(in srgb, var(--error) 10%, var(--bg-elevated));
	}

	.toast-info {
		background: color-mix(in srgb, var(--accent-blue) 10%, var(--bg-elevated));
	}

	.toast-processing {
		background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-elevated));
	}

	.toast-icon {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toast-icon :global(svg) {
		width: 16px;
		height: 16px;
	}

	.toast-success .toast-icon {
		background: color-mix(in srgb, var(--success) 20%, transparent);
		color: var(--success);
	}

	.toast-error .toast-icon {
		background: color-mix(in srgb, var(--error) 20%, transparent);
		color: var(--error);
	}

	.toast-info .toast-icon {
		background: color-mix(in srgb, var(--accent-blue) 20%, transparent);
		color: var(--accent-blue);
	}

	.toast-processing .toast-icon {
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
	}

	.toast-message {
		flex: 1;
		min-width: 0;
		line-height: 1.4;
	}

	.toast-view {
		flex-shrink: 0;
		background: var(--accent-primary);
		border: none;
		color: var(--bg-primary);
		cursor: pointer;
		padding: var(--space-xs) var(--space-md);
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: var(--radius-full);
		transition: transform 0.15s ease;
	}

	.toast-view:active {
		transform: scale(0.95);
	}

	.toast-dismiss {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: var(--space-xs);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		transition: color 0.15s ease;
	}

	.toast-dismiss:active {
		color: var(--text-secondary);
	}

	.toast-dismiss :global(svg) {
		width: 14px;
		height: 14px;
	}

	.progress-track {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
	}

	.progress-bar {
		height: 100%;
		width: 40%;
		background: var(--accent-primary);
		border-radius: 2px;
		animation: indeterminate 1.5s ease-in-out infinite;
	}

	.spinner-ring {
		width: 16px;
		height: 16px;
		border: 2px solid color-mix(in srgb, var(--accent-primary) 25%, transparent);
		border-top-color: var(--accent-primary);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes indeterminate {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(150%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(16px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.toast.dismissing {
		animation: toast-out 200ms ease-out forwards;
	}

	@keyframes toast-out {
		to {
			opacity: 0;
			transform: translateY(16px) scale(0.95);
		}
	}
</style>

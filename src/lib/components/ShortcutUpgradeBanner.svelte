<script lang="ts">
	import { resolve } from '$app/paths';
	import { showShortcutUpgrade, dismissShortcutUpgrade } from '$lib/stores/shortcutUpgrade';
	import { feedUiHidden } from '$lib/stores/uiHidden';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import ShareNetworkIcon from 'phosphor-svelte/lib/ShareNetworkIcon';
	import ScissorsIcon from 'phosphor-svelte/lib/ScissorsIcon';
	import MusicNoteIcon from 'phosphor-svelte/lib/MusicNoteIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';

	let {
		lastLegacyShareAt,
		usedNewShareFlow,
		shortcutUrl
	}: {
		lastLegacyShareAt: Date | null;
		usedNewShareFlow: boolean;
		shortcutUrl: string | null;
	} = $props();

	const shouldShow = $derived(
		$showShortcutUpgrade && lastLegacyShareAt !== null && !usedNewShareFlow
	);

	let showConfirmModal = $state(false);

	function handleUpdateClick(e: MouseEvent) {
		e.preventDefault();
		showConfirmModal = true;
	}

	function confirmUpdate() {
		if (shortcutUrl) {
			window.open(shortcutUrl, '_blank', 'noopener');
		}
		showConfirmModal = false;
	}
</script>

{#if shouldShow}
	<div class="upgrade-backdrop" class:ui-hidden={$feedUiHidden} role="alert">
		<div class="upgrade-card">
			<button class="dismiss" onclick={dismissShortcutUpgrade} aria-label="Dismiss">
				<XIcon size={16} />
			</button>

			<div class="icon-wrap">
				<ShareNetworkIcon size={28} weight="bold" />
			</div>

			<h2 class="title">Sharing just got better</h2>
			<p class="subtitle">After this, future improvements arrive automatically</p>

			<div class="features">
				<div class="feature">
					<ScissorsIcon size={16} weight="bold" />
					<span>Trim songs before sharing</span>
				</div>
				<div class="feature">
					<MusicNoteIcon size={16} weight="bold" />
					<span>Better music clip support</span>
				</div>
			</div>

			{#if shortcutUrl}
				<button class="cta" onclick={handleUpdateClick}> Update Shortcut </button>
			{:else}
				<a href={resolve('/share/setup')} class="cta">Set Up New Shortcut</a>
			{/if}

			<button class="dismiss-text" onclick={dismissShortcutUpgrade}> Remind me later </button>
		</div>
	</div>
{/if}

{#if showConfirmModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => (showConfirmModal = false)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-card" onclick={(e) => e.stopPropagation()}>
			<div class="modal-icon">
				<WarningIcon size={24} weight="bold" />
			</div>
			<h3 class="modal-title">Before you update</h3>
			<p class="modal-desc">
				When prompted, tap <strong>Replace</strong> to swap out your old shortcut. If you're not prompted,
				delete your old sharing shortcut first.
			</p>
			<button class="cta" onclick={confirmUpdate}> Got it — open update </button>
			<button class="modal-cancel" onclick={() => (showConfirmModal = false)}> Cancel </button>
		</div>
	</div>
{/if}

<style>
	.upgrade-backdrop {
		position: fixed;
		bottom: calc(var(--bottom-nav-height, 64px) + var(--space-md));
		left: var(--space-md);
		right: var(--space-md);
		z-index: 45;
		animation: slide-up 0.35s cubic-bezier(0.32, 0.72, 0, 1);
		transition: opacity 0.3s ease;
	}

	.upgrade-backdrop.ui-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.upgrade-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-xl) var(--space-xl) var(--space-lg);
		background: rgba(20, 20, 20, 0.92);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.dismiss {
		position: absolute;
		top: var(--space-sm);
		left: var(--space-sm);
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-muted);
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}

	.icon-wrap {
		width: 52px;
		height: 52px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		color: var(--accent-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--space-md);
	}

	.title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs);
		line-height: 1.2;
	}

	.subtitle {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin: 0 0 var(--space-lg);
		line-height: 1.4;
		max-width: 260px;
	}

	.features {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
		width: 100%;
		max-width: 220px;
	}

	.feature {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: 0.8125rem;
		color: var(--text-primary);
	}

	.feature :global(svg) {
		flex-shrink: 0;
		color: var(--accent-primary);
	}

	.cta {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.9375rem;
		font-weight: 700;
		font-family: var(--font-display);
		text-decoration: none;
		cursor: pointer;
	}

	.cta:active {
		transform: scale(0.97);
	}

	.dismiss-text {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		padding: var(--space-sm);
		margin-top: var(--space-xs);
	}

	/* Confirmation modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
		animation: fade-in 0.2s ease;
	}

	.modal-card {
		width: 100%;
		max-width: 320px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-xl);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-sm);
	}

	.modal-icon {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--warning) 15%, transparent);
		color: var(--warning);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--space-xs);
	}

	.modal-title {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0 0 var(--space-sm);
	}

	.modal-cancel {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		padding: var(--space-xs);
	}

	@keyframes slide-up {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

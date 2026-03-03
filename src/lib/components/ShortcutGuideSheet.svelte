<script lang="ts">
	import { onMount } from 'svelte';
	import BaseSheet from './BaseSheet.svelte';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import ExportIcon from 'phosphor-svelte/lib/ExportIcon';
	import ListIcon from 'phosphor-svelte/lib/ListIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';

	let {
		shortcutUrl,
		ondismiss
	}: {
		shortcutUrl: string;
		ondismiss: () => void;
	} = $props();

	let currentStep = $state(0);
	let sheetRef = $state<ReturnType<typeof BaseSheet> | null>(null);
	let isMac = $state(false);
	const totalSteps = 3;

	onMount(() => {
		const ua = navigator.userAgent;
		isMac = /Macintosh/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua);
	});

	function next() {
		if (currentStep < totalSteps - 1) currentStep++;
	}

	function back() {
		if (currentStep > 0) currentStep--;
	}

	function done() {
		sheetRef?.dismiss();
	}

	function openShortcut() {
		window.open(shortcutUrl, '_blank', 'noopener');
	}
</script>

<BaseSheet bind:this={sheetRef} sheetId="shortcutGuide" {ondismiss}>
	{#snippet header()}
		<div class="guide-header">
			<span class="guide-title">Share Shortcut Setup</span>
			<div class="step-dots">
				{#each Array(totalSteps) as _, i (i)}
					<span class="dot" class:active={i === currentStep} class:completed={i < currentStep}
					></span>
				{/each}
			</div>
			<button class="close-btn" onclick={done} aria-label="Close">
				<XIcon size={18} />
			</button>
		</div>
	{/snippet}

	<div class="guide-body">
		{#if currentStep === 0}
			<div class="step-content">
				<div class="step-icon">
					<DownloadSimpleIcon size={28} weight="bold" />
				</div>
				<h2 class="step-title">Install the Shortcut</h2>
				<p class="step-desc">
					This shortcut lets you share clips to scrolly directly from {isMac
						? "Safari's share menu"
						: "any app's share menu"}
					— no need to open scrolly first.
				</p>
				<button class="install-btn" onclick={openShortcut}> Install Shortcut </button>
				<p class="step-hint">
					{#if isMac}
						Click <strong>Add Shortcut</strong> when prompted in the Shortcuts app
					{:else}
						Tap <strong>Add Shortcut</strong> when prompted in the Shortcuts app
					{/if}
				</p>
			</div>
		{:else if currentStep === 1}
			<div class="step-content">
				<div class="step-icon">
					<ExportIcon size={28} weight="bold" />
				</div>
				<h2 class="step-title">{isMac ? 'Use It in Safari' : 'Find It in Your Share Sheet'}</h2>
				<p class="step-desc">After installing, here's where to find it:</p>
				<div class="instructions">
					{#if isMac}
						<div class="instruction">
							<span class="inst-num">1</span>
							<span
								>Open <strong>Safari</strong> and browse to a video on <strong>TikTok</strong>,
								<strong>Instagram</strong>, <strong>YouTube</strong>, or any site</span
							>
						</div>
						<div class="instruction">
							<span class="inst-num">2</span>
							<span>
								Click the
								<ExportIcon size={15} class="inline-icon" />
								<strong>Share</strong> button in the Safari toolbar
							</span>
						</div>
						<div class="instruction">
							<span class="inst-num">3</span>
							<span>Your shortcut will appear in the share menu</span>
						</div>
						<div class="instruction">
							<span class="inst-num">4</span>
							<span
								>If you don't see it, scroll down and click <strong>More...</strong> to enable it</span
							>
						</div>
					{:else}
						<div class="instruction">
							<span class="inst-num">1</span>
							<span
								>Open <strong>TikTok</strong>, <strong>Instagram</strong>, <strong>YouTube</strong>,
								or any app</span
							>
						</div>
						<div class="instruction">
							<span class="inst-num">2</span>
							<span>
								Tap the
								<ExportIcon size={15} class="inline-icon" />
								<strong>Share</strong> button on a video
							</span>
						</div>
						<div class="instruction">
							<span class="inst-num">3</span>
							<span>Scroll down past contacts and apps to the <strong>actions list</strong></span>
						</div>
						<div class="instruction">
							<span class="inst-num">4</span>
							<span
								>Your shortcut will be near the bottom — you may need to tap <strong>More...</strong
								> to see it</span
							>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="step-content">
				<div class="step-icon">
					<ListIcon size={28} weight="bold" />
				</div>
				<h2 class="step-title">{isMac ? 'Pin for Quick Access' : 'Move It to the Top'}</h2>
				<p class="step-desc">
					{isMac
						? 'Make the shortcut easy to reach whenever you need it:'
						: "Pin the shortcut to your favorites so it's always easy to reach:"}
				</p>
				<div class="instructions">
					{#if isMac}
						<div class="instruction">
							<span class="inst-num">1</span>
							<span>Open the <strong>Shortcuts</strong> app</span>
						</div>
						<div class="instruction">
							<span class="inst-num">2</span>
							<span>Right-click your scrolly shortcut</span>
						</div>
						<div class="instruction">
							<span class="inst-num">3</span>
							<span
								>Choose <strong>Add to Dock</strong> or enable
								<strong>Pin in Menu Bar</strong></span
							>
						</div>
					{:else}
						<div class="instruction">
							<span class="inst-num">1</span>
							<span
								>At the very bottom of the share sheet actions, tap <strong>Edit Actions...</strong
								></span
							>
						</div>
						<div class="instruction">
							<span class="inst-num">2</span>
							<span>Find your scrolly shortcut under <strong>Other Actions</strong></span>
						</div>
						<div class="instruction">
							<span class="inst-num">3</span>
							<span
								>Tap the green <strong class="green">+</strong> button to add it to
								<strong>Favorites</strong></span
							>
						</div>
					{/if}
				</div>
				<div class="tip-box">
					{#if isMac}
						With Menu Bar enabled, you can run the shortcut from anywhere without opening Safari.
					{:else}
						Once it's in Favorites, it'll appear right at the top of your share sheet for quick
						access.
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<div class="guide-nav">
		{#if currentStep > 0}
			<button class="nav-btn" onclick={back}>Back</button>
		{:else}
			<div></div>
		{/if}
		{#if currentStep < totalSteps - 1}
			<button class="nav-btn primary" onclick={next}>Next</button>
		{:else}
			<button class="nav-btn primary" onclick={done}>Done</button>
		{/if}
	</div>
</BaseSheet>

<style>
	/* --- Header --- */
	.guide-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
		position: relative;
	}

	.guide-title {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.close-btn {
		position: absolute;
		right: var(--space-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.close-btn:active {
		background: var(--bg-subtle);
	}

	.step-dots {
		display: flex;
		gap: var(--space-sm);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--bg-subtle);
		transition: background 0.2s ease;
	}

	.dot.active {
		background: var(--accent-primary);
	}

	.dot.completed {
		background: var(--accent-primary);
		opacity: 0.5;
	}

	/* --- Body --- */
	.guide-body {
		padding: var(--space-xl) var(--space-lg);
		min-height: 340px;
		overflow-y: auto;
	}

	.step-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: fade-in 0.2s ease-out;
	}

	.step-icon {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--space-lg);
		color: var(--accent-primary);
	}

	.step-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 var(--space-sm);
		text-align: center;
	}

	.step-desc {
		font-size: 0.9375rem;
		color: var(--text-secondary);
		line-height: 1.5;
		text-align: center;
		margin: 0 0 var(--space-xl);
		max-width: 320px;
	}

	/* --- Install button (step 1) --- */
	.install-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 280px;
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 0.1s ease;
	}

	.install-btn:active {
		transform: scale(0.97);
	}

	.step-hint {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: var(--space-md) 0 0;
		text-align: center;
	}

	.step-hint strong {
		color: var(--text-secondary);
	}

	/* --- Numbered instructions (steps 2 & 3) --- */
	.instructions {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
	}

	.instruction {
		display: flex;
		align-items: flex-start;
		gap: var(--space-md);
		font-size: 0.9375rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.instruction strong {
		color: var(--text-primary);
		font-weight: 600;
	}

	.instruction .green {
		color: var(--success);
	}

	.inst-num {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-surface);
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-secondary);
	}

	.instruction :global(.inline-icon) {
		display: inline-block;
		vertical-align: middle;
		color: var(--accent-blue);
		margin: 0 1px;
	}

	/* --- Tip box (step 3) --- */
	.tip-box {
		margin-top: var(--space-xl);
		padding: var(--space-md) var(--space-lg);
		background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.5;
		text-align: center;
	}

	/* --- Navigation --- */
	.guide-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) var(--space-lg);
		padding-bottom: max(var(--space-md), env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
	}

	.nav-btn {
		padding: var(--space-sm) var(--space-xl);
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: transform 0.1s ease;
		background: var(--bg-surface);
		color: var(--text-primary);
	}

	.nav-btn:active {
		transform: scale(0.97);
	}

	.nav-btn.primary {
		background: var(--accent-primary);
		color: var(--bg-primary);
	}

	/* --- Animation --- */
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

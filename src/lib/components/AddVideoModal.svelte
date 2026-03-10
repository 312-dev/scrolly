<script lang="ts">
	import { untrack } from 'svelte';
	import { createSafeTimeout } from '$lib/safeTimeout';
	import AddVideo from './AddVideo.svelte';
	import BaseSheet from './BaseSheet.svelte';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import QueueIcon from 'phosphor-svelte/lib/QueueIcon';
	import { page } from '$app/state';
	import { groupMembers } from '$lib/stores/members';
	import { queueCount } from '$lib/stores/queue';
	import { queueSheetOpen } from '$lib/stores/queueSheet';

	const isQueueMode = $derived(page.data.group?.sharePacingMode === 'queue');

	const { ondismiss, initialUrl }: { ondismiss: () => void; initialUrl?: string } = $props();

	let addVideoRef = $state<ReturnType<typeof AddVideo> | null>(null);
	let sheetRef = $state<ReturnType<typeof BaseSheet> | null>(null);

	const { safeTimeout, clearAll: clearTimeouts } = createSafeTimeout();

	// Focus URL input after sheet animates in
	$effect(() => {
		void untrack(() => addVideoRef);
		safeTimeout(() => addVideoRef?.focus(), 350);
		return clearTimeouts;
	});

	function handleSubmitted() {
		// Background the share — the processing toast AddVideo created
		// handles progress tracking. Dismiss the modal immediately.
		sheetRef?.dismiss();
	}

	function openQueue() {
		sheetRef?.dismiss();
		queueSheetOpen.set(true);
	}
</script>

<div class="add-video-wrapper">
	<BaseSheet bind:this={sheetRef} sheetId="addVideo" {ondismiss}>
		{#snippet header()}
			<div class="add-header">
				<span class="add-title">{isQueueMode ? 'Queue something' : 'Add to feed'}</span>
				<button class="close-btn" onclick={() => sheetRef?.dismiss()} aria-label="Close">
					<XIcon size={18} />
				</button>
			</div>
		{/snippet}

		<div class="sheet-body">
			<AddVideo
				bind:this={addVideoRef}
				onsubmitted={handleSubmitted}
				{initialUrl}
				members={$groupMembers}
			/>
			{#if $queueCount > 0}
				<button class="manage-queue-btn" onclick={openQueue}>
					<QueueIcon size={16} />
					<span>Manage queue ({$queueCount})</span>
				</button>
			{/if}
		</div>
	</BaseSheet>
</div>

<style>
	.add-video-wrapper :global(.base-sheet) {
		max-height: 80vh;
		transition:
			transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
			height 400ms cubic-bezier(0.32, 0.72, 0, 1),
			border-radius 400ms ease;
	}

	.add-header {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
		position: relative;
	}
	.add-title {
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

	.sheet-body {
		padding-bottom: max(var(--space-lg), env(safe-area-inset-bottom));
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	.manage-queue-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		width: 100%;
		padding: var(--space-sm) 0;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
	}
	.manage-queue-btn:active {
		opacity: 0.7;
	}
</style>

<script lang="ts">
	import { toast } from '$lib/stores/toasts';

	let {
		clipId,
		caption,
		canDelete,
		expanded,
		onexpandtoggle,
		oncaptionedit,
		ondelete,
		editing = $bindable(false),
		confirmingDelete = $bindable(false)
	}: {
		clipId: string;
		caption: string | null;
		canDelete: boolean;
		expanded: boolean;
		onexpandtoggle: () => void;
		oncaptionedit?: (clipId: string, newCaption: string | null) => void;
		ondelete?: (clipId: string) => void;
		editing?: boolean;
		confirmingDelete?: boolean;
	} = $props();

	let editValue = $state('');
	let saving = $state(false);
	let deleting = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);

	$effect(() => {
		if (editing) {
			editValue = caption || '';
			confirmingDelete = false;
			requestAnimationFrame(() => {
				inputEl?.focus();
			});
		}
	});

	function cancelEdit() {
		editing = false;
	}

	async function saveEdit() {
		if (!editing) return;
		editing = false;
		const newCaption = editValue.trim();
		if (newCaption === (caption || '').trim()) return;

		saving = true;
		try {
			const res = await fetch(`/api/clips/${clipId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newCaption })
			});
			if (res.ok) {
				oncaptionedit?.(clipId, newCaption || null);
			} else {
				toast.error('Failed to save caption');
			}
		} catch {
			toast.error('Failed to save caption');
		}
		saving = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEdit();
		}
	}

	async function handleDelete() {
		if (deleting) return;
		deleting = true;
		try {
			const res = await fetch(`/api/clips/${clipId}`, { method: 'DELETE' });
			if (res.ok) {
				ondelete?.(clipId);
			} else {
				toast.error('Failed to delete clip');
			}
		} catch {
			toast.error('Failed to delete clip');
		}
		deleting = false;
		confirmingDelete = false;
	}
</script>

{#if editing}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="caption-edit"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<textarea
			bind:this={inputEl}
			bind:value={editValue}
			autocomplete="off"
			onkeydown={handleKeydown}
			maxlength={500}
			rows={3}
			placeholder="Add a caption…"
		></textarea>
		<div class="edit-actions">
			<button class="host-action-btn" onclick={cancelEdit}>Cancel</button>
			<span class="host-action-dot">·</span>
			<button class="host-action-btn save" onclick={saveEdit} disabled={saving}>
				{saving ? 'Saving…' : 'Save'}
			</button>
		</div>
	</div>
{:else if caption}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="caption-wrapper"
		class:expanded
		ontouchstart={(e) => {
			if (expanded) e.stopPropagation();
		}}
		ontouchmove={(e) => {
			if (expanded) e.stopPropagation();
		}}
		ontouchend={(e) => {
			if (expanded) e.stopPropagation();
		}}
	>
		{#if expanded}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="overlay-caption expanded"
				onclick={(e) => {
					e.stopPropagation();
					onexpandtoggle();
				}}
			>
				{caption}
			</div>
		{:else}
			<button
				type="button"
				class="overlay-caption"
				onclick={(e) => {
					e.stopPropagation();
					onexpandtoggle();
				}}
			>
				{caption}
			</button>
		{/if}
	</div>
{/if}
{#if confirmingDelete && canDelete}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="confirm-row"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<span class="confirm-label">Delete this clip?</span>
		<button class="host-action-btn confirm-yes" onclick={handleDelete} disabled={deleting}>
			{deleting ? 'Deleting...' : 'Yes'}
		</button>
		<span class="host-action-dot">·</span>
		<button class="host-action-btn" onclick={() => (confirmingDelete = false)}>No</button>
	</div>
{/if}

<style>
	.caption-wrapper {
		max-height: 2.8em;
		overflow: hidden;
		border-radius: var(--radius-md);
		background: transparent;
		transition:
			max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			background 0.3s ease,
			padding 0.3s ease;
	}
	.caption-wrapper.expanded {
		max-height: 50vh;
		max-height: 50dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		padding: var(--space-md);
	}
	.overlay-caption {
		margin: 0;
		padding: 0;
		background: none;
		border: none;
		font: inherit;
		text-align: left;
		font-size: 0.875rem;
		color: var(--reel-text-bright);
		text-shadow: 0 1px 4px var(--reel-text-shadow);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		cursor: pointer;
		flex: 1;
	}
	.overlay-caption.expanded {
		-webkit-line-clamp: unset;
		line-clamp: unset;
		display: block;
		overflow: visible;
		cursor: pointer;
	}
	.caption-edit {
		animation: fade-in 0.15s ease;
	}
	.caption-edit textarea {
		width: 100%;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--reel-text-ghost);
		border-radius: var(--radius-sm);
		color: var(--reel-text-bright);
		font-size: 0.875rem;
		line-height: 1.4;
		padding: var(--space-sm);
		resize: none;
		outline: none;
	}
	.caption-edit textarea::placeholder {
		color: var(--reel-text-ghost);
	}
	.caption-edit textarea:focus {
		border-color: var(--reel-text-dim);
	}
	.edit-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--space-xs);
	}
	.confirm-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: var(--space-xs);
		animation: fade-in 0.15s ease;
	}
	.host-action-btn {
		background: none;
		border: none;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--reel-text-faint);
		cursor: pointer;
		padding: 0;
		text-shadow: 0 1px 3px var(--reel-text-shadow);
		transition: color 0.15s ease;
	}
	.host-action-btn:active {
		color: var(--reel-text-dim);
	}
	.host-action-btn.save {
		color: var(--accent-primary);
	}
	.host-action-btn.confirm-yes {
		color: var(--error);
	}
	.host-action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.host-action-dot {
		color: var(--reel-text-disabled);
		font-size: 0.6875rem;
		user-select: none;
	}
	.confirm-label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--reel-text-subtle);
		text-shadow: 0 1px 3px var(--reel-text-shadow);
		margin-right: 2px;
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

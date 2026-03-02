<script lang="ts">
	import GifIcon from 'phosphor-svelte/lib/GifIcon';
	import KeyboardIcon from 'phosphor-svelte/lib/KeyboardIcon';
	import MentionInput from './MentionInput.svelte';
	import type { GroupMember } from '$lib/types';

	const {
		replyingTo,
		submitting,
		gifEnabled = false,
		gifPickerOpen = false,
		attachedGif = null,
		members = [],
		onsubmit,
		oncancelreply,
		ongiftoggle,
		onremovegif
	}: {
		replyingTo: { id: string; username: string } | null;
		submitting: boolean;
		gifEnabled?: boolean;
		gifPickerOpen?: boolean;
		attachedGif: { url: string; stillUrl: string; shareUrl?: string } | null;
		members?: GroupMember[];
		onsubmit: (text: string, gifUrl?: string) => void;
		oncancelreply: () => void;
		ongiftoggle: () => void;
		onremovegif: () => void;
	} = $props();

	let text = $state('');
	let mentionInputRef = $state<ReturnType<typeof MentionInput> | null>(null);

	const canSubmit = $derived(text.trim().length > 0 || !!attachedGif);

	export function focus() {
		mentionInputRef?.focus();
	}

	export function clear() {
		text = '';
		mentionInputRef?.clear();
	}

	export function isEmpty() {
		return text.trim().length === 0;
	}

	function stripEmptyLines(s: string): string {
		return s
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.join('\n');
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit || submitting) return;
		onsubmit(stripEmptyLines(text.trim()), attachedGif?.shareUrl || attachedGif?.url);
	}

	function getGifBtnLabel() {
		if (gifPickerOpen) return 'Show keyboard';
		if (gifEnabled) return 'Attach GIF';
		return 'GIFs not available';
	}
	const gifBtnLabel = $derived(getGifBtnLabel());

	function handleInputFocus() {
		if (gifPickerOpen) {
			ongiftoggle();
		}
	}
</script>

{#if replyingTo}
	<div class="reply-indicator">
		<span>Replying to <strong>{replyingTo.username}</strong></span>
		<button class="cancel-reply" onclick={oncancelreply}>&times;</button>
	</div>
{/if}

{#if attachedGif}
	<div class="gif-preview">
		<img src={attachedGif.stillUrl} alt="Attached GIF" />
		<button class="remove-gif" onclick={onremovegif}>&times;</button>
	</div>
{/if}

<form class="input-bar" onsubmit={handleSubmit}>
	<button
		type="button"
		class="gif-btn"
		class:active={gifPickerOpen || !!attachedGif}
		disabled={!gifEnabled}
		onclick={ongiftoggle}
		aria-label={gifBtnLabel}
		title={gifEnabled ? '' : 'Host must configure GIPHY API key'}
	>
		{#if gifPickerOpen}
			<KeyboardIcon size={26} />
		{:else}
			<GifIcon size={26} />
		{/if}
	</button>
	<MentionInput
		bind:this={mentionInputRef}
		placeholder={replyingTo ? `Reply to ${replyingTo.username}...` : 'Add a comment...'}
		maxlength={500}
		disabled={submitting}
		{members}
		maxRows={3}
		onchange={(t) => {
			text = t;
		}}
		onfocus={handleInputFocus}
		onsubmit={() => {
			if (canSubmit && !submitting)
				onsubmit(stripEmptyLines(text.trim()), attachedGif?.shareUrl || attachedGif?.url);
		}}
	/>
	<button type="submit" disabled={!canSubmit || submitting}>Send</button>
</form>

<style>
	.reply-indicator {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-xs) var(--space-lg);
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		font-size: 0.75rem;
		color: var(--text-secondary);
		animation: reply-slide 200ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	@keyframes reply-slide {
		from {
			opacity: 0;
			transform: translateY(100%);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.reply-indicator strong {
		color: var(--text-primary);
	}

	.cancel-reply {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: var(--space-xs);
		line-height: 1;
	}

	.gif-preview {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-lg);
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
		position: relative;
	}
	.gif-preview img {
		height: 52px;
		border-radius: var(--radius-sm);
		object-fit: cover;
	}
	.remove-gif {
		background: var(--bg-subtle);
		border: none;
		color: var(--text-primary);
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.input-bar {
		display: flex;
		align-items: flex-end;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		border-top: 1px solid var(--border);
		background: var(--bg-surface);
		padding-bottom: max(12px, env(safe-area-inset-bottom));
	}
	.input-bar :global(.mention-input-wrap) {
		flex: 1;
		min-width: 0;
	}
	.input-bar :global(.mention-input-wrap .input-container) {
		border-radius: var(--radius-md);
	}
	.input-bar :global(.mention-input-wrap .overlay-input),
	.input-bar :global(.mention-input-wrap .highlight-mirror) {
		font-size: 1rem;
	}

	.gif-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		padding: 0;
		background: none;
		color: var(--text-muted);
		border: none;
		border-radius: var(--radius-full);
		cursor: pointer;
		transition: color 0.2s ease;
	}
	.gif-btn :global(svg) {
		width: 26px;
		height: 26px;
	}
	.gif-btn:active:not(:disabled) {
		transform: scale(0.93);
	}
	.gif-btn.active {
		color: var(--accent-primary);
	}
	.gif-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.input-bar button[type='submit'] {
		padding: var(--space-sm) var(--space-lg);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.input-bar button[type='submit']:active {
		transform: scale(0.97);
	}
	.input-bar button[type='submit']:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>

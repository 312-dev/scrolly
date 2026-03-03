<script lang="ts">
	import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon';
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
	<div class="input-pill" class:focused={false}>
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
		<div class="input-actions">
			{#if gifEnabled}
				<button
					type="button"
					class="gif-pill"
					class:active={gifPickerOpen || !!attachedGif}
					onclick={ongiftoggle}
					aria-label={gifBtnLabel}
				>
					GIF
				</button>
			{/if}
			<button
				type="submit"
				class="send-btn"
				class:active={canSubmit}
				disabled={!canSubmit || submitting}
				aria-label="Send comment"
				onmousedown={(e) => e.preventDefault()}
			>
				<PaperPlaneTiltIcon size={20} weight={canSubmit ? 'fill' : 'regular'} />
			</button>
		</div>
	</div>
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
		padding: var(--space-md) var(--space-lg);
		border-top: 1px solid var(--border);
		background: var(--bg-surface);
		padding-bottom: max(var(--space-md), env(safe-area-inset-bottom));
	}

	/* The pill is the visible rounded container — holds both the textarea and the action icons. */
	.input-pill {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		transition: border-color 0.2s ease;
	}
	.input-pill.focused {
		border-color: var(--accent-primary);
	}

	/* Strip visual chrome from MentionInput's container — the pill handles it now. */
	.input-pill :global(.mention-input-wrap) {
		flex: 1;
		min-width: 0;
	}
	.input-pill :global(.input-container) {
		background: transparent;
		border: none;
		border-radius: 0;
	}
	.input-pill :global(.input-container.focused) {
		border-color: transparent;
	}
	.input-pill :global(.overlay-input),
	.input-pill :global(.highlight-mirror) {
		font-size: 1rem;
		padding: 12px var(--space-md);
	}
	.input-pill :global(textarea.overlay-input) {
		height: calc(1.4em + 24px);
		-webkit-appearance: none;
		appearance: none;
	}

	/* Action buttons sit to the right of the textarea, vertically centered by the flex parent. */
	.input-actions {
		display: flex;
		align-items: center;
		align-self: center;
		gap: 4px;
		padding-right: 8px;
		flex-shrink: 0;
	}

	.gif-pill {
		padding: 3px 7px;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		font-size: 0.5625rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		line-height: 1.4;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.gif-pill.active {
		background: color-mix(in srgb, var(--accent-primary) 18%, var(--bg-subtle));
		border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border));
		color: var(--accent-primary);
	}
	.gif-pill:active {
		transform: scale(0.93);
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--radius-full);
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color 0.15s,
			transform 0.1s;
		flex-shrink: 0;
	}
	.send-btn.active {
		color: var(--accent-primary);
	}
	.send-btn:active:not(:disabled) {
		transform: scale(0.88);
	}
	.send-btn:disabled {
		cursor: not-allowed;
	}
</style>

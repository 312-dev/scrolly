<script lang="ts">
	import InlineError from './InlineError.svelte';
	import MentionInput from './MentionInput.svelte';
	import {
		isSupportedUrl,
		platformLabel,
		detectPlatform,
		isPlatformAllowed
	} from '$lib/url-validation';
	import { addToast } from '$lib/stores/toasts';
	import { showShortcutNudge } from '$lib/stores/shortcutNudge';
	import { page } from '$app/state';
	import type { GroupMember } from '$lib/types';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import ClipboardIcon from 'phosphor-svelte/lib/ClipboardIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import LightbulbIcon from 'phosphor-svelte/lib/LightbulbIcon';

	const {
		onsubmitted,
		initialUrl,
		members = []
	}: {
		onsubmitted?: (clip: {
			id: string;
			status: string;
			contentType: string;
			shareCountToday?: number;
			dailyShareLimit?: number | null;
		}) => void;
		initialUrl?: string;
		members?: GroupMember[];
	} = $props();

	const hasProvider = $derived(!!page.data.group?.downloadProvider);
	const platformFilterMode = $derived((page.data.group?.platformFilterMode as string) ?? 'all');
	const platformFilterList = $derived<string[] | null>(
		page.data.group?.platformFilterList
			? JSON.parse(page.data.group.platformFilterList as string)
			: null
	);
	let url = $state('');
	let message = $state('');
	let error = $state('');
	let loading = $state(false);
	let urlInput = $state<HTMLInputElement | null>(null);
	let messageInput = $state<ReturnType<typeof MentionInput> | null>(null);
	let clipboardSuggestion = $state<{ url: string; label: string } | null>(null);

	const detectedPlatform = $derived(url.trim() ? detectPlatform(url.trim()) : null);
	const platformBlocked = $derived(
		detectedPlatform
			? !isPlatformAllowed(detectedPlatform, platformFilterMode, platformFilterList)
			: false
	);

	// Hide clipboard suggestion if the URL input already matches it
	const showClipboard = $derived(
		clipboardSuggestion !== null && url.trim() !== clipboardSuggestion.url
	);

	export function focus() {
		urlInput?.focus();
	}

	// Seed URL from prop
	$effect.pre(() => {
		if (initialUrl) url = initialUrl;
	});

	// Attempt clipboard read on mount (requires user gesture — modal tap counts)
	$effect(() => {
		if (initialUrl) return;
		(async () => {
			try {
				const text = await navigator.clipboard.readText();
				const trimmed = text?.trim();
				if (trimmed && isSupportedUrl(trimmed)) {
					const detected = detectPlatform(trimmed);
					if (detected && isPlatformAllowed(detected, platformFilterMode, platformFilterList)) {
						const label = platformLabel(trimmed);
						if (label) {
							clipboardSuggestion = { url: trimmed, label };
						}
					}
				}
			} catch {
				// Clipboard permission denied or API unavailable
			}
		})();
	});

	function acceptClipboard() {
		if (clipboardSuggestion) {
			url = clipboardSuggestion.url;
			clipboardSuggestion = null;
		}
	}

	function dismissClipboard() {
		clipboardSuggestion = null;
	}

	function handleUrlKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			messageInput?.focus();
		}
	}

	async function handleSubmit() {
		error = '';
		loading = true;
		try {
			const trimmedMessage = message.trim();
			const res = await fetch('/api/clips', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: url.trim(),
					tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
					...(trimmedMessage ? { message: trimmedMessage } : {})
				})
			});
			const data = await res.json();
			if (!res.ok) {
				if (res.status === 429 && data.limitReached) {
					const count = data.shareCountToday + '/' + data.dailyShareLimit;
					const suffix = data.resetsIn ? ' Resets in ' + data.resetsIn + '.' : '';
					error = 'Daily limit reached (' + count + ').' + suffix;
				} else {
					error = data.error || 'Failed to add video';
				}
				return;
			}
			url = '';
			message = '';
			messageInput?.clear();
			addToast({
				type: 'processing',
				message: `Adding ${data.clip.contentType === 'music' ? 'song' : 'video'} to feed...`,
				clipId: data.clip.id,
				contentType: data.clip.contentType,
				autoDismiss: 0
			});
			onsubmitted?.({
				...data.clip,
				shareCountToday: data.shareCountToday,
				dailyShareLimit: data.dailyShareLimit
			});
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}
</script>

{#if !hasProvider}
	<div class="add-video no-provider-state">
		<DownloadSimpleIcon size={40} class="no-provider-icon" />
		<p class="no-provider-title">No download provider set up</p>
		<p class="no-provider-desc">Ask your group host to configure one in Settings.</p>
	</div>
{:else}
	<form
		class="add-video"
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		{#if showClipboard}
			<div class="clipboard-suggestion">
				<div class="suggestion-content">
					<ClipboardIcon size={18} class="suggestion-icon" />
					<div class="suggestion-text">
						<span class="suggestion-label">Paste from {clipboardSuggestion?.label}?</span>
						<span class="suggestion-url">{clipboardSuggestion?.url}</span>
					</div>
				</div>
				<div class="suggestion-actions">
					<button type="button" class="suggestion-confirm" onclick={acceptClipboard}>
						Paste
					</button>
					<button
						type="button"
						class="suggestion-dismiss"
						onclick={dismissClipboard}
						aria-label="Dismiss"
					>
						<XIcon size={16} />
					</button>
				</div>
			</div>
		{/if}

		<div class="compose-fields">
			<div class="field-row">
				<span class="field-label">Link</span>
				<div class="field-input-wrap" class:has-error={!!error}>
					<input
						bind:this={urlInput}
						type="url"
						inputmode="url"
						autocomplete="off"
						bind:value={url}
						placeholder="Paste a link..."
						disabled={loading}
						onkeydown={handleUrlKeydown}
					/>
					<button
						type="submit"
						class="submit-btn"
						disabled={loading || !url.trim() || platformBlocked}
					>
						{#if loading}
							<span class="spinner"></span>
						{:else}
							<ArrowRightIcon size={20} weight="bold" />
						{/if}
					</button>
				</div>
			</div>

			<div class="field-divider"></div>

			<div class="field-row message-row">
				<span class="field-label">Message</span>
				<MentionInput
					bind:this={messageInput}
					placeholder="Add a message (optional)"
					maxlength={500}
					disabled={loading}
					{members}
					onchange={(text) => {
						message = text;
					}}
				/>
			</div>
		</div>

		{#if platformBlocked}
			<p class="platform-blocked">{platformLabel(url.trim())} links aren't allowed in this group</p>
		{/if}
		<InlineError message={error} />

		{#if $showShortcutNudge}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/share/setup" class="share-hint">
				<LightbulbIcon size={14} />
				Share clips faster from other apps
			</a>
		{/if}
	</form>
{/if}

<style>
	.add-video {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-lg) var(--space-lg);
	}
	.clipboard-suggestion {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		animation: slide-in 0.2s ease;
	}
	.suggestion-content {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-width: 0;
		flex: 1;
	}
	.suggestion-content :global(.suggestion-icon) {
		width: 18px;
		height: 18px;
		color: var(--accent-primary);
		flex-shrink: 0;
	}
	.suggestion-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.suggestion-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.suggestion-url {
		font-size: 0.6875rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.suggestion-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-shrink: 0;
	}
	.suggestion-confirm {
		padding: var(--space-xs) var(--space-md);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
	.suggestion-dismiss {
		background: none;
		border: none;
		padding: 4px;
		color: var(--text-muted);
		cursor: pointer;
	}
	.suggestion-dismiss :global(svg) {
		width: 16px;
		height: 16px;
	}
	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.compose-fields {
		width: 100%;
		background: var(--bg-elevated);
		border: 1.5px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}
	.compose-fields:focus-within {
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 15%, transparent);
	}
	.field-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-md);
	}
	.message-row {
		align-items: flex-start;
		padding-top: var(--space-sm);
		padding-bottom: var(--space-sm);
	}
	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
		flex-shrink: 0;
		min-width: 56px;
	}
	.message-row .field-label {
		padding-top: var(--space-xs);
	}
	.field-divider {
		height: 1px;
		background: var(--border);
		margin: 0 var(--space-md);
	}
	.field-input-wrap {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}
	.field-input-wrap.has-error input {
		color: var(--error);
	}
	.field-input-wrap input {
		flex: 1;
		padding: 10px 0;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.9375rem;
		font-family: var(--font-body);
		outline: none;
		min-width: 0;
	}

	.field-input-wrap input::placeholder {
		color: var(--text-muted);
	}

	.field-row :global(.mention-input-wrap) {
		flex: 1;
		min-width: 0;
	}

	.field-row :global(.mention-input-wrap .input-container) {
		border: none;
		background: transparent;
	}
	.field-row :global(.mention-input-wrap .overlay-input),
	.field-row :global(.mention-input-wrap .highlight-mirror) {
		padding: var(--space-xs) 0;
		font-size: 0.9375rem;
	}

	.submit-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		cursor: pointer;
		transition:
			transform 0.1s ease,
			opacity 0.15s ease;
	}

	.submit-btn :global(svg) {
		width: 18px;
		height: 18px;
	}
	.submit-btn:active {
		transform: scale(0.92);
	}
	.submit-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2.5px solid rgba(0, 0, 0, 0.15);
		border-top-color: var(--bg-primary);
		border-radius: var(--radius-full);
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.platform-blocked {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--error);
		text-align: center;
	}
	.no-provider-state {
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: var(--space-2xl) var(--space-lg);
	}
	.no-provider-state :global(.no-provider-icon) {
		width: 40px;
		height: 40px;
		color: var(--text-muted);
		opacity: 0.4;
		margin-bottom: var(--space-md);
	}
	.no-provider-title {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs);
	}
	.no-provider-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: 0;
	}
	.share-hint {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.75rem;
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.share-hint :global(svg) {
		flex-shrink: 0;
	}
</style>

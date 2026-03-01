<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from '$lib/stores/toasts';
	import { confirm } from '$lib/stores/confirm';
	import BaseSheet from '$lib/components/BaseSheet.svelte';
	import QuestionIcon from 'phosphor-svelte/lib/QuestionIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import ValidationResults from './ValidationResults.svelte';

	const ICLOUD_SHORTCUT_RE = /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}\/?$/;
	const SOFT_CODES = ['bad_name', 'localhost_url'];
	const UNREACHABLE_CODES = ['fetch_failed'];

	let {
		shortcutUrl: propUrl,
		shortcutToken: propToken,
		ondismiss
	}: {
		shortcutUrl: string | null;
		shortcutToken: string | null;
		ondismiss: () => void;
	} = $props();

	let savedUrl = $state(propUrl ?? '');
	let shortcutUrl = $state(propUrl ?? '');
	let saving = $state(false);
	let validating = $state(false);
	let validationError = $state('');
	let validationWarnings = $state<{ code: string; message: string }[]>([]);
	let validated = $state(false);
	let token = $state(propToken);
	let rotating = $state(false);

	const isConfigured = $derived(savedUrl.length > 0);
	const isDirty = $derived(shortcutUrl.trim() !== savedUrl);
	const canSave = $derived(isDirty && !saving && !validating);

	const blockers = $derived(
		validationWarnings.filter(
			(w) => !SOFT_CODES.includes(w.code) && !UNREACHABLE_CODES.includes(w.code)
		)
	);
	const softWarnings = $derived(validationWarnings.filter((w) => SOFT_CODES.includes(w.code)));
	const isUnreachable = $derived(
		validationWarnings.some((w) => UNREACHABLE_CODES.includes(w.code))
	);
	const hasBlockers = $derived(blockers.length > 0);
	const hasSoftOnly = $derived(softWarnings.length > 0 && !hasBlockers && !isUnreachable);

	async function doSave(trimmed: string | null) {
		saving = true;
		try {
			const res = await fetch('/api/group/shortcut', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shortcutUrl: trimmed })
			});
			if (res.ok) {
				const data = await res.json();
				shortcutUrl = data.shortcutUrl ?? '';
				savedUrl = data.shortcutUrl ?? '';
				validationWarnings = [];
				validated = false;
				toast.success(trimmed ? 'Shortcut link saved' : 'Shortcut link removed');
			} else {
				const data = await res.json();
				toast.error(data.error || 'Failed to save');
			}
		} catch {
			toast.error('Failed to save');
		} finally {
			saving = false;
		}
	}

	async function validateAndSave() {
		const trimmed = shortcutUrl.trim();
		if (trimmed === savedUrl) {
			validationError = '';
			return;
		}
		if (!trimmed) {
			validationError = '';
			await doSave(null);
			return;
		}
		if (!ICLOUD_SHORTCUT_RE.test(trimmed)) {
			validationError =
				'Must be a valid iCloud shortcut link (https://www.icloud.com/shortcuts/...)';
			return;
		}

		validationError = '';
		validating = true;
		validated = false;
		validationWarnings = [];
		try {
			const res = await fetch('/api/group/shortcut/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shortcutUrl: trimmed })
			});
			if (res.ok) {
				const data = await res.json();
				validationWarnings = data.warnings ?? [];
				validated = true;
				if (validationWarnings.length === 0) {
					await doSave(trimmed);
				}
			} else {
				const data = await res.json();
				toast.error(data.error || 'Validation failed');
			}
		} catch {
			toast.error('Could not validate shortcut');
		} finally {
			validating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (canSave) validateAndSave();
		}
	}

	function handleInput() {
		if (validationError) validationError = '';
		if (validated) {
			validated = false;
			validationWarnings = [];
		}
	}

	async function rotateToken() {
		const confirmed = await confirm({
			title: 'Rotate group token?',
			message:
				'This will invalidate the current token and break all iOS Shortcuts that are already configured with it. Every group member will need to re-install the shortcut with the new token.',
			confirmLabel: 'Rotate Token',
			destructive: true
		});
		if (!confirmed) return;

		rotating = true;
		try {
			const res = await fetch('/api/group/shortcut/regenerate-token', { method: 'POST' });
			if (res.ok) {
				const data = await res.json();
				token = data.shortcutToken;
				toast.success('Token rotated — update your shortcuts');
			} else {
				const data = await res.json();
				toast.error(data.error || 'Failed to rotate token');
			}
		} catch {
			toast.error('Failed to rotate token');
		} finally {
			rotating = false;
		}
	}
</script>

<BaseSheet title="iOS Shortcut" sheetId="ios-shortcut" {ondismiss}>
	<div class="sheet-content">
		<a href={resolve('/share/setup')} class="setup-link">
			<QuestionIcon size={20} />
			<div class="setup-link-text">
				<span class="setup-link-title">Set up the iOS Shortcut</span>
				<span class="setup-link-desc"
					>Download the template, customize, and share with your group</span
				>
			</div>
			<CaretRightIcon size={16} class="setup-link-chevron" />
		</a>

		<div class="subsection">
			<div class="subsection-label">iCloud Shortcut Link</div>
			<p class="subsection-desc">
				Paste the iCloud link so iOS members see a "Get Shortcut" button.
			</p>
			<div class="url-row">
				<input
					type="url"
					class="icloud-input"
					class:invalid={validationError}
					bind:value={shortcutUrl}
					onkeydown={handleKeydown}
					oninput={handleInput}
					placeholder="https://www.icloud.com/shortcuts/..."
					disabled={saving || validating}
				/>
				<button
					class="save-btn"
					class:saved={!isDirty && isConfigured}
					onclick={validateAndSave}
					disabled={!canSave}
				>
					{#if validating}
						Checking…
					{:else if saving}
						Saving…
					{:else if !isDirty && isConfigured}
						Saved
					{:else}
						Save
					{/if}
				</button>
			</div>
			{#if validationError}
				<p class="input-error">{validationError}</p>
			{/if}

			{#if validated && validationWarnings.length > 0}
				<ValidationResults
					{blockers}
					{softWarnings}
					{isUnreachable}
					{hasBlockers}
					{hasSoftOnly}
					{validating}
					{saving}
					onRevalidate={validateAndSave}
					onSaveAnyway={() => doSave(shortcutUrl.trim())}
				/>
			{/if}
		</div>

		{#if token}
			<div class="subsection">
				<div class="subsection-label">Shortcut Token</div>
				<p class="subsection-desc">Authenticates shortcut requests. Rotate if compromised.</p>
				<div class="token-row">
					<code class="token-value">{token.slice(0, 8)}…{token.slice(-4)}</code>
					<button class="rotate-btn" onclick={rotateToken} disabled={rotating}>
						<ArrowsClockwiseIcon size={16} />
						{rotating ? 'Rotating…' : 'Rotate'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</BaseSheet>

<style>
	.sheet-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		padding: var(--space-sm) var(--space-lg) var(--space-xl);
		padding-bottom: calc(var(--space-xl) + env(safe-area-inset-bottom, 0px));
		max-height: 70dvh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	.setup-link {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
		background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent);
		border-radius: var(--radius-sm);
		text-decoration: none;
		transition: transform 0.1s ease;
	}
	.setup-link:active {
		transform: scale(0.98);
	}
	.setup-link > :global(svg:first-child) {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--accent-primary);
	}
	.setup-link-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}
	.setup-link-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.setup-link-desc {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}
	.setup-link :global(.setup-link-chevron) {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--text-muted);
	}
	.subsection {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.subsection-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.subsection-desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
		line-height: 1.4;
	}
	.url-row {
		display: flex;
		gap: var(--space-sm);
		align-items: stretch;
	}
	.icloud-input {
		flex: 1;
		min-width: 0;
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.8125rem;
		outline: none;
		transition: border-color 0.2s ease;
		box-sizing: border-box;
	}
	.icloud-input::placeholder {
		color: var(--text-muted);
	}
	.icloud-input:focus {
		border-color: var(--accent-primary);
	}
	.icloud-input.invalid:not(:focus) {
		border-color: var(--error);
	}
	.icloud-input:disabled {
		opacity: 0.5;
	}
	.save-btn {
		flex-shrink: 0;
		padding: var(--space-sm) var(--space-md);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s ease;
	}
	.save-btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.save-btn:disabled {
		cursor: default;
	}
	.save-btn.saved {
		background: var(--bg-surface);
		color: var(--text-muted);
	}
	.save-btn:disabled:not(.saved) {
		opacity: 0.5;
	}
	.input-error {
		font-size: 0.8125rem;
		color: var(--error);
		margin: 0;
	}
	.token-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
	}
	.token-value {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		font-family: monospace;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rotate-btn {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-sm);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s ease;
	}
	.rotate-btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.rotate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

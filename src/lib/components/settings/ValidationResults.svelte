<script lang="ts">
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';

	type Warning = { code: string; message: string };

	let {
		blockers,
		softWarnings,
		isUnreachable,
		hasBlockers,
		hasSoftOnly,
		validating,
		saving,
		onRevalidate,
		onSaveAnyway
	}: {
		blockers: Warning[];
		softWarnings: Warning[];
		isUnreachable: boolean;
		hasBlockers: boolean;
		hasSoftOnly: boolean;
		validating: boolean;
		saving: boolean;
		onRevalidate: () => void;
		onSaveAnyway: () => void;
	} = $props();
</script>

<div class="validation-results">
	{#if isUnreachable}
		<div class="validation-warning">
			<WarningIcon size={14} weight="fill" />
			<span>Could not reach iCloud to validate. You can save without checking.</span>
		</div>
		<div class="validation-actions">
			<button class="action-btn revalidate" onclick={onRevalidate} disabled={validating}>
				{validating ? 'Checking…' : 'Retry'}
			</button>
			<button class="action-btn save-anyway" onclick={onSaveAnyway} disabled={saving}>
				{saving ? 'Saving…' : 'Save Without Validating'}
			</button>
		</div>
	{:else if hasBlockers}
		{#each blockers as warning (warning.code + warning.message)}
			<div class="validation-blocker">
				<WarningIcon size={14} weight="fill" />
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-generated, no user input -->
				<span>{@html warning.message}</span>
			</div>
		{/each}
		<div class="validation-actions">
			<button class="action-btn revalidate" onclick={onRevalidate} disabled={validating}>
				{validating ? 'Checking…' : 'Re-validate'}
			</button>
		</div>
	{:else if hasSoftOnly}
		{#each softWarnings as warning (warning.code + warning.message)}
			<div class="validation-warning">
				<WarningIcon size={14} weight="fill" />
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-generated, no user input -->
				<span>{@html warning.message}</span>
			</div>
		{/each}
		<div class="validation-actions">
			<button class="action-btn save-anyway" onclick={onSaveAnyway} disabled={saving}>
				{saving ? 'Saving…' : 'Save Anyway'}
			</button>
		</div>
	{/if}
</div>

<style>
	.validation-results {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.validation-blocker {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in srgb, var(--error) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
		border-radius: var(--radius-sm);
	}
	.validation-blocker :global(svg) {
		flex-shrink: 0;
		color: var(--error);
		margin-top: 2px;
	}
	.validation-blocker span {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}
	.validation-blocker span :global(b) {
		color: var(--text-primary);
		font-weight: 600;
	}
	.validation-warning {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in srgb, var(--warning) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--warning) 20%, transparent);
		border-radius: var(--radius-sm);
	}
	.validation-warning :global(svg) {
		flex-shrink: 0;
		color: var(--warning);
		margin-top: 2px;
	}
	.validation-warning span {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}
	.validation-warning span :global(b) {
		color: var(--text-primary);
		font-weight: 600;
	}
	.validation-actions {
		display: flex;
		gap: var(--space-sm);
	}
	.action-btn {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.action-btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-btn.revalidate {
		background: var(--accent-primary);
		color: var(--bg-primary);
	}
	.action-btn.save-anyway {
		background: var(--bg-surface);
		color: var(--text-primary);
		border: 1px solid var(--border);
	}
</style>

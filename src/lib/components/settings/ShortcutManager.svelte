<script lang="ts">
	import AppleLogoIcon from 'phosphor-svelte/lib/AppleLogoIcon';
	import AndroidLogoIcon from 'phosphor-svelte/lib/AndroidLogoIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import ShortcutSheet from './ShortcutSheet.svelte';

	let {
		shortcutUrl: propUrl,
		shortcutToken: propToken
	}: {
		shortcutUrl: string | null;
		shortcutToken: string | null;
	} = $props();

	let showSheet = $state(false);

	const isConfigured = $derived((propUrl ?? '').length > 0);
</script>

<div class="shortcut-manager">
	<p class="intro-desc">
		Let members share clips directly from other apps without opening scrolly first.
	</p>

	<div class="platform-list">
		<div class="platform-row">
			<AndroidLogoIcon size={18} />
			<div class="platform-info">
				<span class="platform-title">Android</span>
				<span class="platform-desc">
					<CheckCircleIcon size={13} class="check-icon" />
					Works automatically when the app is installed
				</span>
			</div>
		</div>

		<button class="platform-row ios-row" onclick={() => (showSheet = true)}>
			<AppleLogoIcon size={18} />
			<div class="platform-info">
				<span class="platform-title">iOS</span>
				{#if isConfigured}
					<span class="platform-desc">
						<CheckCircleIcon size={13} class="check-icon" />
						Shortcut configured
					</span>
				{:else}
					<span class="platform-desc">Requires an iOS Shortcut — tap to set up</span>
				{/if}
			</div>
			<CaretRightIcon size={14} class="row-chevron" />
		</button>
	</div>
</div>

{#if showSheet}
	<ShortcutSheet
		shortcutUrl={propUrl}
		shortcutToken={propToken}
		ondismiss={() => (showSheet = false)}
	/>
{/if}

<style>
	.shortcut-manager {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.intro-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin: 0;
		line-height: 1.4;
	}
	.platform-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.platform-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
	}
	.platform-row > :global(svg:first-child) {
		flex-shrink: 0;
		color: var(--text-secondary);
	}
	.platform-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.platform-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.platform-desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.platform-desc :global(.check-icon) {
		color: var(--success);
		flex-shrink: 0;
	}
	.ios-row {
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: var(--radius-sm);
		margin: 0 calc(-1 * var(--space-sm));
		padding: var(--space-sm);
		transition: background 0.15s ease;
	}
	.ios-row:active {
		background: var(--bg-surface);
	}
	.ios-row :global(.row-chevron) {
		flex-shrink: 0;
		color: var(--text-muted);
	}
</style>

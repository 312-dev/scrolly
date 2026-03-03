<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		name = '',
		description = '',
		last = false,
		first = false,
		children
	}: {
		name?: string;
		description?: string;
		last?: boolean;
		first?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div class="setting-row" class:last class:first>
	<div class="setting-label">
		{#if name}
			<span class="setting-name">{name}</span>
		{/if}
		{#if description}
			<span class="setting-desc">{description}</span>
		{/if}
	</div>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--bg-surface);
	}

	.setting-row.first {
		padding-top: 0;
	}

	.setting-row:first-child {
		padding-top: 0;
	}

	.setting-row.last,
	.setting-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.setting-label {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.setting-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.setting-desc {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>

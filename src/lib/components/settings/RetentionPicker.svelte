<script lang="ts">
	import { toast } from '$lib/stores/toasts';

	const { currentRetention }: { currentRetention: number | null } = $props();

	let retentionOverride = $state<string | null>(null);
	const retention = $derived(
		retentionOverride ?? (currentRetention === null ? 'forever' : String(currentRetention))
	);
	let saving = $state(false);

	const options = [
		{ value: 'forever', label: 'Keep forever' },
		{ value: '7', label: '7 days' },
		{ value: '14', label: '14 days' },
		{ value: '30', label: '30 days' },
		{ value: '60', label: '60 days' },
		{ value: '90', label: '90 days' }
	];

	const description = $derived(
		retention === 'forever'
			? 'Clips are kept indefinitely.'
			: `Clips older than ${retention} days will be automatically removed.`
	);

	async function handleChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		const previousValue = retention;
		retentionOverride = value;
		saving = true;

		try {
			const retentionDays = value === 'forever' ? null : parseInt(value);
			const res = await fetch('/api/group/retention', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ retentionDays })
			});
			if (!res.ok) {
				retentionOverride = previousValue;
				toast.error('Failed to update retention policy');
			}
		} catch {
			retentionOverride = previousValue;
			toast.error('Failed to update retention policy');
		} finally {
			saving = false;
		}
	}
</script>

<div class="retention-picker">
	<div class="select-wrapper">
		<select value={retention} onchange={handleChange} disabled={saving}>
			{#each options as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<svg
			class="select-chevron"
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg
		>
	</div>
	<p class="desc">{description}</p>
</div>

<style>
	.retention-picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.select-wrapper {
		position: relative;
	}

	select {
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
		cursor: pointer;
		transition: border-color 0.2s ease;
		appearance: none;
		padding-right: 2.5rem;
	}

	.select-chevron {
		position: absolute;
		right: var(--space-md);
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-secondary);
		pointer-events: none;
	}

	select:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
	}
</style>

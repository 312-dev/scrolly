<script lang="ts">
	import { toast } from '$lib/stores/toasts';

	const { currentLimit }: { currentLimit: number | null } = $props();

	let limitOverride = $state<string | null>(null);
	const limit = $derived(
		limitOverride ?? (currentLimit === null ? 'unlimited' : String(currentLimit))
	);
	let saving = $state(false);

	const options = [
		{ value: 'unlimited', label: 'Unlimited' },
		{ value: '1', label: '1 per day' },
		{ value: '3', label: '3 per day' },
		{ value: '5', label: '5 per day' },
		{ value: '10', label: '10 per day' },
		{ value: '15', label: '15 per day' },
		{ value: '20', label: '20 per day' },
		{ value: '25', label: '25 per day' },
		{ value: '50', label: '50 per day' }
	];

	const plural = $derived(limit === '1' ? '' : 's');
	const description = $derived(
		limit === 'unlimited'
			? 'Members can share unlimited clips per day.'
			: `Each member can share up to ${limit} clip${plural} per day.`
	);

	async function handleChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		const previousValue = limit;
		limitOverride = value;
		saving = true;

		try {
			const dailyShareLimit = value === 'unlimited' ? null : parseInt(value);
			const res = await fetch('/api/group/daily-share-limit', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dailyShareLimit })
			});
			if (!res.ok) {
				limitOverride = previousValue;
				toast.error('Failed to update daily share limit');
			}
		} catch {
			limitOverride = previousValue;
			toast.error('Failed to update daily share limit');
		} finally {
			saving = false;
		}
	}
</script>

<div class="limit-picker">
	<div class="select-wrapper">
		<select value={limit} onchange={handleChange} disabled={saving}>
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
	.limit-picker {
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

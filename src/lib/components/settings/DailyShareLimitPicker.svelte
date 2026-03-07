<script lang="ts">
	import { toast } from '$lib/stores/toasts';

	const { currentLimit }: { currentLimit: number | null } = $props();

	let inputValue = $state(currentLimit === null ? '' : String(currentLimit));
	let saving = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const effectiveLimit = $derived(inputValue === '' ? null : parseInt(inputValue));
	const isValid = $derived(
		inputValue === '' ||
			(!isNaN(Number(inputValue)) &&
				Number(inputValue) >= 1 &&
				Number.isInteger(Number(inputValue)))
	);
	const plural = $derived(effectiveLimit === 1 ? '' : 's');
	const description = $derived(
		effectiveLimit === null
			? 'Members can share unlimited clips per day.'
			: `Each member can share up to ${effectiveLimit} clip${plural} per day.`
	);

	function handleInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		// Only allow digits
		inputValue = raw.replace(/\D/g, '');

		if (!isValid) return;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => save(), 600);
	}

	function handleBlur() {
		clearTimeout(debounceTimer);
		if (isValid) save();
	}

	async function save() {
		const dailyShareLimit = effectiveLimit;
		saving = true;

		try {
			const res = await fetch('/api/group/daily-share-limit', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dailyShareLimit })
			});
			if (!res.ok) {
				toast.error('Failed to update daily share limit');
			}
		} catch {
			toast.error('Failed to update daily share limit');
		} finally {
			saving = false;
		}
	}
</script>

<div class="limit-picker">
	<div class="input-wrapper">
		<input
			type="text"
			inputmode="numeric"
			pattern="[0-9]*"
			placeholder="Unlimited"
			value={inputValue}
			oninput={handleInput}
			onblur={handleBlur}
			disabled={saving}
			class:invalid={!isValid}
		/>
		{#if inputValue !== ''}
			<span class="suffix">per day</span>
		{/if}
	</div>
	<p class="desc">{description}</p>
</div>

<style>
	.limit-picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	input {
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-primary);
		transition: border-color 0.2s ease;
	}

	input::placeholder {
		color: var(--text-muted);
	}

	input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	input.invalid {
		border-color: var(--error);
	}

	.suffix {
		position: absolute;
		right: var(--space-lg);
		font-size: 0.8125rem;
		color: var(--text-secondary);
		pointer-events: none;
	}

	.desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
	}
</style>

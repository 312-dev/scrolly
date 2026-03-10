<script lang="ts">
	import { toast } from '$lib/stores/toasts';

	const {
		currentMode,
		currentBurst,
		currentCooldown,
		currentDailyLimit
	}: {
		currentMode: string;
		currentBurst: number;
		currentCooldown: number;
		currentDailyLimit: number | null;
	} = $props();

	let mode = $state(currentMode);
	let burst = $state(currentBurst);
	let cooldown = $state(currentCooldown);
	let dailyLimit = $state(currentDailyLimit === null ? '' : String(currentDailyLimit));
	let saving = $state(false);

	const cooldownOptions = [
		{ value: 30, label: '30m' },
		{ value: 60, label: '1h' },
		{ value: 120, label: '2h' },
		{ value: 240, label: '4h' },
		{ value: 360, label: '6h' }
	];

	async function save(updates: Record<string, unknown>) {
		saving = true;
		try {
			const res = await fetch('/api/group/share-pacing', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});
			if (!res.ok) {
				const data = await res.json();
				toast.error(data.error || 'Failed to update share pacing');
			}
		} catch {
			toast.error('Failed to update share pacing');
		} finally {
			saving = false;
		}
	}

	function selectMode(newMode: string) {
		mode = newMode;
		save({ sharePacingMode: newMode });
	}

	function adjustBurst(delta: number) {
		const next = Math.max(1, Math.min(10, burst + delta));
		if (next === burst) return;
		burst = next;
		save({ shareBurst: next });
	}

	function selectCooldown(value: number) {
		cooldown = value;
		save({ shareCooldownMinutes: value });
	}

	function handleDailyLimitInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '');
		dailyLimit = raw;
	}

	function handleDailyLimitBlur() {
		const parsed = dailyLimit === '' ? null : parseInt(dailyLimit);
		if (parsed !== null && (isNaN(parsed) || parsed < 1)) return;
		save({ dailyShareLimit: parsed });
	}
</script>

<div class="pacing-picker">
	<button
		class="mode-card"
		class:selected={mode === 'off'}
		onclick={() => selectMode('off')}
		disabled={saving}
	>
		<div class="mode-header">
			<span class="radio" class:checked={mode === 'off'}></span>
			<span class="mode-label">Off</span>
		</div>
		<p class="mode-desc">No limits on sharing.</p>
	</button>

	<button
		class="mode-card"
		class:selected={mode === 'daily_cap'}
		onclick={() => selectMode('daily_cap')}
		disabled={saving}
	>
		<div class="mode-header">
			<span class="radio" class:checked={mode === 'daily_cap'}></span>
			<span class="mode-label">Daily Cap</span>
		</div>
		<p class="mode-desc">Hard limit that resets at midnight.</p>
		{#if mode === 'daily_cap'}
			<div class="mode-controls" onclick={(e) => e.stopPropagation()}>
				<label class="control-label">
					<span>Limit</span>
					<div class="limit-input-wrap">
						<input
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							placeholder="Unlimited"
							value={dailyLimit}
							oninput={handleDailyLimitInput}
							onblur={handleDailyLimitBlur}
							disabled={saving}
						/>
						{#if dailyLimit !== ''}
							<span class="input-suffix">per day</span>
						{/if}
					</div>
				</label>
			</div>
		{/if}
	</button>

	<button
		class="mode-card"
		class:selected={mode === 'queue'}
		onclick={() => selectMode('queue')}
		disabled={saving}
	>
		<div class="mode-header">
			<span class="radio" class:checked={mode === 'queue'}></span>
			<span class="mode-label">Queue & Space</span>
		</div>
		<p class="mode-desc">Clips always accepted — extras space out over time.</p>
		{#if mode === 'queue'}
			<div class="mode-controls" onclick={(e) => e.stopPropagation()}>
				<label class="control-label">
					<span>Quick shares</span>
					<div class="stepper">
						<button
							class="step-btn"
							onclick={() => adjustBurst(-1)}
							disabled={burst <= 1 || saving}
						>
							−
						</button>
						<span class="step-value">{burst}</span>
						<button
							class="step-btn"
							onclick={() => adjustBurst(1)}
							disabled={burst >= 10 || saving}
						>
							+
						</button>
					</div>
				</label>
				<div class="control-label">
					<span>Queue spacing</span>
					<div class="cooldown-options">
						{#each cooldownOptions as opt (opt.value)}
							<button
								class="cooldown-btn"
								class:active={cooldown === opt.value}
								onclick={() => selectCooldown(opt.value)}
								disabled={saving}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</button>
</div>

<style>
	.pacing-picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.mode-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-surface);
		border: 1.5px solid var(--border);
		border-radius: var(--radius-md);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.2s ease;
		color: var(--text-primary);
		font-family: var(--font-body);
	}

	.mode-card:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.mode-card.selected {
		border-color: var(--accent-primary);
	}

	.mode-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.radio {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid var(--border);
		flex-shrink: 0;
		position: relative;
		transition: border-color 0.2s ease;
	}

	.radio.checked {
		border-color: var(--accent-primary);
	}

	.radio.checked::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-primary);
	}

	.mode-label {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.mode-desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
		padding-left: 26px;
	}

	.mode-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md) 0 var(--space-xs) 26px;
	}

	.control-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.limit-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.limit-input-wrap input {
		width: 110px;
		padding: var(--space-xs) 52px var(--space-xs) var(--space-sm);
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
		text-align: left;
	}

	.limit-input-wrap input::placeholder {
		color: var(--text-muted);
	}

	.limit-input-wrap input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.input-suffix {
		position: absolute;
		right: var(--space-sm);
		font-size: 0.6875rem;
		color: var(--text-muted);
		pointer-events: none;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.step-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
	}

	.step-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.step-value {
		min-width: 24px;
		text-align: center;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.cooldown-options {
		display: flex;
		gap: var(--space-xs);
	}

	.cooldown-btn {
		padding: var(--space-xs) var(--space-sm);
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.cooldown-btn.active {
		background: var(--accent-primary);
		border-color: var(--accent-primary);
		color: var(--bg-primary);
	}

	.cooldown-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

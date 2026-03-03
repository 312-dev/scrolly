<script lang="ts">
	import { onMount } from 'svelte';
	import type { NotificationPrefs } from '$lib/settingsApi';
	import Toggle from './Toggle.svelte';
	import SettingRow from './SettingRow.svelte';

	const STORAGE_KEY = 'scrolly:push-test-sent-at';
	const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

	let {
		pushSupported,
		pushEnabled,
		pushLoading,
		prefs,
		prefsLoading,
		isStandaloneMode,
		isIos,
		onTogglePush,
		onUpdatePref
	}: {
		pushSupported: boolean;
		pushEnabled: boolean;
		pushLoading: boolean;
		prefs: NotificationPrefs;
		prefsLoading: boolean;
		isStandaloneMode: boolean;
		isIos: boolean;
		onTogglePush: () => void;
		onUpdatePref: (key: keyof NotificationPrefs, value: boolean) => void;
	} = $props();

	let testState = $state<'idle' | 'counting' | 'sent'>('idle');
	let countdown = $state(10);
	let lastTestedAt = $state<number | null>(null);
	let countdownTimer = $state<ReturnType<typeof setInterval> | null>(null);

	const lastTestedLabel = $derived.by(() => {
		if (!lastTestedAt) return null;
		if (Date.now() - lastTestedAt > TWENTY_FOUR_HOURS) return null;
		const d = new Date(lastTestedAt);
		const h = d.getHours();
		const m = d.getMinutes().toString().padStart(2, '0');
		const s = d.getSeconds().toString().padStart(2, '0');
		const ampm = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 || 12;
		return `Last tested at ${h12}:${m}:${s} ${ampm}`;
	});

	onMount(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const ts = parseInt(stored, 10);
			if (!isNaN(ts) && Date.now() - ts <= TWENTY_FOUR_HOURS) {
				lastTestedAt = ts;
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		}

		return () => {
			if (countdownTimer) clearInterval(countdownTimer);
		};
	});

	async function sendTestNotification() {
		testState = 'counting';
		countdown = 10;

		countdownTimer = setInterval(() => {
			countdown--;
			if (countdown <= 0 && countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		}, 1000);

		try {
			const res = await fetch('/api/push/test', { method: 'POST' });
			if (res.ok) {
				const data = await res.json();
				const sentAt = data.sentAt ?? Date.now();
				lastTestedAt = sentAt;
				localStorage.setItem(STORAGE_KEY, String(sentAt));
				testState = 'sent';
			} else {
				testState = 'idle';
			}
		} catch {
			testState = 'idle';
		} finally {
			if (countdownTimer) {
				clearInterval(countdownTimer);
				countdownTimer = null;
			}
		}
	}
</script>

{#if !pushSupported}
	{#if isIos && !isStandaloneMode}
		<p class="hint">Install scrolly to your home screen to enable push notifications.</p>
	{:else}
		<p class="hint">Push notifications aren't supported on this device or browser.</p>
	{/if}
{:else}
	<SettingRow name="Push notifications" description="Receive alerts on this device" last>
		<Toggle
			active={pushEnabled}
			disabled={pushLoading}
			onclick={onTogglePush}
			label="Toggle push notifications"
		/>
	</SettingRow>

	{#if pushEnabled}
		<div class="test-row">
			{#if testState === 'idle'}
				<button class="test-btn" onclick={sendTestNotification}> Send test notification </button>
				{#if lastTestedLabel}
					<span class="last-tested">{lastTestedLabel}</span>
				{/if}
			{:else if testState === 'counting'}
				<button class="test-btn counting" disabled>
					Sending in {countdown}s...
				</button>
			{:else if testState === 'sent'}
				<span class="sent-label">Sent to device!</span>
			{/if}
		</div>
	{/if}

	<div class="divider"></div>
	<h4 class="sub-heading">Notify me about</h4>

	{#if prefsLoading}
		<p class="hint">Loading...</p>
	{:else}
		<SettingRow name="New clips" description="When someone adds a video or song">
			<Toggle
				active={prefs.newAdds && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('newAdds', !prefs.newAdds)}
				label="Toggle new clips notifications"
			/>
		</SettingRow>

		<SettingRow name="Reactions" description="When someone reacts to your clip">
			<Toggle
				active={prefs.reactions && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('reactions', !prefs.reactions)}
				label="Toggle reaction notifications"
			/>
		</SettingRow>

		<SettingRow name="Comments" description="When someone comments on your clip">
			<Toggle
				active={prefs.comments && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('comments', !prefs.comments)}
				label="Toggle comment notifications"
			/>
		</SettingRow>

		<SettingRow name="Mentions" description="When someone @mentions you">
			<Toggle
				active={prefs.mentions && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('mentions', !prefs.mentions)}
				label="Toggle mention notifications"
			/>
		</SettingRow>

		<SettingRow name="Daily reminder" description="Nudge to check unwatched clips" last>
			<Toggle
				active={prefs.dailyReminder && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('dailyReminder', !prefs.dailyReminder)}
				label="Toggle daily reminder"
			/>
		</SettingRow>
	{/if}
{/if}

<style>
	.hint {
		color: var(--text-muted);
		font-size: 0.8125rem;
		line-height: 1.5;
		margin: 0;
	}

	.divider {
		height: 1px;
		background: var(--bg-surface);
		margin: var(--space-lg) 0;
	}
	.sub-heading {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 var(--space-sm);
	}

	.test-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) 0 0;
	}

	.test-btn {
		border: none;
		background: var(--bg-surface);
		color: var(--accent-primary);
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-full);
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.test-btn:active {
		transform: scale(0.97);
	}
	.test-btn.counting {
		color: var(--text-secondary);
		cursor: default;
	}
	.test-btn:disabled {
		opacity: 0.7;
	}

	.sent-label {
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--success);
	}

	.last-tested {
		font-family: var(--font-body);
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>

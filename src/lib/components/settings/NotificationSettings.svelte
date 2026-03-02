<script lang="ts">
	import { onMount } from 'svelte';
	import type { NotificationPrefs } from '$lib/settingsApi';

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
	<div class="setting-row last">
		<div class="setting-label">
			<span class="setting-name">Push notifications</span>
			<span class="setting-desc">Receive alerts on this device</span>
		</div>
		<button
			class="toggle"
			class:active={pushEnabled}
			disabled={pushLoading}
			onclick={onTogglePush}
			aria-label="Toggle push notifications"
		>
			<span class="toggle-thumb"></span>
		</button>
	</div>

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
		<div class="setting-row">
			<div class="setting-label">
				<span class="setting-name">New clips</span>
				<span class="setting-desc">When someone adds a video or song</span>
			</div>
			<button
				class="toggle"
				class:active={prefs.newAdds && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('newAdds', !prefs.newAdds)}
				aria-label="Toggle new clips notifications"
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		<div class="setting-row">
			<div class="setting-label">
				<span class="setting-name">Reactions</span>
				<span class="setting-desc">When someone reacts to your clip</span>
			</div>
			<button
				class="toggle"
				class:active={prefs.reactions && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('reactions', !prefs.reactions)}
				aria-label="Toggle reaction notifications"
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		<div class="setting-row">
			<div class="setting-label">
				<span class="setting-name">Comments</span>
				<span class="setting-desc">When someone comments on your clip</span>
			</div>
			<button
				class="toggle"
				class:active={prefs.comments && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('comments', !prefs.comments)}
				aria-label="Toggle comment notifications"
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		<div class="setting-row">
			<div class="setting-label">
				<span class="setting-name">Mentions</span>
				<span class="setting-desc">When someone @mentions you</span>
			</div>
			<button
				class="toggle"
				class:active={prefs.mentions && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('mentions', !prefs.mentions)}
				aria-label="Toggle mention notifications"
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		<div class="setting-row last">
			<div class="setting-label">
				<span class="setting-name">Daily reminder</span>
				<span class="setting-desc">Nudge to check unwatched clips</span>
			</div>
			<button
				class="toggle"
				class:active={prefs.dailyReminder && pushEnabled}
				disabled={!pushEnabled}
				onclick={() => onUpdatePref('dailyReminder', !prefs.dailyReminder)}
				aria-label="Toggle daily reminder"
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>
	{/if}
{/if}

<style>
	.hint {
		color: var(--text-muted);
		font-size: 0.8125rem;
		line-height: 1.5;
		margin: 0;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--bg-surface);
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

	.toggle {
		position: relative;
		width: 44px;
		height: 26px;
		border-radius: 13px;
		border: none;
		background: var(--border);
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.2s;
		padding: 0;
	}
	.toggle:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.toggle.active {
		background: var(--accent-primary);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		background: var(--constant-white);
		transition: transform 0.2s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}
	.toggle.active .toggle-thumb {
		transform: translateX(18px);
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

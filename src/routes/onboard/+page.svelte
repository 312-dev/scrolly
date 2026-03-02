<script lang="ts">
	import { env } from '$env/dynamic/public';
	import InlineError from '$lib/components/InlineError.svelte';
	import { rawDigits, formatPhone, toE164 } from '$lib/phone';

	let step = $state<'info' | 'verify'>('info');
	let username = $state('');
	let phoneDisplay = $state('');
	let code = $state('');
	let error = $state('');
	let loading = $state(false);
	let resendCountdown = $state(0);
	let resendTimer: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		return () => {
			if (resendTimer) clearInterval(resendTimer);
		};
	});

	function handlePhoneInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const digits = rawDigits(input.value).slice(0, 10);
		phoneDisplay = formatPhone(digits);
		requestAnimationFrame(() => {
			input.setSelectionRange(phoneDisplay.length, phoneDisplay.length);
		});
	}

	function handlePhoneKeydown(e: KeyboardEvent) {
		if (e.key === 'Backspace' && phoneDisplay.length > 0) {
			e.preventDefault();
			const digits = rawDigits(phoneDisplay);
			phoneDisplay = formatPhone(digits.slice(0, -1));
		}
	}

	const phoneValid = $derived(rawDigits(phoneDisplay).length === 10);
	const phoneE164 = $derived(toE164(phoneDisplay));

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		code = input.value.replace(/\D/g, '').slice(0, 6);
	}

	function startResendTimer() {
		resendCountdown = 60;
		resendTimer = setInterval(() => {
			resendCountdown--;
			if (resendCountdown <= 0 && resendTimer) {
				clearInterval(resendTimer);
				resendTimer = null;
			}
		}, 1000);
	}

	async function handleSendCode() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'send-code', phone: phoneE164 })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error || 'Failed to send code';
				return;
			}
			step = 'verify';
			startResendTimer();
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	async function handleVerifyAndOnboard() {
		error = '';
		loading = true;
		try {
			const verifyRes = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'verify-code', phone: phoneE164, code: code.trim() })
			});
			const verifyData = await verifyRes.json();
			if (!verifyRes.ok) {
				error = verifyData.error || 'Invalid code';
				return;
			}

			const onboardRes = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'onboard',
					username: username.trim(),
					phone: phoneE164
				})
			});
			const onboardData = await onboardRes.json();
			if (!onboardRes.ok) {
				error = onboardData.error || 'Failed to save';
				return;
			}

			const params = new URLSearchParams(window.location.search);
			const returnTo = params.get('returnTo');
			window.location.href =
				returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	function scrollToInput(e: FocusEvent) {
		setTimeout(() => {
			(e.target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 350);
	}

	async function handleResend() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'send-code', phone: phoneE164 })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error || 'Failed to resend';
				return;
			}
			code = '';
			startResendTimer();
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Set Up Your Profile — scrolly</title>
</svelte:head>

<div class="onboard-page">
	<h1>Welcome to scrolly</h1>

	{#if step === 'info'}
		<p>Pick a name and add your phone number so you can text videos to the group.</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSendCode();
			}}
		>
			<label>
				<span>Username</span>
				<input
					type="text"
					bind:value={username}
					onfocus={scrollToInput}
					placeholder="Your name"
					autocomplete="name"
					disabled={loading}
				/>
			</label>

			<label>
				<span>Phone number</span>
				<div class="phone-input-group">
					<span class="country-code">+1</span>
					<input
						type="tel"
						value={phoneDisplay}
						oninput={handlePhoneInput}
						onkeydown={handlePhoneKeydown}
						onfocus={scrollToInput}
						placeholder="(555) 123-4567"
						autocomplete="tel"
						disabled={loading}
						class="phone-input"
					/>
				</div>
				<small>We'll send you a verification code</small>
			</label>

			<!-- eslint-disable svelte/no-navigation-without-resolve -- external operator-configured URLs -->
			<p class="sms-consent">
				By tapping "Send Verification Code," you agree to receive SMS messages from Scrolly,
				including verification codes and replies when you text clips. Msg frequency varies. Msg
				&amp; data rates may apply.
				{#if env.PUBLIC_PRIVACY_URL || env.PUBLIC_TERMS_URL}
					{#if env.PUBLIC_PRIVACY_URL}<a
							href={env.PUBLIC_PRIVACY_URL}
							target="_blank"
							rel="noopener">Privacy Policy</a
						>{/if}{#if env.PUBLIC_PRIVACY_URL && env.PUBLIC_TERMS_URL}
						&amp;
					{/if}{#if env.PUBLIC_TERMS_URL}<a
							href={env.PUBLIC_TERMS_URL}
							target="_blank"
							rel="noopener">Terms</a
						>{/if}.
				{/if}
			</p>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->

			<button type="submit" disabled={loading || !username.trim() || !phoneValid}>
				{loading ? 'Sending...' : 'Send Verification Code'}
			</button>
		</form>
	{:else}
		<p>Enter the 6-digit code we sent to +1 {phoneDisplay}</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleVerifyAndOnboard();
			}}
		>
			<label>
				<span>Verification code</span>
				<input
					type="text"
					value={code}
					oninput={handleCodeInput}
					onfocus={scrollToInput}
					placeholder="000000"
					autocomplete="one-time-code"
					inputmode="numeric"
					disabled={loading}
					class="code-input"
				/>
			</label>

			<button type="submit" disabled={loading || code.trim().length !== 6}>
				{loading ? 'Verifying...' : 'Verify & Get Started'}
			</button>

			<div class="resend-row">
				<button type="button" onclick={handleResend} disabled={loading || resendCountdown > 0}>
					{resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
				</button>
				<button
					type="button"
					onclick={() => {
						step = 'info';
						error = '';
						code = '';
					}}
				>
					Change number
				</button>
			</div>
		</form>
	{/if}

	<InlineError message={error} />
</div>

<style>
	.onboard-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--space-lg);
		padding-bottom: calc(var(--space-lg) + 72px);
		background: var(--bg-primary);
		overflow-y: auto;
	}

	h1 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin-bottom: var(--space-sm);
		color: var(--text-primary);
	}

	p {
		color: var(--text-secondary);
		margin-bottom: var(--space-xl);
		text-align: center;
		max-width: 320px;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		width: 100%;
		max-width: 320px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	label span {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	input {
		padding: var(--space-md) var(--space-lg);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		font-size: 1rem;
		background: var(--bg-surface);
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

	.phone-input-group {
		display: flex;
		align-items: center;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		overflow: hidden;
		transition: border-color 0.2s ease;
	}

	.phone-input-group:focus-within {
		border-color: var(--accent-primary);
	}

	.country-code {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1rem;
		color: var(--text-muted);
		padding: var(--space-md) 0 var(--space-md) var(--space-lg);
		user-select: none;
		flex-shrink: 0;
	}

	.phone-input {
		flex: 1;
		padding: var(--space-md) var(--space-lg) var(--space-md) var(--space-sm);
		border: none;
		border-radius: 0;
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		background: transparent;
		color: var(--text-primary);
	}

	.phone-input::placeholder {
		color: var(--text-muted);
		font-weight: 400;
	}

	.phone-input:focus {
		outline: none;
	}

	.code-input {
		text-align: center;
		letter-spacing: 0.3em;
		font-size: 1.5rem;
		font-family: var(--font-display);
		font-weight: 600;
	}

	small {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.sms-consent {
		font-size: 0.6875rem;
		line-height: 1.5;
		color: var(--text-muted);
		text-align: center;
		max-width: 320px;
		margin: 0;
	}

	.sms-consent a {
		color: var(--text-secondary);
		text-decoration: underline;
	}

	button {
		padding: var(--space-md) var(--space-lg);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		margin-top: var(--space-sm);
		transition: transform 0.1s ease;
	}

	button:active {
		transform: scale(0.97);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.resend-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.resend-row button {
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.875rem;
		padding: var(--space-sm);
		margin-top: 0;
		font-weight: 400;
	}

	.resend-row button:disabled {
		opacity: 0.4;
	}
</style>

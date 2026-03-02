<script lang="ts">
	/* eslint-disable max-lines */
	import { env } from '$env/dynamic/public';
	import iconSvg from '$lib/assets/icon.svg?raw';
	import InlineError from '$lib/components/InlineError.svelte';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import { rawDigits, formatPhone, toE164 } from '$lib/phone';

	let view = $state<'login' | 'verify'>('login');
	let phoneDisplay = $state('');
	let code = $state('');
	let error = $state('');
	let loading = $state(false);
	let resendCountdown = $state(0);
	let resendTimer: ReturnType<typeof setInterval> | null = null;
	let mounted = $state(false);

	$effect(() => {
		mounted = true;
		return () => {
			if (resendTimer) clearInterval(resendTimer);
		};
	});

	function handlePhoneInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const digits = rawDigits(input.value).slice(0, 10);
		phoneDisplay = formatPhone(digits);
		// Reset cursor to end after formatting
		requestAnimationFrame(() => {
			input.setSelectionRange(phoneDisplay.length, phoneDisplay.length);
		});
	}

	function handlePhoneKeydown(e: KeyboardEvent) {
		// Allow backspace to work naturally with formatting
		if (e.key === 'Backspace' && phoneDisplay.length > 0) {
			e.preventDefault();
			const digits = rawDigits(phoneDisplay);
			phoneDisplay = formatPhone(digits.slice(0, -1));
		}
	}

	// Phone is valid when we have exactly 10 digits
	const phoneValid = $derived(rawDigits(phoneDisplay).length === 10);
	const phoneE164 = $derived(toE164(phoneDisplay));

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

	async function handleSendLoginCode() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'login-send-code', phone: phoneE164 })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error || 'Failed to send code';
				return;
			}
			view = 'verify';
			startResendTimer();
		} catch {
			error = 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	async function handleVerifyLogin() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'login-verify-code', phone: phoneE164, code: code.trim() })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error || 'Invalid code';
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

	async function handleResend() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'login-send-code', phone: phoneE164 })
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

	// Single hidden input + visual slots (avoids Android IME maxlength paste truncation)
	let codeInputEl = $state<HTMLInputElement | null>(null);

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		code = input.value.replace(/\D/g, '').slice(0, 6);
		input.value = code;
	}

	function scrollToInput(e: FocusEvent) {
		setTimeout(() => {
			(e.target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 350);
	}
</script>

<svelte:head>
	<title>scrolly — Sign In</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Unbounded:wght@800;900&family=Space+Mono:wght@400;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="join-page" class:mounted>
	<div class="bg-noise"></div>

	<div class="content">
		<div class="brand">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted local SVG asset -->
			<div class="brand-logo" aria-label="scrolly">{@html iconSvg}</div>
			<h1>scrolly</h1>
			<p class="tagline">your crew's <span class="tagline-accent">private</span> feed</p>
		</div>

		{#if view === 'login'}
			<div class="form-card">
				<p class="form-label">Sign in with your phone number</p>

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleSendLoginCode();
					}}
				>
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
					<!-- eslint-disable svelte/no-navigation-without-resolve -- external operator-configured URLs -->
					<p class="sms-consent">
						By tapping "Send Code," you agree to receive SMS messages from Scrolly, including
						verification codes and replies when you text clips. Msg frequency varies. Msg &amp; data
						rates may apply.
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
					<button type="submit" class="btn-primary" disabled={loading || !phoneValid}>
						{#if loading}
							<span class="spinner"></span>
							Sending...
						{:else}
							Send Code
							<ArrowRightIcon size={18} />
						{/if}
					</button>
				</form>
			</div>
		{:else}
			<div class="form-card">
				<p class="form-label">Enter the code we sent to</p>
				<p class="phone-echo">{phoneDisplay}</p>

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleVerifyLogin();
					}}
				>
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="code-slots" onclick={() => codeInputEl?.focus()}>
						<input
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							value={code}
							oninput={handleCodeInput}
							onfocus={scrollToInput}
							disabled={loading}
							class="code-hidden-input"
							bind:this={codeInputEl}
						/>
						{#each Array(6) as _, i (i)}
							<div
								class="code-slot"
								class:filled={code[i] !== undefined}
								class:active={i === code.length && codeInputEl === document.activeElement}
							>
								{code[i] || ''}
							</div>
						{/each}
					</div>

					<button type="submit" class="btn-primary" disabled={loading || code.length !== 6}>
						{#if loading}
							<span class="spinner"></span>
							Verifying...
						{:else}
							Log In
						{/if}
					</button>

					<div class="resend-row">
						<button
							type="button"
							class="btn-ghost"
							onclick={handleResend}
							disabled={loading || resendCountdown > 0}
						>
							{resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
						</button>
						<button
							type="button"
							class="btn-ghost"
							onclick={() => {
								view = 'login';
								error = '';
								code = '';
							}}
						>
							Change number
						</button>
					</div>
				</form>
			</div>
		{/if}

		<InlineError message={error} />
	</div>

	<p class="footer-note">a private place to share videos with your people.</p>
</div>

<style>
	.join-page {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--space-xl);
		padding-bottom: calc(var(--space-xl) + 72px);
		background: var(--bg-primary);
		overflow-y: auto;
	}

	/* --- Background grain texture --- */
	.bg-noise {
		position: absolute;
		inset: 0;
		opacity: 0.04;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 256px 256px;
	}

	/* --- Content --- */
	.content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 380px;
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 0.6s ease,
			transform 0.6s ease;
	}

	.mounted .content {
		opacity: 1;
		transform: translateY(0);
	}

	/* --- Brand --- */
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: var(--space-3xl);
	}

	.brand-logo {
		width: 72px;
		height: 72px;
		margin-bottom: var(--space-lg);
		color: var(--accent-primary);
	}

	.brand-logo :global(svg) {
		width: 100%;
		height: 100%;
	}

	h1 {
		font-family: 'Unbounded', var(--font-display), sans-serif;
		font-size: 2.75rem;
		font-weight: 900;
		letter-spacing: -0.02em;
		line-height: 1;
		margin: 0;
		color: var(--text-primary);
		text-transform: lowercase;
	}

	.tagline {
		font-family: 'Space Mono', monospace;
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--text-muted);
		margin: var(--space-md) 0 0;
		letter-spacing: 0.02em;
	}

	.tagline-accent {
		color: var(--accent-primary);
		font-weight: 700;
	}

	/* --- Form card --- */
	.form-card {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.form-label {
		font-size: 0.9375rem;
		color: var(--text-secondary);
		margin: 0 0 var(--space-xl);
		text-align: center;
	}

	.phone-echo {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--accent-primary);
		margin: -0.75rem 0 var(--space-xl);
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
	}

	/* --- Phone input --- */
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
		font-size: 1.125rem;
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

	/* --- Code slots (single hidden input + visual slots) --- */
	.code-slots {
		position: relative;
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
		margin-bottom: var(--space-sm);
		cursor: text;
	}

	.code-hidden-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		font-size: 1rem;
		caret-color: transparent;
	}

	.code-slot {
		width: 46px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		border: 1.5px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		color: var(--text-primary);
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
		pointer-events: none;
	}

	.code-slot.active {
		border-color: var(--accent-primary);
		background: var(--bg-subtle);
	}

	.code-slot.filled {
		border-color: var(--accent-primary);
	}

	/* --- Buttons --- */
	.btn-primary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 1rem;
		font-weight: 700;
		font-family: var(--font-display);
		cursor: pointer;
		transition:
			transform 0.1s ease,
			opacity 0.2s ease;
		margin-top: var(--space-sm);
	}

	.btn-primary:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn-primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-ghost {
		background: transparent;
		color: var(--text-secondary);
		border: none;
		font-size: 0.8125rem;
		padding: var(--space-sm);
		font-weight: 500;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color 0.2s ease;
	}

	.btn-ghost:hover:not(:disabled) {
		color: var(--text-primary);
	}

	.btn-ghost:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.sms-consent {
		font-size: 0.6875rem;
		line-height: 1.5;
		color: var(--text-muted);
		text-align: center;
		margin: 0;
	}

	.sms-consent a {
		color: var(--text-secondary);
		text-decoration: underline;
	}

	.resend-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-top: var(--space-xs);
	}

	/* --- Spinner --- */
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid color-mix(in srgb, var(--bg-primary) 20%, transparent);
		border-top-color: var(--bg-primary);
		border-radius: var(--radius-full);
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* --- Footer --- */
	.footer-note {
		position: relative;
		z-index: 1;
		margin-top: var(--space-3xl);
		font-family: 'Space Mono', monospace;
		font-size: 0.6875rem;
		color: var(--text-muted);
		text-align: center;
		letter-spacing: 0.03em;
	}
</style>

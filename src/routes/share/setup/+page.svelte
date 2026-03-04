<script lang="ts">
	/* eslint-disable max-lines */
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from '$lib/stores/toasts';
	import SetupStepCard from '$lib/components/settings/SetupStepCard.svelte';
	import SetupDoneState from '$lib/components/settings/SetupDoneState.svelte';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';

	const TEMPLATE_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/7408eaef702342f0b38d3d01acf6fcb0';
	const ICLOUD_SHORTCUT_RE = /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}\/?$/;

	const appUrl = $derived(page.data.appUrl as string);
	const shortcutToken = $derived((page.data.shortcutToken as string | null) ?? '???');
	const hostPhone = $derived(page.data.hostPhone as string);

	let currentStep = $state(0);
	let completedSteps = new SvelteSet<number>();
	let icloudLink = $state('');
	let savingLink = $state(false);
	let copiedField = $state<string | null>(null);

	// Validation state
	let validating = $state(false);
	let validationWarnings = $state<{ code: string; message: string }[]>([]);
	let validated = $state(false);
	let shortcutName = $state<string | null>(null);
	const icloudLinkValid = $derived(ICLOUD_SHORTCUT_RE.test(icloudLink.trim()));
	const icloudLinkError = $derived(
		icloudLink.trim().length > 0 && !icloudLinkValid
			? 'Must be an iCloud shortcut link (https://www.icloud.com/shortcuts/...)'
			: ''
	);
	const hasWarnings = $derived(validated && validationWarnings.length > 0);
	const isTemplateLink = $derived(
		icloudLink.trim().replace(/\/$/, '') === TEMPLATE_SHORTCUT_URL.replace(/\/$/, '')
	);

	// Warning classification: soft = skippable, unreachable = allow save without validation, everything else blocks
	const SOFT_CODES = ['bad_name', 'localhost_url'];
	const UNREACHABLE_CODES = ['fetch_failed'];

	const blockers = $derived(
		validationWarnings.filter(
			(w) => !SOFT_CODES.includes(w.code) && !UNREACHABLE_CODES.includes(w.code)
		)
	);
	const isUnreachable = $derived(
		validationWarnings.some((w) => UNREACHABLE_CODES.includes(w.code))
	);
	const softWarnings = $derived(validationWarnings.filter((w) => SOFT_CODES.includes(w.code)));
	const hasSoftOnly = $derived(softWarnings.length > 0 && blockers.length === 0 && !isUnreachable);
	const hasBlockers = $derived(blockers.length > 0);
	const hasExtraPrompts = $derived(blockers.some((w) => w.code === 'extra_prompts'));
	const hasTrailingSlash = $derived(blockers.some((w) => w.code === 'trailing_slash'));

	// Display logic: extra_prompts shown alone, then trailing_slash alone, then remaining blockers
	const displayedBlockers = $derived.by(() => {
		if (hasExtraPrompts) return blockers.filter((w) => w.code === 'extra_prompts');
		if (hasTrailingSlash) return blockers.filter((w) => w.code === 'trailing_slash');
		return blockers;
	});

	const totalSteps = 4;
	const isLastStep = $derived(currentStep === totalSteps - 1);
	const allDone = $derived(currentStep === totalSteps);

	function nextStep() {
		completedSteps.add(currentStep);
		if (currentStep < totalSteps) currentStep++;
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function goToStep(step: number) {
		if (step <= Math.max(...completedSteps, -1) + 1) {
			currentStep = step;
		}
	}

	async function copyValue(value: string, field: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => (copiedField = null), 2000);
		} catch {
			toast.error('Failed to copy');
		}
	}

	async function runValidation(url: string) {
		validating = true;
		validated = false;
		validationWarnings = [];
		shortcutName = null;
		try {
			const res = await fetch('/api/group/shortcut/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shortcutUrl: url })
			});
			if (res.ok) {
				const data = await res.json();
				validationWarnings = data.warnings ?? [];
				shortcutName = data.name ?? null;
				validated = true;

				// Auto-save only when fully clean — soft warnings are shown but don't block
				if (validationWarnings.length === 0) {
					await doSave(url);
				}
			} else {
				const data = await res.json();
				toast.error(data.error || 'Validation failed');
			}
		} catch {
			toast.error('Could not validate shortcut');
		} finally {
			validating = false;
		}
	}

	async function validateAndSave() {
		const trimmed = icloudLink.trim();
		if (!trimmed || !icloudLinkValid) return;
		await runValidation(trimmed);
	}

	async function saveUnreachable() {
		const trimmed = icloudLink.trim();
		if (!trimmed || !icloudLinkValid) return;
		await doSave(trimmed);
	}

	async function doSave(trimmed: string) {
		savingLink = true;
		try {
			const res = await fetch('/api/group/shortcut', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shortcutUrl: trimmed })
			});
			if (res.ok) {
				toast.success('Shortcut link saved');
				nextStep();
			} else {
				const data = await res.json();
				toast.error(data.error || 'Failed to save');
			}
		} catch {
			toast.error('Failed to save');
		} finally {
			savingLink = false;
		}
	}
</script>

<svelte:head>
	<title>Set up Share Shortcut — scrolly</title>
</svelte:head>

<div class="setup-page">
	<nav class="setup-nav">
		<a href={resolve('/settings')} class="back-link">
			<CaretLeftIcon size={20} />
			Settings
		</a>
		{#if !allDone}
			<span class="step-counter">{currentStep + 1} / {totalSteps}</span>
		{/if}
	</nav>

	<div class="setup-content">
		<!-- Difficulty disclaimer -->
		{#if !allDone}
			<div class="warning-card">
				<WarningIcon size={20} weight="fill" />
				<p>
					Setting up the Share Shortcut requires careful attention. If any step is done incorrectly,
					your group members will get errors when they try to share clips. Follow each step exactly.
				</p>
			</div>

			<!-- Progress dots -->
			<div class="progress-dots">
				{#each Array(totalSteps) as _, i (i)}
					<button
						class="dot"
						class:active={i === currentStep}
						class:completed={completedSteps.has(i)}
						class:reachable={i <= Math.max(...completedSteps, -1) + 1}
						onclick={() => goToStep(i)}
						aria-label="Step {i + 1}"
					>
						{#if completedSteps.has(i)}
							<CheckIcon size={14} weight="bold" />
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Step cards -->
		<SetupStepCard
			step={1}
			title="Install the template shortcut"
			visible={currentStep === 0 && !allDone}
		>
			<h1 class="setup-title">Set up Share Shortcut</h1>
			<span class="difficulty-badge">Difficulty: Intermediate</span>
			<p class="setup-subtitle">
				Create an iOS Shortcut so your group can share clips directly from TikTok, Instagram, and
				other apps — without opening scrolly.
			</p>
			<p class="step-desc">
				Tap the button below to install the template shortcut. When it opens, you'll be prompted
				with setup questions — fill them in using the values from the next step.
			</p>
			<a
				href={TEMPLATE_SHORTCUT_URL}
				class="icloud-btn"
				target="_blank"
				rel="external noopener"
				onclick={nextStep}
			>
				<DownloadSimpleIcon size={22} />
				Get Template Shortcut
			</a>
		</SetupStepCard>

		<SetupStepCard
			step={2}
			title="Fill in the setup prompts"
			visible={currentStep === 1 && !allDone}
		>
			<p class="step-desc">
				When you install the template, iOS will ask you to fill in setup questions. Copy and paste
				each value exactly as shown:
			</p>

			<div class="setup-field">
				<span class="field-label">Instance URL</span>
				<p class="field-hint">Your scrolly server address — no trailing slash.</p>
				<div class="url-display">
					<code>{appUrl}</code>
					<button class="copy-btn" onclick={() => copyValue(appUrl, 'url')}>
						{#if copiedField === 'url'}
							<CheckIcon size={14} weight="bold" />
						{:else}
							<CopyIcon size={14} />
						{/if}
						{copiedField === 'url' ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>

			<div class="setup-field">
				<span class="field-label">Group Token</span>
				<p class="field-hint">Unique to your group. Identifies where shared clips go.</p>
				<div class="url-display">
					<code>{shortcutToken}</code>
					<button class="copy-btn" onclick={() => copyValue(shortcutToken, 'token')}>
						{#if copiedField === 'token'}
							<CheckIcon size={14} weight="bold" />
						{:else}
							<CopyIcon size={14} />
						{/if}
						{copiedField === 'token' ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>

			<div class="setup-field">
				<span class="field-label">Your Phone Number</span>
				<p class="field-hint">
					Enter your number for now. Group members will enter theirs when they install.
				</p>
				<div class="url-display">
					<code>{hostPhone}</code>
					<button class="copy-btn" onclick={() => copyValue(hostPhone, 'phone')}>
						{#if copiedField === 'phone'}
							<CheckIcon size={14} weight="bold" />
						{:else}
							<CopyIcon size={14} />
						{/if}
						{copiedField === 'phone' ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>

			<p class="step-desc">
				After filling in all prompts, tap <strong>"Add Shortcut"</strong> to finish installing.
			</p>
		</SetupStepCard>

		<SetupStepCard
			step={3}
			title="Remove extra setup prompts"
			visible={currentStep === 2 && !allDone}
		>
			<p class="step-desc">
				This is the most important step. Your group members should <strong>only</strong> be asked for
				their phone number when they install — not the URL or token.
			</p>
			<p class="step-desc">
				In the Shortcuts app, long-press your new shortcut and tap the <strong>ⓘ</strong> icon (or
				tap <strong>"Details"</strong>). Scroll down to the <strong>"Setup"</strong> section.
			</p>
			<p class="step-desc">
				Delete every Import Question <strong>except</strong> the one for
				<strong>phone number</strong>. The URL and token are already baked into the shortcut — only
				the phone number needs to be asked on install.
			</p>
			<div class="info-box warn">
				<WarningIcon size={18} weight="fill" />
				<span>
					If you skip this step, your group members will be asked for the URL and token when they
					install — they won't know what to enter and the shortcut will break.
				</span>
			</div>
		</SetupStepCard>

		<SetupStepCard step={4} title="Share with your group" visible={currentStep === 3 && !allDone}>
			<p class="step-desc">
				Long-press your customized shortcut in the Shortcuts app and choose
				<strong>"Share"</strong>, then <strong>"Copy iCloud Link"</strong>.
			</p>
			<p class="step-desc">
				Paste the iCloud link below. We'll check that it's configured correctly before saving.
			</p>
			<div class="icloud-input-group">
				<input
					type="url"
					class="icloud-input"
					class:invalid={icloudLinkError || isTemplateLink}
					bind:value={icloudLink}
					placeholder="https://www.icloud.com/shortcuts/..."
					disabled={savingLink || validating}
				/>
				{#if icloudLinkError}
					<p class="input-error">{icloudLinkError}</p>
				{:else if isTemplateLink}
					<p class="input-error">
						This is the template shortcut link, not your customized one. Share your edited shortcut
						from the Shortcuts app to get a new iCloud link.
					</p>
				{/if}
			</div>

			{#if !validated}
				<button
					class="save-link-btn"
					onclick={validateAndSave}
					disabled={!icloudLinkValid || validating || isTemplateLink}
				>
					{validating ? 'Validating…' : 'Validate & Save'}
				</button>
			{/if}

			{#if hasWarnings}
				<div class="validation-results">
					{#if shortcutName}
						<p class="shortcut-name">Shortcut: <strong>{shortcutName}</strong></p>
					{/if}

					{#if isUnreachable}
						<div class="unreachable-notice">
							<WarningIcon size={18} weight="fill" />
							<div>
								<p class="unreachable-title">Validation server could not be reached</p>
								<p class="unreachable-desc">
									Apple's iCloud servers are unavailable right now. You can save without validation,
									but the shortcut won't be checked for configuration errors.
								</p>
							</div>
						</div>
						<div class="validation-actions">
							<button
								class="save-link-btn revalidate-btn"
								onclick={validateAndSave}
								disabled={validating}
							>
								{validating ? 'Validating…' : 'Try Again'}
							</button>
							<button
								class="save-link-btn skip-btn"
								onclick={saveUnreachable}
								disabled={savingLink}
							>
								{savingLink ? 'Saving…' : 'Save Without Validating'}
							</button>
						</div>
					{:else if hasBlockers}
						{#if hasExtraPrompts}
							<p class="blocker-hint">
								This must be fixed before saving. Remove the extra setup prompts in the Shortcuts
								app, then share an updated iCloud link.
								<button class="blocker-link" onclick={() => goToStep(2)}>
									See step 3 for instructions.
								</button>
							</p>
						{:else if hasTrailingSlash}
							<p class="blocker-hint">
								This must be fixed before saving. Remove the trailing slash from the URL in the
								Shortcuts app, then share an updated iCloud link.
							</p>
						{:else}
							<p class="blocker-hint">
								{displayedBlockers.length === 1 ? 'This issue' : 'These issues'} must be fixed before
								saving. Update the shortcut, then re-validate with a new iCloud link.
							</p>
						{/if}
						{#each displayedBlockers as warning (warning.code + warning.message)}
							<div class="validation-blocker">
								<WarningIcon size={16} weight="fill" />
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-generated, no user input -->
								<span>{@html warning.message}</span>
							</div>
						{/each}
						<p class="checklist-tip">
							After making changes, close the shortcut editor and use
							<strong>Share → Copy iCloud Link</strong> again to get an updated link.
						</p>
						<div class="validation-actions">
							<button
								class="save-link-btn revalidate-btn"
								onclick={validateAndSave}
								disabled={validating}
							>
								{validating ? 'Validating…' : 'Re-validate'}
							</button>
						</div>
					{:else if hasSoftOnly}
						{#each softWarnings as warning (warning.code + warning.message)}
							<div class="validation-soft">
								<WarningIcon size={16} weight="fill" />
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- server-generated, no user input -->
								<span>{@html warning.message}</span>
							</div>
						{/each}
						<div class="validation-actions">
							<button
								class="save-link-btn revalidate-btn"
								onclick={validateAndSave}
								disabled={validating}
							>
								{validating ? 'Validating…' : 'Re-validate'}
							</button>
							<button
								class="save-link-btn skip-btn"
								onclick={() => doSave(icloudLink.trim())}
								disabled={savingLink}
							>
								{savingLink ? 'Saving…' : 'Save Anyway'}
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</SetupStepCard>

		<!-- Done state -->
		{#if allDone}
			<SetupDoneState settingsHref={resolve('/settings')} shortcutUrl={icloudLink.trim()} />
		{/if}

		<!-- Navigation -->
		{#if !allDone}
			<div class="step-nav">
				{#if currentStep > 0}
					<button class="nav-btn nav-back" onclick={prevStep}>
						<CaretLeftIcon size={18} />
						Back
					</button>
				{:else}
					<div></div>
				{/if}
				{#if !isLastStep}
					<button class="nav-btn nav-next" onclick={nextStep}>
						Next
						<CaretRightIcon size={18} />
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.setup-page {
		min-height: 100dvh;
		background: var(--bg-primary);
	}
	.setup-nav {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-primary);
		border-bottom: 1px solid var(--border);
	}
	.back-link {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--accent-primary);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 600;
	}
	.back-link :global(svg) {
		width: 20px;
		height: 20px;
	}
	.step-counter {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		font-family: var(--font-display);
	}
	.setup-content {
		max-width: 520px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-lg);
		padding-bottom: calc(var(--space-3xl) + env(safe-area-inset-bottom, 0px));
	}
	.warning-card {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: color-mix(in srgb, var(--warning) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-xl);
	}
	.warning-card :global(svg) {
		flex-shrink: 0;
		color: var(--warning);
		margin-top: 1px;
	}
	.warning-card p {
		font-size: 0.9375rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}
	.progress-dots {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
		margin-bottom: var(--space-xl);
	}
	.dot {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		border: 2px solid var(--border);
		background: transparent;
		cursor: default;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		padding: 0;
	}
	.dot.reachable {
		cursor: pointer;
	}
	.dot.active {
		border-color: var(--accent-primary);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
	}
	.dot.completed {
		border-color: var(--accent-primary);
		background: var(--accent-primary);
	}
	.dot.completed :global(svg) {
		width: 14px;
		height: 14px;
		color: var(--bg-primary);
	}
	.difficulty-badge {
		display: inline-flex;
		align-self: flex-start;
		padding: var(--space-xs) var(--space-md);
		background: color-mix(in srgb, var(--warning) 12%, transparent);
		color: var(--warning);
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: var(--radius-full);
		margin-bottom: var(--space-md);
	}
	.icloud-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 1rem;
		font-weight: 700;
		font-family: var(--font-display);
		text-decoration: none;
		transition: transform 0.1s ease;
	}
	.icloud-btn:active {
		transform: scale(0.97);
	}
	.icloud-btn :global(svg) {
		width: 22px;
		height: 22px;
	}
	.step-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: var(--space-2xl);
		gap: var(--space-md);
	}
	.nav-btn {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-lg);
		border: none;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.nav-btn:active {
		transform: scale(0.97);
	}
	.nav-btn :global(svg) {
		width: 18px;
		height: 18px;
	}
	.nav-back {
		background: var(--bg-surface);
		color: var(--text-secondary);
	}
	.nav-next {
		background: var(--accent-primary);
		color: var(--bg-primary);
		font-weight: 700;
		margin-left: auto;
	}
	.icloud-input-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.icloud-input {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.9375rem;
		outline: none;
		transition: border-color 0.2s ease;
		box-sizing: border-box;
	}
	.icloud-input::placeholder {
		color: var(--text-muted);
	}
	.icloud-input:focus {
		border-color: var(--accent-primary);
	}
	.icloud-input.invalid:not(:focus) {
		border-color: var(--error);
	}
	.icloud-input:disabled {
		opacity: 0.5;
	}
	.input-error {
		font-size: 0.8125rem;
		color: var(--error);
		margin: 0;
	}
	.save-link-btn {
		width: 100%;
		margin-top: var(--space-md);
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: var(--radius-full);
		font-size: 1rem;
		font-weight: 700;
		font-family: var(--font-display);
		cursor: pointer;
		transition: transform 0.1s ease;
	}
	.save-link-btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.save-link-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.setup-field {
		margin-bottom: var(--space-lg);
	}
	.setup-field:last-of-type {
		margin-bottom: var(--space-md);
	}
	.field-label {
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: var(--space-xs);
	}
	.field-hint {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0 0 var(--space-sm);
		line-height: 1.4;
	}
	.validation-results {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		margin-top: var(--space-lg);
	}
	.shortcut-name {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin: 0;
	}
	.shortcut-name strong {
		color: var(--text-primary);
	}
	.unreachable-notice {
		display: flex;
		align-items: flex-start;
		gap: var(--space-md);
		padding: var(--space-md);
		background: color-mix(in srgb, var(--warning) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
		border-radius: var(--radius-sm);
	}
	.unreachable-notice :global(svg) {
		flex-shrink: 0;
		color: var(--warning);
		margin-top: 2px;
	}
	.unreachable-title {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs);
	}
	.unreachable-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}
	.blocker-hint {
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}
	.validation-blocker {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in srgb, var(--error) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
		border-radius: var(--radius-sm);
	}
	.validation-blocker :global(svg) {
		flex-shrink: 0;
		color: var(--error);
		margin-top: 2px;
	}
	.validation-blocker span {
		font-size: 0.9375rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.validation-blocker span :global(b) {
		color: var(--text-primary);
		font-weight: 600;
	}
	.validation-soft {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in srgb, var(--warning) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--warning) 20%, transparent);
		border-radius: var(--radius-sm);
	}
	.validation-soft :global(svg) {
		flex-shrink: 0;
		color: var(--warning);
		margin-top: 2px;
	}
	.validation-soft span {
		font-size: 0.9375rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.validation-soft span :global(b) {
		color: var(--text-primary);
		font-weight: 600;
	}
	.blocker-link {
		display: inline;
		background: none;
		border: none;
		padding: 0;
		color: var(--accent-primary);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.blocker-link:active {
		opacity: 0.7;
	}
	.checklist-tip {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0;
		font-style: italic;
	}
	.checklist-tip strong {
		color: var(--text-secondary);
		font-style: normal;
	}
	.validation-actions {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-md);
	}
	.validation-actions .save-link-btn {
		flex: 1;
		margin-top: 0;
	}
	.revalidate-btn {
		background: var(--accent-primary) !important;
		color: var(--bg-primary) !important;
	}
	.skip-btn {
		background: var(--bg-surface) !important;
		color: var(--text-primary) !important;
		border: 1px solid var(--border) !important;
	}
	:global(.info-box.warn) {
		background: color-mix(in srgb, var(--warning) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--warning) 20%, transparent);
	}
	:global(.info-box.warn svg) {
		color: var(--warning);
	}
</style>

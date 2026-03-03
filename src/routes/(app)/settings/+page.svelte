<script lang="ts">
	/* eslint-disable max-lines */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		isPushSupported,
		getExistingSubscription,
		subscribeToPush,
		unsubscribeFromPush
	} from '$lib/push';
	import { type AccentColorKey } from '$lib/colors';
	import { globalMuted } from '$lib/stores/mute';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import SortAscendingIcon from 'phosphor-svelte/lib/SortAscendingIcon';
	import ShuffleIcon from 'phosphor-svelte/lib/ShuffleIcon';
	import CrownIcon from 'phosphor-svelte/lib/CrownIcon';

	import {
		applyTheme,
		saveThemePreference,
		saveAutoScroll,
		saveMutedByDefault,
		saveFeedSortOrder,
		applyAccentColor,
		saveAccentColor,
		fetchNotificationPrefs,
		updateNotificationPref,
		type NotificationPrefs
	} from '$lib/settingsApi';
	import MemberList from '$lib/components/settings/MemberList.svelte';
	import InviteLink from '$lib/components/settings/InviteLink.svelte';
	import GroupNameEdit from '$lib/components/settings/GroupNameEdit.svelte';
	import RetentionPicker from '$lib/components/settings/RetentionPicker.svelte';
	import MaxFileSizePicker from '$lib/components/settings/MaxFileSizePicker.svelte';
	import ClipsManager from '$lib/components/settings/ClipsManager.svelte';
	import NotificationSettings from '$lib/components/settings/NotificationSettings.svelte';
	import AccentColorPicker from '$lib/components/settings/AccentColorPicker.svelte';
	import DownloadProviderManager from '$lib/components/settings/DownloadProviderManager.svelte';
	import PlatformFilter from '$lib/components/settings/PlatformFilter.svelte';
	import ShortcutManager from '$lib/components/settings/ShortcutManager.svelte';
	import GettingStartedChecklist from '$lib/components/settings/GettingStartedChecklist.svelte';
	import UsernameEdit from '$lib/components/settings/UsernameEdit.svelte';
	import AvatarCropModal from '$lib/components/AvatarCropModal.svelte';
	import Toggle from '$lib/components/settings/Toggle.svelte';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import ShortcutGuideSheet from '$lib/components/ShortcutGuideSheet.svelte';
	import AppleLogoIcon from 'phosphor-svelte/lib/AppleLogoIcon';
	import AndroidLogoIcon from 'phosphor-svelte/lib/AndroidLogoIcon';
	import { isStandalone } from '$lib/stores/pwa';
	import { groupMembers } from '$lib/stores/members';

	const vapidPublicKey = $derived(page.data.vapidPublicKey as string);
	const user = $derived(page.data.user);
	const group = $derived(page.data.group);
	const isHost = $derived(group?.createdBy === user?.id);

	let activeTab = $state<'me' | 'group'>('me');
	let showShortcutGuide = $state(false);
	let avatarCropImage = $state<string | null>(null);
	let avatarOverride = $state<string | null | undefined>(undefined);
	let avatarCacheBust = $state(0);
	let avatarFileInput = $state<HTMLInputElement | null>(null);
	const avatarPath = $derived(
		avatarOverride !== undefined ? avatarOverride : (user?.avatarPath ?? null)
	);
	const avatarUrl = $derived(
		avatarPath ? `/api/profile/avatar/${avatarPath}?v=${avatarCacheBust}` : null
	);

	function handleAvatarFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			avatarCropImage = URL.createObjectURL(file);
		}
		// Reset so the same file can be re-selected
		input.value = '';
	}

	function handleAvatarUploaded(path: string) {
		avatarOverride = path;
		avatarCacheBust = Date.now();
		avatarCropImage = null;
	}

	async function handleRemoveAvatar() {
		const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
		if (res.ok) {
			avatarOverride = null;
		}
	}
	let themeOverride = $state<'system' | 'light' | 'dark' | null>(null);
	let autoScrollOverride = $state<boolean | null>(null);
	let mutedByDefaultOverride = $state<boolean | null>(null);
	let feedSortOverride = $state<'oldest' | 'round-robin' | null>(null);
	let currentAccentOverride = $state<AccentColorKey | null>(null);

	const theme = $derived(
		themeOverride ?? (user?.themePreference as 'system' | 'light' | 'dark') ?? 'system'
	);
	const autoScroll = $derived(autoScrollOverride ?? user?.autoScroll ?? false);
	const mutedByDefault = $derived(mutedByDefaultOverride ?? user?.mutedByDefault ?? true);
	const feedSort = $derived(
		feedSortOverride ?? (user?.feedSortOrder as 'oldest' | 'round-robin') ?? 'oldest'
	);
	const feedSortIndex = $derived(feedSort === 'oldest' ? 0 : 1);
	const currentAccent = $derived(
		currentAccentOverride ?? (group?.accentColor as AccentColorKey) ?? 'coral'
	);
	const themeIndex = $derived.by(() => {
		if (theme === 'system') return 0;
		if (theme === 'light') return 1;
		return 2;
	});

	let platform = $state<'ios' | 'macos' | 'android' | 'other'>('other');
	let pushSupported = $state(false);
	let pushEnabled = $state(false);
	let pushLoading = $state(false);
	let prefsLoading = $state(true);
	let prefs = $state<NotificationPrefs>({
		newAdds: true,
		reactions: true,
		comments: true,
		mentions: true,
		dailyReminder: false
	});

	onMount(async () => {
		const ua = navigator.userAgent;
		if (/iPhone|iPad|iPod/i.test(ua)) platform = 'ios';
		else if (/Android/i.test(ua)) platform = 'android';
		else if (/Macintosh/i.test(ua)) platform = 'macos';
		else platform = 'other';

		pushSupported = isPushSupported();
		if (pushSupported) {
			const sub = await getExistingSubscription();
			pushEnabled = !!sub;
		}
		prefs = await fetchNotificationPrefs();
		prefsLoading = false;
	});

	function handleThemeChange(value: 'system' | 'light' | 'dark') {
		themeOverride = value;
		applyTheme(value);
		saveThemePreference(value);
	}

	function toggleAutoScroll() {
		const newValue = !autoScroll;
		autoScrollOverride = newValue;
		saveAutoScroll(newValue);
	}

	function toggleMutedByDefault() {
		const newValue = !mutedByDefault;
		mutedByDefaultOverride = newValue;
		globalMuted.set(newValue);
		saveMutedByDefault(newValue);
	}

	function handleFeedSortChange(value: 'oldest' | 'round-robin') {
		feedSortOverride = value;
		saveFeedSortOrder(value);
	}

	async function togglePush() {
		pushLoading = true;
		try {
			if (pushEnabled) {
				await unsubscribeFromPush();
				pushEnabled = false;
			} else {
				const sub = await subscribeToPush(vapidPublicKey);
				pushEnabled = !!sub;
			}
		} finally {
			pushLoading = false;
		}
	}

	function handleAccentChange(key: AccentColorKey) {
		currentAccentOverride = key;
		applyAccentColor(key);
		saveAccentColor(key);
	}

	function handleUpdatePref(key: keyof NotificationPrefs, value: boolean) {
		prefs = { ...prefs, [key]: value };
		updateNotificationPref(key, value);
	}

	const checklistMemberCount = $derived($groupMembers.length);
	const parsedPlatformFilterList = $derived.by(() => {
		if (!group?.platformFilterList) return null;
		try {
			return JSON.parse(group.platformFilterList);
		} catch {
			return null;
		}
	});

	function scrollToSection(sectionId: string) {
		const el = document.getElementById(sectionId);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}
</script>

<svelte:head>
	<title>Settings · {page.data.group?.name ?? 'scrolly'} · scrolly</title>
</svelte:head>

<div class="settings-page">
	{#if isHost}
		<div class="tab-bar">
			<div class="tab-bg" style="transform: translateX({activeTab === 'me' ? '0%' : '100%'})"></div>
			<button class="tab" class:active={activeTab === 'me'} onclick={() => (activeTab = 'me')}
				>Me</button
			>
			<button class="tab" class:active={activeTab === 'group'} onclick={() => (activeTab = 'group')}
				><CrownIcon size={14} /> Group</button
			>
		</div>
	{/if}

	{#if activeTab === 'me'}
		<div class="tab-content">
			<div class="profile-header">
				<input
					bind:this={avatarFileInput}
					type="file"
					accept="image/*"
					onchange={handleAvatarFileSelect}
					style="position:absolute;opacity:0;pointer-events:none;"
				/>
				<button class="avatar-btn" onclick={() => avatarFileInput?.click()}>
					{#if avatarUrl}
						<img src={avatarUrl} alt="Profile" class="avatar-large avatar-img" />
					{:else}
						<div class="avatar-large avatar-initials">
							{user?.username?.charAt(0)?.toUpperCase() ?? '?'}
						</div>
					{/if}
					<span class="avatar-edit-badge">
						<CameraIcon size={14} />
					</span>
				</button>
				{#if avatarPath}
					<button class="remove-photo-btn" onclick={handleRemoveAvatar}>Remove photo</button>
				{/if}
				<UsernameEdit initialUsername={user?.username ?? ''} />
				<span class="profile-phone">{user?.phone}</span>
				{#if group}
					<span class="group-pill">{group.name}</span>
				{/if}
			</div>

			{#if (platform === 'ios' || platform === 'macos') && group?.shortcutUrl}
				<button class="share-cta" onclick={() => (showShortcutGuide = true)}>
					<AppleLogoIcon size={20} class="share-cta-icon" />
					<div class="share-cta-content">
						<span class="share-cta-title">Share from other apps</span>
						<span class="share-cta-desc"
							>Install the {platform === 'ios' ? 'iOS' : 'macOS'} Shortcut to share clips directly</span
						>
					</div>
					<span class="share-cta-btn">Get</span>
				</button>
			{:else if platform === 'android'}
				<div class="share-cta android-cta">
					<AndroidLogoIcon size={20} class="share-cta-icon" />
					<div class="share-cta-content">
						<span class="share-cta-title">Share from other apps</span>
						<span class="share-cta-desc"
							>scrolly appears in your share sheet automatically — just tap Share on any video</span
						>
					</div>
				</div>
			{/if}

			<div class="settings-section">
				<h3 class="section-title">Playback</h3>
				<div class="card">
					<SettingRow name="Start muted" description="Mute videos and songs by default">
						<Toggle
							active={mutedByDefault}
							onclick={toggleMutedByDefault}
							label="Toggle start muted"
						/>
					</SettingRow>
					<SettingRow
						name="Auto-scroll"
						description="Advance to next clip when current one ends"
						last
					>
						<Toggle active={autoScroll} onclick={toggleAutoScroll} label="Toggle auto-scroll" />
					</SettingRow>
				</div>
			</div>

			<div class="settings-section">
				<h3 class="section-title">Feed Order</h3>
				<div class="card">
					<SettingRow description="Choose how clips are sorted in your feed" />
					<div class="theme-toggle feed-sort-toggle">
						<div class="theme-bg" style="transform: translateX({feedSortIndex * 100}%)"></div>
						<button
							class="theme-option"
							class:active={feedSort === 'oldest'}
							onclick={() => handleFeedSortChange('oldest')}
							><SortAscendingIcon size={15} weight="bold" /> Oldest First</button
						>
						<button
							class="theme-option"
							class:active={feedSort === 'round-robin'}
							onclick={() => handleFeedSortChange('round-robin')}
							><ShuffleIcon size={15} weight="bold" /> Mix Members</button
						>
					</div>
				</div>
			</div>

			<div class="settings-section">
				<h3 class="section-title">Notifications</h3>
				<div class="card">
					<NotificationSettings
						{pushSupported}
						{pushEnabled}
						{pushLoading}
						{prefs}
						{prefsLoading}
						isStandaloneMode={$isStandalone}
						isIos={platform === 'ios'}
						onTogglePush={togglePush}
						onUpdatePref={handleUpdatePref}
					/>
				</div>
			</div>

			<div class="settings-section">
				<h3 class="section-title">Appearance</h3>
				<div class="card">
					<div class="theme-toggle">
						<div class="theme-bg" style="transform: translateX({themeIndex * 100}%)"></div>
						<button
							class="theme-option"
							class:active={theme === 'system'}
							onclick={() => handleThemeChange('system')}>System</button
						>
						<button
							class="theme-option"
							class:active={theme === 'light'}
							onclick={() => handleThemeChange('light')}>Light</button
						>
						<button
							class="theme-option"
							class:active={theme === 'dark'}
							onclick={() => handleThemeChange('dark')}>Dark</button
						>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'group' && isHost}
		<div class="tab-content">
			<GettingStartedChecklist
				{group}
				isStandaloneMode={$isStandalone}
				memberCount={checklistMemberCount}
				onscrollto={scrollToSection}
			/>

			<div class="settings-section" id="section-group-name">
				<h3 class="section-title">Group Name</h3>
				<div class="card"><GroupNameEdit initialName={group.name} /></div>
			</div>
			<div class="settings-section" id="section-accent-color">
				<h3 class="section-title">Accent Color</h3>
				<div class="card">
					<AccentColorPicker {currentAccent} onchange={handleAccentChange} />
				</div>
			</div>

			<div class="settings-section" id="section-members">
				<h3 class="section-title">Members</h3>
				<div class="card">
					<MemberList hostId={group.createdBy} currentUserId={user.id} />
				</div>
			</div>
			<div class="settings-section">
				<h3 class="section-title">Invite Link</h3>
				<div class="card"><InviteLink inviteCode={group.inviteCode} /></div>
			</div>

			<div class="settings-section">
				<h3 class="section-title">Download Provider</h3>
				<div class="card"><DownloadProviderManager /></div>
			</div>
			<div class="settings-section">
				<h3 class="section-title">Allowed Platforms</h3>
				<div class="card">
					<PlatformFilter
						currentMode={group.platformFilterMode}
						currentPlatforms={parsedPlatformFilterList}
					/>
				</div>
			</div>
			<div class="settings-section" id="section-share-from-apps">
				<h3 class="section-title">Share from Apps</h3>
				<div class="card">
					<ShortcutManager shortcutUrl={group.shortcutUrl} shortcutToken={group.shortcutToken} />
				</div>
			</div>

			<div class="settings-section">
				<h3 class="section-title">Max Clip Size</h3>
				<div class="card">
					<MaxFileSizePicker currentMaxFileSizeMb={group.maxFileSizeMb} />
				</div>
			</div>
			<div class="settings-section">
				<h3 class="section-title">Content Retention</h3>
				<div class="card"><RetentionPicker currentRetention={group.retentionDays} /></div>
			</div>
			<div class="settings-section">
				<h3 class="section-title">Storage & Clips</h3>
				<div class="card"><ClipsManager /></div>
			</div>
		</div>
	{/if}

	{#if avatarCropImage}
		<AvatarCropModal
			imageUrl={avatarCropImage}
			ondismiss={() => {
				if (avatarCropImage) {
					URL.revokeObjectURL(avatarCropImage);
					avatarCropImage = null;
				}
			}}
			onuploaded={handleAvatarUploaded}
		/>
	{/if}

	{#if showShortcutGuide && group?.shortcutUrl}
		<ShortcutGuideSheet
			shortcutUrl={group.shortcutUrl}
			ondismiss={() => (showShortcutGuide = false)}
		/>
	{/if}

	<footer class="version-footer">
		<span>scrolly v{__APP_VERSION__}</span>
		<span class="attribution">
			Logo by <a
				href="https://thenounproject.com/icon/using-phone-on-toilet-970424/"
				target="_blank"
				rel="noopener">Gan Khoon Lay</a
			> via the Noun Project
		</span>
	</footer>
</div>

<style>
	.settings-page {
		max-width: 520px;
		margin: 0 auto;
		padding-bottom: var(--bottom-nav-height, 64px);
	}

	.tab-bar {
		display: flex;
		gap: 2px;
		background: var(--bg-surface);
		border-radius: var(--radius-full);
		padding: 3px;
		margin-bottom: var(--space-xl);
		position: relative;
	}

	.tab-bg {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc(50% - 3px);
		background: var(--text-primary);
		border-radius: var(--radius-full);
		transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
		z-index: 0;
	}

	.tab {
		flex: 1;
		padding: var(--space-sm) var(--space-lg);
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-display);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.2s ease;
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
	}

	.tab.active {
		color: var(--bg-primary);
	}

	.tab-content {
		display: flex;
		flex-direction: column;
	}

	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm) 0 var(--space-xl);
	}

	.avatar-btn {
		position: relative;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		margin-bottom: var(--space-xs);
	}

	.avatar-btn:active {
		transform: scale(0.97);
	}

	.avatar-large {
		width: 80px;
		height: 80px;
		border-radius: var(--radius-full);
	}

	.avatar-initials {
		background: var(--bg-surface);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 1.75rem;
	}

	.avatar-img {
		object-fit: cover;
		display: block;
	}

	.avatar-edit-badge {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		background: var(--accent-primary);
		color: var(--bg-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--bg-primary);
	}

	.remove-photo-btn {
		border: none;
		background: none;
		color: var(--error);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}

	.profile-phone {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.group-pill {
		display: inline-flex;
		padding: 3px var(--space-sm);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		color: var(--accent-primary);
		border-radius: var(--radius-full);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		margin-top: var(--space-xs);
	}

	.settings-section {
		margin-bottom: var(--space-lg);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin: 0 0 var(--space-sm);
		padding: 0 var(--space-xs);
	}

	.card {
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		padding: var(--space-lg);
	}

	.theme-toggle {
		display: flex;
		gap: 2px;
		background: var(--bg-surface);
		border-radius: var(--radius-full);
		padding: 3px;
		position: relative;
	}

	.theme-bg {
		position: absolute;
		top: 3px;
		bottom: 3px;
		left: 3px;
		width: calc(33.333% - 2px);
		background: var(--text-primary);
		border-radius: var(--radius-full);
		transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
		z-index: 0;
	}

	.feed-sort-toggle .theme-bg {
		width: calc(50% - 3px);
	}

	.feed-sort-toggle .theme-option {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
	}

	.theme-option {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.2s ease;
		position: relative;
		z-index: 1;
	}

	.theme-option.active {
		color: var(--bg-primary);
	}

	.share-cta {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		margin: var(--space-lg) 0;
		width: 100%;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.share-cta:active {
		transform: scale(0.98);
	}

	.share-cta :global(.share-cta-icon) {
		flex-shrink: 0;
		color: var(--accent-primary);
	}

	.share-cta-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1;
	}

	.share-cta-title {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.share-cta-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.share-cta.android-cta {
		cursor: default;
	}

	.share-cta.android-cta:active {
		transform: none;
	}

	.share-cta-btn {
		flex-shrink: 0;
		background: var(--accent-primary);
		color: var(--bg-primary);
		font-size: 0.8125rem;
		font-weight: 700;
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-full);
	}

	.version-footer {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.75rem;
		padding: var(--space-xl) 0;
		margin-top: var(--space-xl);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.attribution {
		font-size: 0.6875rem;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.attribution a {
		color: var(--text-muted);
		text-decoration: underline;
	}
</style>

<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { relativeTime } from '$lib/utils';
	import { fetchUnreadCount } from '$lib/stores/notifications';
	import { openSheet, closeSheet } from '$lib/stores/sheetOpen';
	import { clipOverlaySignal, openCommentsSignal } from '$lib/stores/toasts';
	import { createOverlayHistory } from '$lib/overlayHistory';
	import { createSafeTimeout } from '$lib/safeTimeout';
	import BellIcon from 'phosphor-svelte/lib/BellIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { fetchUnwatchedCount } from '$lib/stores/notifications';

	const { ondismiss }: { ondismiss: () => void } = $props();

	interface Notification {
		id: string;
		type: 'reaction' | 'comment' | 'reply' | 'mention';
		clipId: string;
		emoji: string | null;
		commentPreview: string | null;
		clipContentType: string;
		actorUsername: string;
		actorAvatar: string | null;
		clipThumbnail: string | null;
		clipTitle: string | null;
		read: boolean;
		createdAt: string;
	}

	interface GroupedSection {
		label: string;
		items: Notification[];
	}

	let items = $state<Notification[]>([]);
	let loading = $state(true);
	let visible = $state(false);
	const { safeTimeout, clearAll } = createSafeTimeout();

	const overlay = createOverlayHistory('sheet', 'activity');
	beforeNavigate(overlay.onBeforeNavigate);

	const grouped = $derived.by(() => {
		if (items.length === 0) return [];

		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterdayStart = new Date(todayStart.getTime() - 86400000);
		const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

		const sections: GroupedSection[] = [];
		const today: Notification[] = [];
		const yesterday: Notification[] = [];
		const thisWeek: Notification[] = [];
		const earlier: Notification[] = [];

		for (const n of items) {
			const d = new Date(n.createdAt);
			if (d >= todayStart) today.push(n);
			else if (d >= yesterdayStart) yesterday.push(n);
			else if (d >= weekStart) thisWeek.push(n);
			else earlier.push(n);
		}

		if (today.length) sections.push({ label: 'Today', items: today });
		if (yesterday.length) sections.push({ label: 'Yesterday', items: yesterday });
		if (thisWeek.length) sections.push({ label: 'This Week', items: thisWeek });
		if (earlier.length) sections.push({ label: 'Earlier', items: earlier });

		return sections;
	});

	// Animate in, lock scroll, manage history
	$effect(() => {
		openSheet();
		requestAnimationFrame(() => {
			visible = true;
		});
		document.body.style.overflow = 'hidden';

		const cleanupHistory = overlay.attach(ondismiss);

		return () => {
			closeSheet();
			document.body.style.overflow = '';
			cleanupHistory();
		};
	});

	// Fetch notifications on mount
	$effect(() => {
		loadNotifications();
	});

	async function loadNotifications() {
		const res = await fetch('/api/notifications?limit=50');
		if (res.ok) {
			const data = await res.json();
			items = data.notifications;
		}
		loading = false;

		// Only mark as read if fetch succeeded
		if (res.ok) {
			await fetch('/api/notifications/mark-read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true })
			});
			fetchUnreadCount();

			// Fade out unread backgrounds after a short delay
			safeTimeout(() => {
				items = items.map((n) => ({ ...n, read: true }));
			}, 1000);
		}
	}

	function dismiss() {
		visible = false;
		safeTimeout(() => ondismiss(), 300);
	}

	function handleNotificationClick(e: Event, n: Notification) {
		e.preventDefault();
		visible = false;

		const targetClipId = n.clipId;
		const shouldOpenComments = n.type !== 'reaction';

		safeTimeout(() => {
			ondismiss();

			// Cleanup calls history.back() which queues an async popstate — defer
			// overlay opening so popstate settles before ClipOverlay mounts.
			setTimeout(() => {
				if (window.location.pathname === '/') {
					clipOverlaySignal.set(targetClipId);
					if (shouldOpenComments) openCommentsSignal.set(targetClipId);
				} else {
					const q = shouldOpenComments
						? `clip=${targetClipId}&comments=true`
						: `clip=${targetClipId}`;
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() expects route ID, not URL with query params
					goto(`/?${q}`);
				}
			}, 0);
		}, 300);
	}

	function description(n: Notification): string {
		if (n.type === 'reaction') {
			return `reacted ${n.emoji} to your clip`;
		}
		if (n.type === 'mention') {
			return 'mentioned you';
		}
		if (n.type === 'reply') {
			return 'replied to a comment';
		}
		return 'commented on a clip';
	}

	async function dismissNotification(e: Event, n: Notification) {
		e.preventDefault();
		e.stopPropagation();
		items = items.filter((item) => item.id !== n.id);
		await fetch(`/api/notifications/${n.id}`, { method: 'DELETE' });
		fetchUnreadCount();
		fetchUnwatchedCount();
	}

	onDestroy(clearAll);
</script>

<div class="overlay" class:visible onclick={dismiss} role="presentation"></div>

<div class="sheet" class:visible>
	<div class="content">
		{#if loading}
			<div class="activity-empty">
				<span class="spinner"></span>
			</div>
		{:else if items.length === 0}
			<div class="activity-empty">
				<div class="empty-icon">
					<BellIcon size={48} />
				</div>
				<p class="empty-title">No activity yet</p>
				<p class="empty-sub">Reactions, comments, and mentions will show up here</p>
			</div>
		{:else}
			{#each grouped as section (section.label)}
				<div class="section">
					<h2 class="section-header">{section.label}</h2>
					<div class="notification-list">
						{#each section.items as n, i (n.id)}
							<a
								href="{resolve('/')}?clip={n.clipId}"
								class="notification-item"
								class:unread={!n.read}
								style="animation-delay: {Math.min(i, 15) * 30}ms"
								onclick={(e) => handleNotificationClick(e, n)}
							>
								<div class="actor-avatar">
									{#if n.actorAvatar}
										<img src="/api/profile/avatar/{n.actorAvatar}" alt="" class="avatar-img" />
									{:else}
										<span class="avatar-initial">
											{n.actorUsername.charAt(0).toUpperCase()}
										</span>
									{/if}
								</div>
								<div class="notification-body">
									<p class="notification-text">
										<span class="actor-name">{n.actorUsername}</span>
										{description(n)}
									</p>
									{#if (n.type === 'comment' || n.type === 'reply' || n.type === 'mention') && n.commentPreview}
										<p class="comment-preview">{n.commentPreview}</p>
									{/if}
									<span class="notification-time">{relativeTime(n.createdAt)}</span>
								</div>
								{#if n.clipThumbnail}
									<div class="clip-thumb">
										<img src="/api/thumbnails/{n.clipThumbnail.split('/').pop()}" alt="" />
									</div>
								{/if}
								<button
									class="dismiss-btn"
									onclick={(e) => dismissNotification(e, n)}
									aria-label="Dismiss notification"
								>
									<XIcon size={14} />
								</button>
							</a>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 99;
		opacity: 0;
		transition: opacity 300ms ease;
	}

	.overlay.visible {
		opacity: 1;
	}

	.sheet {
		position: fixed;
		top: calc(56px + env(safe-area-inset-top));
		right: var(--space-lg);
		width: calc(100vw - 2 * var(--space-lg));
		max-width: 400px;
		max-height: 75vh;
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		z-index: 100;
		display: flex;
		flex-direction: column;
		transform-origin: top right;
		transform: scale(0.9);
		opacity: 0;
		transition:
			transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
			opacity 200ms ease;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
	}

	.sheet.visible {
		transform: scale(1);
		opacity: 1;
	}

	.content {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
		padding: var(--space-md) var(--space-sm) var(--space-lg);
		max-width: 520px;
		margin: 0 auto;
		width: 100%;
	}
	.section {
		margin-bottom: var(--space-lg);
	}

	.section-header {
		font-family: var(--font-display);
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--text-secondary);
		margin: 0;
		padding: var(--space-sm) 0 var(--space-sm);
		letter-spacing: 0.01em;
	}

	.activity-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl) var(--space-lg);
		gap: var(--space-sm);
	}

	.empty-icon {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		margin-bottom: var(--space-sm);
	}
	.empty-icon :global(svg) {
		width: 48px;
		height: 48px;
		opacity: 0.4;
	}
	.empty-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.empty-sub {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
		text-align: center;
		max-width: 240px;
		line-height: 1.4;
	}

	.notification-list {
		display: flex;
		flex-direction: column;
	}

	.notification-item {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md) var(--space-sm);
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-sm);
		transition: background 0.4s ease-out;
		animation: notif-in 250ms cubic-bezier(0.32, 0.72, 0, 1) both;
	}

	.notification-item:active {
		background: var(--bg-surface);
	}

	.notification-item.unread {
		background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
	}

	@keyframes notif-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.actor-avatar {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initial {
		color: var(--text-secondary);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1rem;
	}

	.notification-body {
		flex: 1;
		min-width: 0;
	}

	.notification-text {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.35;
	}

	.actor-name {
		font-weight: 600;
		color: var(--text-primary);
	}

	.comment-preview {
		margin: 2px 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.notification-time {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.clip-thumb {
		width: 44px;
		height: 56px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--bg-surface);
	}

	.clip-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		border-radius: var(--radius-full);
		cursor: pointer;
		flex-shrink: 0;
		padding: 0;
		transition: all 0.15s ease;
	}

	.dismiss-btn:hover {
		background: var(--bg-surface);
		color: var(--text-secondary);
	}

	.dismiss-btn:active {
		transform: scale(0.9);
	}

	.spinner {
		display: inline-block;
		width: 32px;
		height: 32px;
		border: 2.5px solid var(--bg-subtle);
		border-top-color: var(--text-primary);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

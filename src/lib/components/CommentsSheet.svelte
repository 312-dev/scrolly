<script lang="ts">
	import { relativeTime } from '$lib/utils';
	import { toast } from '$lib/stores/toasts';
	import { onDestroy } from 'svelte';
	import CommentInput from './CommentInput.svelte';
	import CommentRow from './CommentRow.svelte';
	import GifPicker from './GifPicker.svelte';
	import BaseSheet from './BaseSheet.svelte';
	import type { GroupMember } from '$lib/types';
	import {
		type Comment,
		type ReactionEvent,
		fetchComments,
		postComment,
		editComment as apiEditComment,
		deleteComment as apiDeleteComment,
		toggleCommentHeart,
		markCommentsRead
	} from '$lib/commentsApi';

	const {
		clipId,
		currentUserId,
		gifEnabled = false,
		autoFocus = false,
		members = [],
		ondismiss
	}: {
		clipId: string;
		currentUserId: string;
		gifEnabled?: boolean;
		autoFocus?: boolean;
		members?: GroupMember[];
		ondismiss: () => void;
	} = $props();

	const memberUsernames = $derived(members.map((m) => m.username));

	let comments = $state<Comment[]>([]);
	let reactionEvents = $state<ReactionEvent[]>([]);
	let loading = $state(true);
	let submitting = $state(false);
	let replyingTo = $state<{ id: string; username: string } | null>(null);
	let commentInput: ReturnType<typeof CommentInput> | null = $state(null);
	let showGifPicker = $state(false);
	let attachedGif = $state<{
		id: string;
		url: string;
		stillUrl: string;
		shareUrl: string;
		width: number;
		height: number;
	} | null>(null);

	const totalCount = $derived(comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0));

	let justHeartedIds = $state(new Set<string>());
	let justPostedId = $state<string | null>(null);
	let sheetRef = $state<ReturnType<typeof BaseSheet> | null>(null);
	let editingId = $state<string | null>(null);
	let editText = $state('');
	let heartPopoverId = $state<string | null>(null);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	let timers: ReturnType<typeof setTimeout>[] = [];

	function safeTimeout(fn: () => void, ms: number) {
		const id = setTimeout(fn, ms);
		timers.push(id);
		return id;
	}

	onDestroy(() => timers.forEach(clearTimeout));

	$effect(() => {
		loadComments();
	});

	// Auto-focus the input independently of data loading so iOS doesn't lose
	// the gesture context by the time the fetch finishes.
	$effect(() => {
		if (!autoFocus) return;
		const t = safeTimeout(() => commentInput?.focus(), 350);
		return () => clearTimeout(t);
	});

	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				if (showGifPicker) {
					showGifPicker = false;
				} else if (!attachedGif && commentInput?.isEmpty()) {
					sheetRef?.dismiss();
				}
			}
		}
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});

	async function loadComments() {
		loading = true;
		const result = await fetchComments(clipId);
		comments = result.comments;
		reactionEvents = result.reactionEvents;
		loading = false;
		markCommentsRead(clipId);
	}

	async function handleSubmit(text: string, gifUrl?: string) {
		submitting = true;
		try {
			const newComment = await postComment(clipId, text, replyingTo?.id, gifUrl);
			if (replyingTo) {
				const parent = comments.find((c) => c.id === replyingTo!.id);
				if (parent) {
					if (!parent.replies) parent.replies = [];
					parent.replies = [...parent.replies, newComment];
					parent.replyCount = (parent.replyCount || 0) + 1;
					comments = [...comments];
				}
				replyingTo = null;
			} else {
				comments = [{ ...newComment, replyCount: 0, replies: [] }, ...comments];
				justPostedId = newComment.id;
				safeTimeout(() => {
					justPostedId = null;
				}, 300);
			}
			commentInput?.clear();
			attachedGif = null;
			showGifPicker = false;
		} catch {
			toast.error('Failed to post comment');
		}
		submitting = false;
	}

	async function handleDelete(commentId: string) {
		try {
			const deletedIds = new Set(await apiDeleteComment(clipId, commentId));
			comments = comments
				.filter((c) => !deletedIds.has(c.id))
				.map((c) => ({
					...c,
					replies: (c.replies || []).filter((r) => !deletedIds.has(r.id)),
					replyCount: (c.replies || []).filter((r) => !deletedIds.has(r.id)).length
				}));
		} catch {
			toast.error('Failed to delete comment');
		}
	}

	function startEdit(comment: Comment) {
		editingId = comment.id;
		editText = comment.text || '';
	}

	function cancelEdit() {
		editingId = null;
		editText = '';
	}

	async function handleEdit(commentId: string) {
		const trimmed = editText.trim();
		if (!trimmed) return;
		try {
			const result = await apiEditComment(clipId, commentId, trimmed);
			const topComment = comments.find((c) => c.id === commentId);
			if (topComment) {
				topComment.text = result.text;
				topComment.gifUrl = result.gifUrl;
				comments = [...comments];
			} else {
				for (const c of comments) {
					const reply = c.replies?.find((r) => r.id === commentId);
					if (reply) {
						reply.text = result.text;
						reply.gifUrl = result.gifUrl;
						comments = [...comments];
						break;
					}
				}
			}
			editingId = null;
			editText = '';
		} catch {
			toast.error('Failed to edit comment');
		}
	}

	async function toggleHeart(comment: Comment) {
		const wasHearted = comment.hearted;
		const prevCount = comment.heartCount;
		comment.hearted = !wasHearted;
		comment.heartCount += comment.hearted ? 1 : -1;
		comments = [...comments];

		if (!wasHearted) {
			justHeartedIds = new Set([...justHeartedIds, comment.id]);
			safeTimeout(() => {
				justHeartedIds = new Set([...justHeartedIds].filter((id) => id !== comment.id));
			}, 300);
		}

		try {
			const result = await toggleCommentHeart(clipId, comment.id);
			comment.heartCount = result.heartCount;
			comment.hearted = result.hearted;
		} catch {
			comment.hearted = wasHearted;
			comment.heartCount = prevCount;
		}
		comments = [...comments];
	}

	function startReply(comment: Comment) {
		replyingTo = { id: comment.id, username: comment.username };
		requestAnimationFrame(() => commentInput?.focus());
	}

	type FeedItem = { type: 'comment'; data: Comment } | { type: 'reaction'; data: ReactionEvent };

	const feedItems = $derived.by<FeedItem[]>(() => {
		const items: FeedItem[] = [
			...comments.map((c) => ({ type: 'comment' as const, data: c })),
			...reactionEvents.map((r) => ({ type: 'reaction' as const, data: r }))
		];
		items.sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
		return items;
	});

	function startHeartLongPress(commentId: string) {
		longPressTimer = setTimeout(() => {
			heartPopoverId = heartPopoverId === commentId ? null : commentId;
		}, 400);
	}

	function cancelHeartLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function dismissHeartPopover() {
		heartPopoverId = null;
	}
</script>

<div class="comments-sheet-wrapper">
	<BaseSheet
		bind:this={sheetRef}
		title="Comments{totalCount > 0 ? ` (${totalCount})` : ''}"
		sheetId="comments"
		{ondismiss}
	>
		<div class="content-area">
			{#if showGifPicker}
				<GifPicker
					onselect={(gif) => {
						attachedGif = gif;
						showGifPicker = false;
					}}
					onclose={() => {
						showGifPicker = false;
						requestAnimationFrame(() => commentInput?.focus());
					}}
					autoFocus
				/>
			{:else}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
				<div class="comments-list" role="list" aria-label="Comments" onclick={dismissHeartPopover}>
					{#if loading}
						<p class="empty">Loading...</p>
					{:else if feedItems.length === 0}
						<p class="empty">No comments yet</p>
					{:else}
						{#each feedItems as item (item.type === 'comment' ? item.data.id : `reaction-${item.data.emoji}-${item.data.username}-${item.data.createdAt}`)}
							{#if item.type === 'reaction'}
								{@const r = item.data}
								<div class="reaction-event" role="listitem">
									<span class="reaction-emoji">{r.emoji}</span>
									<span class="reaction-text">{r.username} reacted</span>
									<span class="reaction-time">{relativeTime(r.createdAt)}</span>
								</div>
							{:else}
								{@const comment = item.data}
								<CommentRow
									{comment}
									{currentUserId}
									{memberUsernames}
									isEditing={editingId === comment.id}
									bind:editText
									isJustPosted={comment.id === justPostedId}
									isJustHearted={justHeartedIds.has(comment.id)}
									heartPopoverVisible={heartPopoverId === comment.id}
									onreply={() => startReply(comment)}
									ontoggleheart={() => toggleHeart(comment)}
									onstartedit={() => startEdit(comment)}
									onsaveedit={() => handleEdit(comment.id)}
									oncanceledit={cancelEdit}
									ondelete={() => handleDelete(comment.id)}
									onstartlongpress={() => startHeartLongPress(comment.id)}
									oncancellongpress={cancelHeartLongPress}
								/>
								{#if comment.replies && comment.replies.length > 0}
									<div class="replies" role="list" aria-label="Replies to {comment.username}">
										{#each comment.replies as reply (reply.id)}
											<CommentRow
												comment={reply}
												{currentUserId}
												{memberUsernames}
												isReply
												isEditing={editingId === reply.id}
												bind:editText
												isJustHearted={justHeartedIds.has(reply.id)}
												heartPopoverVisible={heartPopoverId === reply.id}
												ontoggleheart={() => toggleHeart(reply)}
												onstartedit={() => startEdit(reply)}
												onsaveedit={() => handleEdit(reply.id)}
												oncanceledit={cancelEdit}
												ondelete={() => handleDelete(reply.id)}
												onstartlongpress={() => startHeartLongPress(reply.id)}
												oncancellongpress={cancelHeartLongPress}
											/>
										{/each}
									</div>
								{/if}
							{/if}
						{/each}
					{/if}
				</div>
			{/if}
		</div>

		<CommentInput
			bind:this={commentInput}
			{replyingTo}
			{submitting}
			{gifEnabled}
			gifPickerOpen={showGifPicker}
			{attachedGif}
			{members}
			onsubmit={handleSubmit}
			oncancelreply={() => {
				replyingTo = null;
			}}
			ongiftoggle={() => {
				showGifPicker = !showGifPicker;
				if (!showGifPicker) {
					requestAnimationFrame(() => commentInput?.focus());
				}
			}}
			onremovegif={() => {
				attachedGif = null;
			}}
		/>
	</BaseSheet>
</div>

<style>
	.comments-sheet-wrapper {
		--_sheet-bg: rgba(0, 0, 0, 0.93);
	}
	@media (prefers-color-scheme: light) {
		.comments-sheet-wrapper {
			--_sheet-bg: var(--bg-elevated);
		}
	}
	:global([data-theme='dark']) .comments-sheet-wrapper {
		--_sheet-bg: rgba(0, 0, 0, 0.93);
	}
	:global([data-theme='light']) .comments-sheet-wrapper {
		--_sheet-bg: var(--bg-elevated);
	}
	.comments-sheet-wrapper :global(.base-overlay) {
		background: transparent;
	}
	.comments-sheet-wrapper :global(.base-sheet) {
		height: 50vh;
		height: 50dvh;
		background: var(--_sheet-bg);
	}
	.content-area {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.comments-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-md) var(--space-lg);
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
	}
	.empty {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-2xl);
		margin: 0;
	}
	.reaction-event {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) 0;
	}
	.reaction-emoji {
		font-size: 0.875rem;
	}
	.reaction-text {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.reaction-time {
		font-size: 0.6875rem;
		color: var(--text-muted);
		margin-left: auto;
	}
	.replies {
		margin-top: var(--space-sm);
		padding-left: 4px;
		border-left: 2px solid var(--border);
		margin-left: 2px;
	}
</style>

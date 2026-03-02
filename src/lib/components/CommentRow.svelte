<script lang="ts">
	import { relativeTime } from '$lib/utils';
	import MentionText from './MentionText.svelte';
	import HeartIcon from 'phosphor-svelte/lib/HeartIcon';
	import type { Comment } from '$lib/commentsApi';

	let {
		comment,
		currentUserId,
		memberUsernames,
		isReply = false,
		isEditing = false,
		editText = $bindable(''),
		isJustPosted = false,
		isJustHearted = false,
		heartPopoverVisible = false,
		onreply,
		ontoggleheart,
		onstartedit,
		onsaveedit,
		oncanceledit,
		ondelete,
		onstartlongpress,
		oncancellongpress
	}: {
		comment: Comment;
		currentUserId: string;
		memberUsernames: string[];
		isReply?: boolean;
		isEditing?: boolean;
		editText?: string;
		isJustPosted?: boolean;
		isJustHearted?: boolean;
		heartPopoverVisible?: boolean;
		onreply?: () => void;
		ontoggleheart?: () => void;
		onstartedit?: () => void;
		onsaveedit?: () => void;
		oncanceledit?: () => void;
		ondelete?: () => void;
		onstartlongpress?: () => void;
		oncancellongpress?: () => void;
	} = $props();

	const iconSize = $derived(isReply ? 12 : 14);

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			onsaveedit?.();
		} else if (e.key === 'Escape') {
			oncanceledit?.();
		}
	}
</script>

<div class={isReply ? 'reply' : 'comment'} class:just-posted={isJustPosted} role="listitem">
	<div class={isReply ? 'reply-avatar' : 'comment-avatar'}>
		{#if comment.avatarPath}
			<img src="/api/profile/avatar/{comment.avatarPath}" alt="" class="avatar-img" />
		{:else}
			<span>{comment.username.charAt(0).toUpperCase()}</span>
		{/if}
	</div>
	<div class={isReply ? 'reply-body' : 'comment-body'}>
		<div class="comment-header">
			<span class={isReply ? 'reply-username' : 'comment-username'}>{comment.username}</span>
			<span class="comment-time">{relativeTime(comment.createdAt)}</span>
		</div>
		{#if isEditing}
			<div class="edit-form">
				<input class="edit-input" type="text" bind:value={editText} onkeydown={handleEditKeydown} />
				<div class="edit-actions">
					<button class="edit-save-btn" onclick={onsaveedit}>Save</button>
					<button class="edit-cancel-btn" onclick={oncanceledit}>Cancel</button>
				</div>
			</div>
		{:else}
			{#if comment.text}
				<p class={isReply ? 'reply-text' : 'comment-text'}>
					<MentionText text={comment.text} usernames={memberUsernames} />
				</p>
			{/if}
			{#if comment.gifUrl}
				<img
					class={isReply ? 'reply-gif' : 'comment-gif'}
					src={comment.gifUrl}
					alt="GIF"
					loading="lazy"
				/>
			{/if}
		{/if}
		<div class="comment-actions">
			{#if !isReply}
				<button class="reply-btn" onclick={onreply}>Reply</button>
			{/if}
			{#if comment.userId !== currentUserId}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="heart-wrapper"
					onpointerdown={onstartlongpress}
					onpointerup={oncancellongpress}
					onpointercancel={oncancellongpress}
					onpointerleave={oncancellongpress}
				>
					<button
						class="heart-btn"
						class:hearted={comment.hearted}
						class:heart-pop={isJustHearted}
						onclick={ontoggleheart}
					>
						<HeartIcon size={iconSize} weight={comment.hearted ? 'fill' : 'regular'} />
						{#if comment.heartCount > 0}
							<span class="heart-count">{comment.heartCount}</span>
						{/if}
					</button>
					{#if heartPopoverVisible && comment.heartUsers.length > 0}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="heart-popover" onclick={(e) => e.stopPropagation()}>
							{#each comment.heartUsers as name, i (i)}
								{name}<br />
							{/each}
						</div>
					{/if}
				</span>
			{:else if comment.heartCount > 0}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="heart-wrapper"
					onpointerdown={onstartlongpress}
					onpointerup={oncancellongpress}
					onpointercancel={oncancellongpress}
					onpointerleave={oncancellongpress}
				>
					<span class="heart-count-only">
						<HeartIcon size={iconSize} weight="regular" />
						<span class="heart-count">{comment.heartCount}</span>
					</span>
					{#if heartPopoverVisible && comment.heartUsers.length > 0}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="heart-popover" onclick={(e) => e.stopPropagation()}>
							{#each comment.heartUsers as name, i (i)}
								{name}<br />
							{/each}
						</div>
					{/if}
				</span>
			{/if}
			{#if comment.canEdit}
				<button class="action-text-btn" onclick={onstartedit}>Edit</button>
				<button class="action-text-btn action-delete" onclick={ondelete}>Delete</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.comment {
		display: flex;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
	}
	.comment-avatar,
	.reply-avatar {
		border-radius: var(--radius-full);
		background: var(--accent-magenta);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-family: var(--font-display);
		font-weight: 700;
	}
	.comment-avatar {
		width: 28px;
		height: 28px;
		font-size: 0.75rem;
	}
	.comment-avatar .avatar-img,
	.reply-avatar .avatar-img {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-full);
		object-fit: cover;
	}
	.comment-body,
	.reply-body {
		flex: 1;
		min-width: 0;
	}
	.comment-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: 2px;
	}
	.comment-username {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.comment-time {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.action-text-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		transition: color 0.2s ease;
	}
	.action-text-btn:active {
		transform: scale(0.97);
	}
	.action-delete {
		color: var(--text-muted);
	}
	.action-delete:hover {
		color: var(--error);
	}
	.edit-form {
		margin: var(--space-xs) 0;
	}
	.edit-input {
		width: 100%;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.875rem;
		padding: var(--space-xs) var(--space-sm);
		outline: none;
	}
	.edit-input:focus {
		border-color: var(--accent-primary);
	}
	.edit-actions {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-xs);
	}
	.edit-save-btn,
	.edit-cancel-btn {
		background: none;
		border: none;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
	.edit-save-btn {
		color: var(--accent-primary);
	}
	.edit-cancel-btn {
		color: var(--text-muted);
	}
	.comment-text {
		font-size: 0.875rem;
	}
	.comment-gif,
	.reply-gif {
		display: block;
		border-radius: var(--radius-md);
		margin-top: var(--space-sm);
		object-fit: contain;
		background: var(--bg-surface);
		padding: 2px;
	}
	.comment-gif {
		max-width: 150px;
		max-height: 150px;
	}
	.reply-gif {
		max-width: 120px;
		max-height: 120px;
	}
	.comment-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin-top: 4px;
	}
	.reply-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		transition: color 0.2s ease;
	}
	.reply-btn:active {
		transform: scale(0.97);
	}
	.heart-btn {
		background: none;
		border: none;
		display: flex;
		align-items: center;
		gap: 3px;
		cursor: pointer;
		padding: 0;
		color: var(--text-muted);
		transition:
			color 0.2s ease,
			transform 0.1s ease;
	}
	.heart-btn:active {
		transform: scale(0.9);
	}
	.heart-btn.hearted {
		color: var(--accent-magenta);
	}
	.heart-count {
		font-size: 0.6875rem;
	}
	.heart-count-only {
		display: flex;
		align-items: center;
		gap: 3px;
		color: var(--text-muted);
	}
	.heart-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
		-webkit-user-select: none;
		user-select: none;
	}
	.heart-popover {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-xs) var(--space-sm);
		font-size: 0.6875rem;
		color: var(--text-secondary);
		white-space: nowrap;
		line-height: 1.5;
		z-index: 10;
		margin-bottom: 4px;
	}
	.reply {
		display: flex;
		gap: 6px;
		padding: var(--space-xs) 0 var(--space-xs) var(--space-sm);
	}
	.reply-avatar {
		width: 22px;
		height: 22px;
		font-size: 0.625rem;
	}
	.reply-username {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.comment-text,
	.reply-text {
		margin: 0;
		color: var(--text-secondary);
		line-height: 1.4;
	}
	.reply-text {
		font-size: 0.8125rem;
	}
	.heart-btn.heart-pop :global(svg) {
		animation: heart-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes heart-pop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.4);
		}
		100% {
			transform: scale(1);
		}
	}
	.comment.just-posted {
		animation: comment-slide-in 250ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	@keyframes comment-slide-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

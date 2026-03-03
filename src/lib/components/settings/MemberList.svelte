<script lang="ts">
	import { untrack } from 'svelte';
	import { confirm } from '$lib/stores/confirm';
	import { toast } from '$lib/stores/toasts';
	import { groupMembers } from '$lib/stores/members';
	import { rawDigits, formatPhone, toE164 } from '$lib/phone';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';

	const {
		hostId,
		currentUserId
	}: {
		hostId: string;
		currentUserId: string;
	} = $props();

	type Member = {
		id: string;
		username: string;
		avatarPath: string | null;
		createdAt: number;
		isHost: boolean;
	};

	let members = $state<Member[]>([]);
	let loading = $state(true);

	// Add member form state (host only)
	let showAddForm = $state(false);
	let newUsername = $state('');
	let newPhone = $state('');
	let addError = $state('');
	let adding = $state(false);

	const isHost = $derived(currentUserId === hostId);

	function handlePhoneInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const digits = rawDigits(input.value).slice(0, 10);
		newPhone = formatPhone(digits);
	}

	async function handleAddMember() {
		addError = '';
		const digits = rawDigits(newPhone);
		if (!newUsername.trim()) {
			addError = 'Username is required';
			return;
		}
		if (digits.length !== 10) {
			addError = 'Enter a 10-digit phone number';
			return;
		}

		adding = true;
		try {
			const res = await fetch('/api/group/members', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					username: newUsername.trim(),
					phone: toE164(newPhone)
				})
			});
			const data = await res.json();
			if (!res.ok) {
				addError = data.error || 'Failed to add member';
				return;
			}
			members = [...members, data.member];
			groupMembers.update((ms) => [
				...ms,
				{
					id: data.member.id,
					username: data.member.username,
					avatarPath: data.member.avatarPath
				}
			]);
			newUsername = '';
			newPhone = '';
			showAddForm = false;
			toast.success(`${data.member.username} added`);
		} catch {
			addError = 'Failed to add member';
		} finally {
			adding = false;
		}
	}

	$effect(() => {
		untrack(async () => {
			const res = await fetch('/api/group/members');
			if (res.ok) {
				members = await res.json();
			}
			loading = false;
		});
	});

	function formatDate(epochSeconds: number) {
		return new Date(epochSeconds * 1000).toLocaleDateString('en-US', {
			month: 'short',
			year: 'numeric'
		});
	}

	async function handleRemove(member: Member) {
		const confirmed = await confirm({
			title: 'Remove Member',
			message: `Remove ${member.username} from the group? Their clips will be preserved, but they won't be able to access the group anymore.`,
			confirmLabel: 'Remove',
			destructive: true
		});
		if (!confirmed) return;

		try {
			const res = await fetch(`/api/group/members/${member.id}`, { method: 'DELETE' });
			if (res.ok) {
				members = members.filter((m) => m.id !== member.id);
				groupMembers.update((ms) => ms.filter((m) => m.id !== member.id));
				toast.success(`${member.username} removed`);
			} else {
				toast.error('Failed to remove member');
			}
		} catch {
			toast.error('Failed to remove member');
		}
	}
</script>

{#if loading}
	<p class="hint">Loading members...</p>
{:else if members.length === 0}
	<p class="hint">No members found.</p>
{:else}
	<div class="member-list">
		{#each members as member (member.id)}
			<div class="member-row">
				<div class="member-avatar">
					{#if member.avatarPath}
						<img src="/api/profile/avatar/{member.avatarPath}" alt="" class="member-avatar-img" />
					{:else}
						<span>{member.username?.charAt(0)?.toUpperCase() ?? '?'}</span>
					{/if}
				</div>
				<div class="member-info">
					<div class="member-name-row">
						<span class="member-name">{member.username}</span>
						{#if member.isHost}
							<span class="host-badge">Host</span>
						{/if}
					</div>
					<span class="member-joined">Joined {formatDate(member.createdAt)}</span>
				</div>
				{#if !member.isHost && currentUserId === hostId}
					<button
						class="remove-btn"
						onclick={() => handleRemove(member)}
						aria-label="Remove {member.username}"
					>
						<XIcon size={16} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}

{#if isHost && !loading}
	<div class="add-member-section">
		{#if showAddForm}
			<div class="add-form">
				<input
					type="text"
					class="add-input"
					placeholder="Username"
					bind:value={newUsername}
					maxlength="50"
				/>
				<div class="phone-field">
					<span class="phone-prefix">+1</span>
					<input
						type="tel"
						class="add-input phone-input"
						placeholder="(555) 123-4567"
						value={newPhone}
						oninput={handlePhoneInput}
						maxlength="14"
					/>
				</div>
				{#if addError}
					<p class="add-error">{addError}</p>
				{/if}
				<div class="add-actions">
					<button
						class="btn-cancel"
						onclick={() => {
							showAddForm = false;
							newUsername = '';
							newPhone = '';
							addError = '';
						}}
					>
						Cancel
					</button>
					<button class="btn-add" onclick={handleAddMember} disabled={adding}>
						{adding ? 'Adding...' : 'Add'}
					</button>
				</div>
			</div>
		{:else}
			<button class="btn-add-member" onclick={() => (showAddForm = true)}>
				<PlusIcon size={18} />
				Add member
			</button>
		{/if}
	</div>
{/if}

<style>
	.hint {
		color: var(--text-muted);
		font-size: 0.8125rem;
		margin: 0;
	}

	.member-list {
		display: flex;
		flex-direction: column;
	}

	.member-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--bg-surface);
	}

	.member-row:first-child {
		padding-top: 0;
	}

	.member-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.member-avatar {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		background: var(--accent-magenta);
		color: var(--text-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1rem;
	}

	.member-avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-full);
	}

	.member-info {
		flex: 1;
		min-width: 0;
	}

	.member-name-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.member-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.host-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent-primary);
		background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
		padding: 2px var(--space-xs);
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.member-joined {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.remove-btn {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		border: none;
		background: color-mix(in srgb, var(--error) 10%, transparent);
		color: var(--error);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.2s ease;
		padding: 0;
	}

	.remove-btn:active {
		background: color-mix(in srgb, var(--error) 20%, transparent);
	}

	.remove-btn :global(svg) {
		width: 16px;
		height: 16px;
	}

	.add-member-section {
		margin-top: var(--space-md);
	}

	.btn-add-member {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		border: 1px dashed var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-add-member:active {
		transform: scale(0.97);
	}

	.btn-add-member :global(svg) {
		width: 18px;
		height: 18px;
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.add-input {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		color: var(--text-primary);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.2s ease;
		box-sizing: border-box;
	}

	.add-input:focus {
		border-color: var(--accent-primary);
	}

	.add-input::placeholder {
		color: var(--text-muted);
	}

	.phone-field {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.phone-prefix {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.phone-input {
		flex: 1;
	}

	.add-error {
		color: var(--error);
		font-size: 0.75rem;
		margin: 0;
	}

	.add-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
	}

	.btn-cancel {
		padding: var(--space-xs) var(--space-md);
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-add {
		padding: var(--space-xs) var(--space-lg);
		border: none;
		border-radius: var(--radius-full);
		background: var(--accent-primary);
		color: var(--bg-primary);
		font-size: 0.8125rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-add:active {
		transform: scale(0.97);
	}

	.btn-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

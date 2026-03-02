<script lang="ts">
	import type { GroupMember } from '$lib/types';

	const {
		placeholder = '',
		maxlength = 500,
		disabled = false,
		members = [],
		singleLine = false,
		maxRows = 0,
		onchange,
		onfocus,
		onsubmit
	}: {
		placeholder?: string;
		maxlength?: number;
		disabled?: boolean;
		members?: GroupMember[];
		singleLine?: boolean;
		maxRows?: number;
		onchange?: (text: string) => void;
		onfocus?: () => void;
		onsubmit?: () => void;
	} = $props();

	let text = $state('');
	let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let mirrorEl = $state<HTMLDivElement | null>(null);
	let showDropdown = $state(false);
	let filteredMembers = $state<GroupMember[]>([]);
	let selectedIndex = $state(0);
	let mentionStart = $state(-1);
	let isFocused = $state(false);

	interface Segment {
		type: 'text' | 'mention';
		value: string;
	}

	const memberUsernames = $derived(new Set(members.map((m) => m.username.toLowerCase())));

	const textSegments = $derived.by(() => {
		const result: Segment[] = [];
		const regex = /@(\w+)/g;
		let lastIndex = 0;
		let match;

		while ((match = regex.exec(text)) !== null) {
			const username = match[1].toLowerCase();
			const isMember = memberUsernames.has(username);
			if (match.index > lastIndex) {
				result.push({ type: 'text', value: text.slice(lastIndex, match.index) });
			}
			result.push({ type: isMember ? 'mention' : 'text', value: match[0] });
			lastIndex = regex.lastIndex;
		}

		if (lastIndex < text.length) {
			result.push({ type: 'text', value: text.slice(lastIndex) });
		}

		return result;
	});

	function handleInput() {
		onchange?.(text);
		checkForMention();
		syncScroll();
		if (maxRows > 0) autoResize();
	}

	function autoResize() {
		const el = inputEl as HTMLTextAreaElement | null;
		if (!el) return;
		el.style.height = 'auto';
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
		const maxHeight = lineHeight * maxRows;
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
	}

	function syncScroll() {
		if (mirrorEl && inputEl) {
			mirrorEl.scrollLeft = inputEl.scrollLeft;
			mirrorEl.scrollTop = inputEl.scrollTop;
		}
	}

	function checkForMention() {
		if (!inputEl) return;
		const pos = inputEl.selectionStart ?? 0;
		const before = text.slice(0, pos);
		const atMatch = before.match(/@(\w*)$/);

		if (atMatch) {
			mentionStart = pos - atMatch[0].length;
			const partial = atMatch[1].toLowerCase();
			filteredMembers = members
				.filter((m) => m.username.toLowerCase().startsWith(partial))
				.slice(0, 5);
			showDropdown = filteredMembers.length > 0;
			selectedIndex = 0;
		} else {
			showDropdown = false;
		}
	}

	function selectMember(member: GroupMember) {
		const pos = inputEl?.selectionStart ?? text.length;
		const before = text.slice(0, mentionStart);
		const after = text.slice(pos);
		text = `${before}@${member.username} ${after}`;
		showDropdown = false;
		onchange?.(text);
		requestAnimationFrame(() => {
			const newPos = mentionStart + member.username.length + 2;
			inputEl?.setSelectionRange(newPos, newPos);
			inputEl?.focus();
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showDropdown) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % filteredMembers.length;
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = (selectedIndex - 1 + filteredMembers.length) % filteredMembers.length;
			} else if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				selectMember(filteredMembers[selectedIndex]);
				return;
			} else if (e.key === 'Escape') {
				e.preventDefault();
				showDropdown = false;
				return;
			}
		}

		if (e.key === 'Enter' && !showDropdown && (singleLine || maxRows > 0)) {
			if (e.shiftKey && maxRows > 0) return; // Shift+Enter inserts newline in multi-line mode
			e.preventDefault();
			onsubmit?.();
		}
	}

	function handleClick() {
		checkForMention();
		syncScroll();
	}

	export function focus() {
		inputEl?.focus();
	}

	export function clear() {
		text = '';
		onchange?.('');
		if (maxRows > 0) {
			const el = inputEl as HTMLTextAreaElement | null;
			if (el) el.style.height = 'auto';
		}
	}

	export function getText(): string {
		return text;
	}
</script>

<div class="mention-input-wrap">
	{#if showDropdown}
		<div class="mention-dropdown">
			{#each filteredMembers as member, i (member.id)}
				<button
					class="mention-option"
					class:selected={i === selectedIndex}
					onmousedown={(e) => {
						e.preventDefault();
						selectMember(member);
					}}
				>
					<div class="mention-avatar">
						{#if member.avatarPath}
							<img src="/api/profile/avatar/{member.avatarPath}" alt="" />
						{:else}
							<span>{member.username.charAt(0).toUpperCase()}</span>
						{/if}
					</div>
					<span class="mention-username">@{member.username}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div class="input-container" class:focused={isFocused}>
		<div
			class="highlight-mirror"
			class:single-line={singleLine}
			bind:this={mirrorEl}
			aria-hidden="true"
		>
			{#each textSegments as seg, i (i)}{#if seg.type === 'mention'}<span class="mention-hl"
						>{seg.value}</span
					>{:else}{seg.value}{/if}{/each}
		</div>

		{#if singleLine}
			<input
				bind:this={inputEl}
				bind:value={text}
				type="text"
				autocomplete="off"
				class="overlay-input"
				{placeholder}
				{maxlength}
				{disabled}
				oninput={handleInput}
				onkeydown={handleKeydown}
				onclick={handleClick}
				onfocus={() => {
					isFocused = true;
					onfocus?.();
				}}
				onblur={() => (isFocused = false)}
				onscroll={syncScroll}
			/>
		{:else}
			<textarea
				bind:this={inputEl}
				bind:value={text}
				autocomplete="off"
				class="overlay-input"
				{placeholder}
				{maxlength}
				{disabled}
				rows={maxRows > 0 ? 1 : 2}
				oninput={handleInput}
				onkeydown={handleKeydown}
				onclick={handleClick}
				onfocus={() => {
					isFocused = true;
					onfocus?.();
				}}
				onblur={() => (isFocused = false)}
				onscroll={syncScroll}
			></textarea>
		{/if}
	</div>
</div>

<style>
	.mention-input-wrap {
		position: relative;
		width: 100%;
	}

	.input-container {
		position: relative;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		transition: border-color 0.2s ease;
	}

	.input-container.focused {
		border-color: var(--accent-primary);
	}

	.highlight-mirror {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		padding: var(--space-sm) var(--space-md);
		font-size: 0.9375rem;
		font-family: var(--font-body);
		color: var(--text-primary);
		pointer-events: none;
		overflow: hidden;
		z-index: 1;
	}

	.highlight-mirror.single-line {
		white-space: nowrap;
		display: flex;
		align-items: center;
	}

	.highlight-mirror:not(.single-line) {
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-wrap: break-word;
		line-height: 1.4;
	}

	.mention-hl {
		color: var(--accent-blue);
		font-weight: 700;
	}

	.overlay-input {
		position: relative;
		z-index: 2;
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		border: none;
		background: transparent;
		color: transparent;
		caret-color: var(--text-primary);
		font-size: 0.9375rem;
		font-family: var(--font-body);
		outline: none;
		box-sizing: border-box;
	}

	.overlay-input::placeholder {
		color: var(--text-muted);
	}

	.overlay-input::selection {
		background: rgba(74, 158, 255, 0.3);
	}

	textarea.overlay-input {
		resize: none;
		line-height: 1.4;
	}

	.mention-dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		margin-bottom: 4px;
		overflow: hidden;
		z-index: 20;
		box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
	}

	.mention-option {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: none;
		border: none;
		color: var(--text-primary);
		cursor: pointer;
		text-align: left;
		font-size: 0.875rem;
		transition: background 0.1s ease;
	}

	.mention-option.selected,
	.mention-option:hover {
		background: var(--bg-surface);
	}

	.mention-avatar {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-full);
		overflow: hidden;
		background: var(--accent-magenta);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--constant-white);
	}

	.mention-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.mention-username {
		font-weight: 500;
		color: var(--text-primary);
	}
</style>

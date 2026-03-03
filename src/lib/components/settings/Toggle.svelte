<script lang="ts">
	let {
		active = false,
		disabled = false,
		label = '',
		onclick
	}: {
		active?: boolean;
		disabled?: boolean;
		label?: string;
		onclick?: () => void;
	} = $props();
</script>

<button class="toggle" class:active {disabled} {onclick} aria-label={label}>
	<span class="toggle-thumb"></span>
</button>

<style>
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
		transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle.active .toggle-thumb {
		transform: translateX(18px);
	}
</style>

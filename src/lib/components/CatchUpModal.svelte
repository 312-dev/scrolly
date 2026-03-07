<script lang="ts">
	let {
		unwatchedCount,
		onchoice
	}: { unwatchedCount: number; onchoice: (choice: 'all' | 'best') => void } = $props();

	let visible = $state(false);

	$effect(() => {
		document.body.style.overflow = 'hidden';
		requestAnimationFrame(() => {
			visible = true;
		});
		return () => {
			document.body.style.overflow = '';
		};
	});

	function choose(choice: 'all' | 'best') {
		visible = false;
		setTimeout(() => onchoice(choice), 200);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') choose('all');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="overlay" class:visible role="presentation">
	<div
		class="dialog"
		class:visible
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="catchup-title"
		tabindex="-1"
	>
		<h3 id="catchup-title">Woah, there's been a lot shared since you last logged in!</h3>
		<p>You have <strong>{unwatchedCount}</strong> clips waiting. How do you want to catch up?</p>
		<div class="actions">
			<button class="btn-best" onclick={() => choose('best')}> Show me the best ones </button>
			<button class="btn-all" onclick={() => choose('all')}>
				I'll watch all {unwatchedCount}
			</button>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 400;
		opacity: 0;
		transition: opacity 0.2s ease;
		padding: var(--space-lg);
	}

	.overlay.visible {
		opacity: 1;
	}

	.dialog {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-xl);
		max-width: 340px;
		width: 100%;
		transform: scale(0.95);
		transition: transform 0.2s ease;
	}

	.dialog.visible {
		transform: scale(1);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 var(--space-sm);
		line-height: 1.3;
	}

	p {
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0 0 var(--space-xl);
	}

	p strong {
		color: var(--text-primary);
		font-weight: 700;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.actions button {
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.1s ease,
			opacity 0.2s ease;
		border: none;
	}

	.actions button:active {
		transform: scale(0.97);
	}

	.btn-best {
		background: var(--accent-primary);
		color: var(--bg-primary);
		font-weight: 700;
	}

	.btn-all {
		background: var(--bg-surface);
		color: var(--text-primary);
		border: 1px solid var(--border) !important;
	}
</style>

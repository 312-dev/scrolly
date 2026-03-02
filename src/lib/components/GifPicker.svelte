<script lang="ts">
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';

	interface GifResult {
		id: string;
		title: string;
		url: string;
		stillUrl: string;
		shareUrl: string;
		width: number;
		height: number;
	}

	const {
		onselect,
		onclose,
		autoFocus = false
	}: {
		onselect: (gif: GifResult) => void;
		onclose?: () => void;
		autoFocus?: boolean;
	} = $props();

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			searchInputEl?.blur();
			onclose?.();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			searchInputEl?.blur();
		}
	}

	let searchInputEl = $state<HTMLInputElement | null>(null);

	export function focusSearch() {
		searchInputEl?.focus();
	}

	let query = $state('');
	let gifs = $state<GifResult[]>([]);
	let loading = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let gridEl = $state<HTMLDivElement | null>(null);
	let colCount = $state(2);

	// Distribute GIFs across N columns by shortest-column-first
	let columns = $derived.by(() => {
		const cols: GifResult[][] = Array.from({ length: colCount }, () => []);
		const heights = new Array(colCount).fill(0);
		for (const gif of gifs) {
			const ratio = gif.height / gif.width;
			const shortest = heights.indexOf(Math.min(...heights));
			cols[shortest].push(gif);
			heights[shortest] += ratio;
		}
		return cols;
	});

	$effect(() => {
		loadGifs();
		if (autoFocus) {
			requestAnimationFrame(() => searchInputEl?.focus());
		}
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});

	$effect(() => {
		const q = query;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			loadGifs(q);
		}, 300);
	});

	// Observe grid width to set column count
	$effect(() => {
		if (!gridEl) return;
		const ro = new ResizeObserver((entries) => {
			const w = entries[0].contentRect.width;
			if (w >= 480) colCount = 3;
			else colCount = 2;
		});
		ro.observe(gridEl);
		return () => ro.disconnect();
	});

	// IntersectionObserver: auto-play visible GIFs, show stills for off-screen
	$effect(() => {
		if (!gridEl) return;
		// Track gifs so this effect re-runs when results change
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dependency
		gifs.length;

		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const img = entry.target as HTMLImageElement;
					const animatedUrl = img.dataset.animated;
					const stillUrl = img.dataset.still;
					if (!animatedUrl || !stillUrl) continue;
					img.src = entry.isIntersecting ? animatedUrl : stillUrl;
				}
			},
			{ root: gridEl, rootMargin: '100px 0px' }
		);

		// Delay observation until after Svelte renders new images
		const raf = requestAnimationFrame(() => {
			const imgs = gridEl!.querySelectorAll<HTMLImageElement>('img[data-animated]');
			imgs.forEach((img) => io.observe(img));
		});

		return () => {
			cancelAnimationFrame(raf);
			io.disconnect();
		};
	});

	async function loadGifs(q?: string) {
		loading = true;
		try {
			const searchParams = q?.trim() ? `q=${encodeURIComponent(q.trim())}&limit=30` : 'limit=30';
			const res = await fetch(`/api/gifs/search?${searchParams}`);
			if (res.ok) {
				const data = await res.json();
				gifs = data.gifs || [];
			}
		} catch {
			// Silently fail — GIF search is non-critical
		}
		loading = false;
	}
</script>

<div class="gif-picker">
	<div class="picker-header">
		<div class="search-field">
			<MagnifyingGlassIcon size={16} weight="bold" />
			<input
				bind:this={searchInputEl}
				type="text"
				bind:value={query}
				placeholder="Search GIPHY"
				inputmode="search"
				onkeydown={handleSearchKeydown}
			/>
		</div>
	</div>

	<div class="gif-grid" bind:this={gridEl}>
		{#if loading && gifs.length === 0}
			<div class="status-wrap">
				<p class="status">Loading...</p>
			</div>
		{:else if gifs.length === 0}
			<div class="status-wrap">
				<p class="status">No GIFs found</p>
			</div>
		{:else}
			{#each columns as col, i (i)}
				<div class="masonry-col">
					{#each col as gif (gif.id)}
						<button class="gif-item" onclick={() => onselect(gif)}>
							<img
								src={gif.stillUrl}
								data-animated={gif.url}
								data-still={gif.stillUrl}
								alt={gif.title}
								loading="lazy"
								style="aspect-ratio: {gif.width}/{gif.height}"
							/>
						</button>
					{/each}
				</div>
			{/each}
		{/if}
	</div>

	<div class="attribution">Powered by GIPHY</div>
</div>

<style>
	.gif-picker {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: var(--bg-elevated);
	}

	.picker-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		flex-shrink: 0;
	}

	.search-field {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		color: var(--text-muted);
		transition: border-color 0.2s ease;
	}
	.search-field:focus-within {
		border-color: var(--accent-primary);
	}
	.search-field input {
		flex: 1;
		background: none;
		border: none;
		color: var(--text-primary);
		font-size: 0.875rem;
		outline: none;
		padding: 0;
	}
	.search-field input::placeholder {
		color: var(--text-muted);
	}

	.gif-grid {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
		display: flex;
		align-items: flex-start;
		gap: 3px;
		padding: 0 var(--space-sm) var(--space-sm);
	}

	.status-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.status {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
		padding: var(--space-xl);
		margin: 0;
	}

	.masonry-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.gif-item {
		background: var(--bg-surface);
		border: none;
		border-radius: var(--radius-sm);
		overflow: hidden;
		cursor: pointer;
		padding: 0;
		transition: transform 0.1s ease;
		display: block;
		flex-shrink: 0;
	}
	.gif-item:active {
		transform: scale(0.97);
	}
	.gif-item img {
		width: 100%;
		height: auto;
		object-fit: cover;
		display: block;
	}

	.attribution {
		text-align: center;
		font-size: 0.625rem;
		color: var(--text-muted);
		padding: var(--space-xs);
		flex-shrink: 0;
	}
</style>

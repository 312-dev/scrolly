import { writable, derived } from 'svelte/store';

const _depth = writable(0);

export const anySheetOpen = derived(_depth, ($d) => $d > 0);

export function openSheet() {
	_depth.update((n) => n + 1);
}

export function closeSheet() {
	_depth.update((n) => Math.max(0, n - 1));
}

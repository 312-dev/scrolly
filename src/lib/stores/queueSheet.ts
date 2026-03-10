import { writable } from 'svelte/store';

export const queueSheetOpen = writable<boolean>(false);

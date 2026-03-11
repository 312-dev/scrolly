import { writable } from 'svelte/store';

export interface CloutChange {
	previousTier: string;
	newTier: string;
	previousTierName: string;
	newTierName: string;
	cooldownMinutes: number;
	burstSize: number;
}

export const cloutChange = writable<CloutChange | null>(null);

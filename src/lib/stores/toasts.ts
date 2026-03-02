import { writable } from 'svelte/store';

export type ToastType = 'processing' | 'success' | 'error' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	clipId?: string;
	contentType?: string;
	autoDismiss?: number;
	createdAt: number;
}

export const toasts = writable<Toast[]>([]);
export const clipReadySignal = writable<string | null>(null);
export const clipOverlaySignal = writable<string | null>(null);
export const openCommentsSignal = writable<string | null>(null);

let toastCounter = 0;

const DEFAULT_DISMISS: Record<ToastType, number> = {
	success: 3000,
	error: 4000,
	info: 3000,
	processing: 0
};

export function addToast(toast: Omit<Toast, 'id' | 'createdAt'>): string {
	const id = `toast-${++toastCounter}-${Date.now()}`;
	const autoDismiss = toast.autoDismiss ?? DEFAULT_DISMISS[toast.type];
	const newToast: Toast = { ...toast, id, autoDismiss, createdAt: Date.now() };
	toasts.update((t) => [...t, newToast]);
	return id;
}

export function removeToast(id: string): void {
	toasts.update((t) => t.filter((toast) => toast.id !== id));
}

export function replaceToast(id: string, updates: Partial<Toast>): void {
	toasts.update((t) => t.map((toast) => (toast.id === id ? { ...toast, ...updates } : toast)));
}

/** Convenience helpers */
export const toast = {
	success: (message: string, autoDismiss?: number) =>
		addToast({ type: 'success', message, autoDismiss }),
	error: (message: string, autoDismiss?: number) =>
		addToast({ type: 'error', message, autoDismiss }),
	info: (message: string, autoDismiss?: number) => addToast({ type: 'info', message, autoDismiss }),
	processing: (message: string, opts?: { clipId?: string; contentType?: string }) =>
		addToast({ type: 'processing', message, ...opts, autoDismiss: 0 })
};

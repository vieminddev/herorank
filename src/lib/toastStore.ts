import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export const toasts = writable<Toast[]>([]);

export function showToast(message: string, type: 'success' | 'error' = 'success') {
  const id = Math.random().toString(36).substring(2, 9);
  toasts.update((current) => [...current, { id, message, type }]);

  // Auto-remove toast after 3.2 seconds
  setTimeout(() => {
    toasts.update((current) => current.filter((t) => t.id !== id));
  }, 3200);
}

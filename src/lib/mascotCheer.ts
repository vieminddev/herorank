/**
 * Mascot cheer — fire a celebratory butterfly toast when the user hits a REAL win
 * (shop connected, SEO score crosses "Strong", listing saved, etc.). One shared mechanism so
 * the mascot acts as a cheerleader for genuine product moments, not just decoration.
 *
 * Usage:  import { cheer } from '$lib/mascotCheer';  cheer({ title: 'Strong SEO!', subtitle: '…' });
 * The <MascotCheer /> renderer (mounted once in the root layout) displays + auto-dismisses them.
 */
import { writable } from 'svelte/store';

export type Cheer = { id: number; title: string; subtitle?: string };

export const cheers = writable<Cheer[]>([]);

let nextId = 1;

export function cheer(c: { title: string; subtitle?: string }): void {
  if (typeof document === 'undefined') return; // client-only
  const id = nextId++;
  cheers.update((list) => [...list, { id, title: c.title, subtitle: c.subtitle }]);
}

export function dismissCheer(id: number): void {
  cheers.update((list) => list.filter((c) => c.id !== id));
}

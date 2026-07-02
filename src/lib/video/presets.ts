/**
 * Style presets — each tunes a Scene's pacing, transition, and Ken Burns to a named "look".
 *
 * A preset is a small descriptor the UI applies on top of the user's slides/aspect/brand choices:
 * it sets per-slide duration, the transition type/length, and a Ken Burns recipe (or none). "Custom"
 * leaves the manual controls in charge.
 */
import type { TransitionType, KenBurns, KenBurnsPan } from './scene';

export interface StylePreset {
  id: string;
  name: string;
  hint: string;
  secondsPerSlide: number;
  transition: TransitionType;
  transitionSeconds: number;
  /** undefined → no Ken Burns; otherwise the per-slide zoom recipe. */
  kenBurns?: { fromScale: number; toScale: number; pans: KenBurnsPan[] };
}

export const PRESETS: StylePreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    hint: 'Steady 3s slides with a gentle crossfade and subtle zoom — the safe Etsy default.',
    secondsPerSlide: 3,
    transition: 'fade',
    transitionSeconds: 0.6,
    kenBurns: { fromScale: 1, toScale: 1.08, pans: ['in', 'lr', 'rl'] },
  },
  {
    id: 'scroll-stopper',
    name: 'Scroll Stopper',
    hint: 'Fast 1.5s cuts with punchy zoom — built to stop the scroll on social.',
    secondsPerSlide: 1.5,
    transition: 'zoom',
    transitionSeconds: 0.3,
    kenBurns: { fromScale: 1.05, toScale: 1.15, pans: ['in', 'out'] },
  },
  {
    id: 'short-snappy',
    name: 'Short & Snappy',
    hint: 'Quick 2s slides, hard cuts, no fuss — keeps the whole video well under 15s.',
    secondsPerSlide: 2,
    transition: 'none',
    transitionSeconds: 0,
  },
  {
    id: 'cinematic',
    name: 'Smooth & Cinematic',
    hint: 'Long 4.5s slides, slow dissolves and a creeping zoom for a premium feel.',
    secondsPerSlide: 4.5,
    transition: 'dissolve',
    transitionSeconds: 1,
    kenBurns: { fromScale: 1, toScale: 1.12, pans: ['lr', 'rl', 'up', 'down'] },
  },
  {
    id: 'dynamic',
    name: 'Dynamic',
    hint: 'Energetic slides that push in from alternating sides with motion zoom.',
    secondsPerSlide: 2.5,
    transition: 'slide',
    transitionSeconds: 0.5,
    kenBurns: { fromScale: 1.06, toScale: 1.12, pans: ['lr', 'rl'] },
  },
  {
    id: 'minimal',
    name: 'Clean & Minimal',
    hint: 'Calm 3s slides, soft fades, zero zoom — lets the product speak.',
    secondsPerSlide: 3,
    transition: 'fade',
    transitionSeconds: 0.5,
  },
  {
    id: 'dreamy',
    name: 'Slow & Dreamy',
    hint: 'Lingering 5s slides with long dissolves and a slow drifting zoom.',
    secondsPerSlide: 5,
    transition: 'dissolve',
    transitionSeconds: 1.2,
    kenBurns: { fromScale: 1.04, toScale: 1.14, pans: ['up', 'down', 'lr'] },
  },
  {
    id: 'custom',
    name: 'Custom',
    hint: 'Set duration, transition and zoom yourself.',
    secondsPerSlide: 3,
    transition: 'fade',
    transitionSeconds: 0.6,
  },
];

export function getPreset(id: string): StylePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** Build a per-slide Ken Burns from a preset, cycling its pan list so adjacent slides differ. */
export function kenBurnsForSlide(preset: StylePreset, index: number): KenBurns | undefined {
  if (!preset.kenBurns) return undefined;
  const { fromScale, toScale, pans } = preset.kenBurns;
  return { fromScale, toScale, pan: pans[index % pans.length] };
}

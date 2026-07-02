/**
 * Scene — the single source of truth for the Video Maker, shared by BOTH the live preview player
 * and the exporter so that **what you see is what you export** (WYSIWYG).
 *
 * A `Scene` is plain, serialisable-ish data (it holds `Blob`s for image/logo/audio sources). The
 * compositor {@link drawFrameAt} turns a `Scene` + a time `t` into a rendered canvas frame. The
 * preview player and the MP4/WebM exporters both call `drawFrameAt`, so there is exactly one place
 * that decides what a frame looks like.
 *
 * Source blobs are decoded to `ImageBitmap`s once (see `bitmapCache.ts`) and passed into the
 * compositor as a `SceneAssets` bundle — `drawFrameAt` itself never decodes, so it stays a cheap,
 * synchronous, per-frame call.
 */

export type Aspect = '1:1' | '4:5' | '16:9' | '9:16';
export type TransitionType = 'fade' | 'slide' | 'zoom' | 'dissolve' | 'none';
/** 9-position grid: top/middle/bottom × left/center/right. */
export type Pos9 = 'tl' | 'tc' | 'tr' | 'ml' | 'c' | 'mr' | 'bl' | 'bc' | 'br';
export type KenBurnsPan = 'lr' | 'rl' | 'up' | 'down' | 'in' | 'out';

export interface KenBurns {
  fromScale: number;
  toScale: number;
  pan?: KenBurnsPan;
}

export interface Slide {
  /** Image source. */
  src: Blob;
  /** Seconds this slide is fully shown (excludes the transition overlap into the next slide). */
  durationSec: number;
  kenBurns?: KenBurns;
}

export interface SlideDirection {
  type: TransitionType;
  seconds: number;
  /** For `slide`: which way the new slide enters. Default 'left'. */
  dir?: 'left' | 'right' | 'up' | 'down';
}

export interface LogoOverlay {
  src: Blob;
  pos: Pos9;
  /** 0..1 */
  opacity: number;
  /** Fraction of the canvas WIDTH the logo should span. 0..1 (e.g. 0.2 = 20% wide). */
  scale: number;
}

export interface CaptionOverlay {
  text: string;
  pos: Pos9;
  /** A CSS font-family (one of the bundled families). */
  font: string;
  /** Fill color. */
  color: string;
  /** Optional pill background behind the text. */
  bg?: string;
  /** 'global' = on every slide; a number = only on that slide index. */
  scope: 'global' | number;
  /** Fade the caption in over the first ~0.4s of its slide. */
  animate?: boolean;
  /** Font size as a fraction of canvas height. Default ~0.06. */
  sizeRel?: number;
}

export interface Outro {
  /** Big line — usually a CTA ("Shop now", "Visit our store"). */
  text: string;
  shopName?: string;
  /** Background color of the end card. */
  bg: string;
  /** Text color. Default white. */
  color?: string;
  durationSec: number;
  /** Reuse the scene logo on the outro card. */
  showLogo?: boolean;
}

export interface AudioTrack {
  src: Blob;
  /** Gain in dB (negative = quieter). */
  gainDb: number;
  /** Fade in/out length in seconds. */
  fadeSec: number;
}

export interface Scene {
  slides: Slide[];
  transition: SlideDirection;
  aspect: Aspect;
  fps: number;
  /** Letterbox fill color used instead of black bars. */
  background: string;
  logo?: LogoOverlay;
  captions?: CaptionOverlay[];
  outro?: Outro;
  audio?: AudioTrack;
  /** Preset id this scene was derived from (UI bookkeeping). */
  preset: string;
}

/** Target pixel dimensions for an aspect ratio. Even numbers (H.264 requires even W/H). */
export function aspectDims(aspect: Aspect): { width: number; height: number } {
  switch (aspect) {
    case '4:5':
      return { width: 864, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
    default:
      return { width: 1080, height: 1080 };
  }
}

export const DEFAULT_FPS = 25;

// ---------------------------------------------------------------------------
// Timeline — maps `t` (seconds) to "which slide(s) and how far through"
// ---------------------------------------------------------------------------

export interface Timeline {
  /** Total slideshow seconds (slides + their overlapping transitions), EXCLUDING any outro. */
  slidesTotal: number;
  /** Total seconds including the outro. */
  total: number;
  /** Per-slide full-visible seconds, indexed alongside scene.slides. */
  durations: number[];
  /** Transition seconds between consecutive slides (0 when type === 'none'). */
  trans: number;
  outroSec: number;
}

export function buildTimeline(scene: Scene): Timeline {
  const durations = scene.slides.map((s) => Math.max(0.4, s.durationSec));
  const trans = scene.transition.type === 'none' ? 0 : Math.max(0.05, scene.transition.seconds);
  const count = durations.length;
  // Each slide shows for its duration; consecutive slides overlap by `trans`.
  const slidesTotal =
    durations.reduce((a, b) => a + b, 0) + Math.max(0, count - 1) * trans;
  const outroSec = scene.outro ? Math.max(0.5, scene.outro.durationSec) : 0;
  return { slidesTotal, total: slidesTotal + outroSec, durations, trans, outroSec };
}

/**
 * Resolve which slide is active at time `t` and the local progress within it.
 * Returns the active slide index, the time since that slide's START, and (when inside a
 * transition) the next index + a 0→1 transition factor.
 */
export interface FrameState {
  idx: number;
  localT: number;
  /** Seconds elapsed since this slide first appeared (for Ken Burns), >= 0. */
  slideElapsed: number;
  next: number | null;
  /** 0→1 across the transition; null when not transitioning. */
  transFactor: number | null;
}

export function resolveFrame(t: number, tl: Timeline): FrameState {
  const { durations, trans } = tl;
  const n = durations.length;
  if (n === 0) return { idx: 0, localT: 0, slideElapsed: 0, next: null, transFactor: null };

  // Non-overlapping segments: slide i is shown FULLY for `dur_i`, then (unless it is the last) a
  // crossfade into slide i+1 plays for `trans` more seconds. So segment i spans
  // `dur_i + (isLast ? 0 : trans)`, and slide i starts at the sum of all earlier segment widths.
  let start = 0;
  for (let i = 0; i < n; i++) {
    const hold = durations[i];
    const isLast = i === n - 1;
    const segWidth = hold + (isLast ? 0 : trans);
    const segEnd = start + segWidth;
    if (t < segEnd || isLast) {
      const localT = Math.max(0, t - start);
      // The crossfade into the next slide occupies the trailing `trans` seconds of this segment.
      if (!isLast && trans > 0 && localT > hold) {
        const f = (localT - hold) / trans;
        return {
          idx: i,
          localT,
          slideElapsed: localT,
          next: i + 1,
          transFactor: Math.min(1, Math.max(0, f)),
        };
      }
      return { idx: i, localT, slideElapsed: localT, next: null, transFactor: null };
    }
    start = segEnd;
  }
  return { idx: n - 1, localT: 0, slideElapsed: 0, next: null, transFactor: null };
}

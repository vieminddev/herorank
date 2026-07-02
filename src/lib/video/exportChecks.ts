/**
 * Smart export checks — validate a Scene against Etsy's listing-video guidance and offer one-click
 * fixes. Etsy recommends an H.264 MP4, 5–15 seconds, with the long edge at least 1080px. We surface
 * warnings (never hard-block) plus a `fix` the UI can apply to the Scene with a single click.
 */
import { type Scene, aspectDims, buildTimeline } from './scene';

export type FixId = 'trim-15' | 'pad-5' | 'switch-1-1' | 'switch-webm-note';

export interface ExportCheck {
  level: 'warn' | 'info';
  message: string;
  /** A fix label + id the UI can wire to a one-click handler. */
  fix?: { id: FixId; label: string };
}

export const ETSY_MIN_SEC = 5;
export const ETSY_MAX_SEC = 15;
export const HARD_MAX_SEC = 60;
export const MIN_LONG_EDGE = 1080;

export function runExportChecks(scene: Scene, mp4Supported: boolean): ExportCheck[] {
  const checks: ExportCheck[] = [];
  const tl = buildTimeline(scene);
  const { width, height } = aspectDims(scene.aspect);
  const longEdge = Math.max(width, height);

  if (tl.total > ETSY_MAX_SEC) {
    checks.push({
      level: 'warn',
      message: `Your video is ${tl.total.toFixed(1)}s. Etsy recommends 5–15s — longer videos get truncated in some placements.`,
      fix: { id: 'trim-15', label: 'Trim to 15s' },
    });
  } else if (tl.total < ETSY_MIN_SEC && scene.slides.length > 0) {
    checks.push({
      level: 'warn',
      message: `Your video is only ${tl.total.toFixed(1)}s. Etsy recommends at least 5s so buyers can take it in.`,
      fix: { id: 'pad-5', label: 'Stretch to 5s' },
    });
  }

  if (longEdge < MIN_LONG_EDGE) {
    checks.push({
      level: 'warn',
      message: `Resolution is below Etsy's recommended ${MIN_LONG_EDGE}px on the long edge.`,
      fix: { id: 'switch-1-1', label: 'Switch to 1:1 (1080px)' },
    });
  }

  if (!mp4Supported) {
    checks.push({
      level: 'info',
      message: 'This browser will export WebM, not MP4. Etsy prefers MP4 — use the latest Chrome or Edge for a guaranteed MP4 file.',
    });
  }

  if (scene.aspect !== '1:1' && scene.aspect !== '4:5') {
    checks.push({
      level: 'info',
      message: `Etsy displays product videos best at 1:1 (square). ${scene.aspect} is great for Instagram / TikTok reuse.`,
      fix: { id: 'switch-1-1', label: 'Switch to 1:1' },
    });
  }

  return checks;
}

/**
 * Apply a fix to a scene, returning a NEW scene (immutable update). `trim-15` proportionally
 * shortens slide durations so the whole video fits in 15s; `pad-5` lengthens to reach 5s.
 */
export function applyFix(scene: Scene, id: FixId): Scene {
  switch (id) {
    case 'switch-1-1':
      return { ...scene, aspect: '1:1' };
    case 'trim-15':
      return scaleDurations(scene, ETSY_MAX_SEC);
    case 'pad-5':
      return scaleDurations(scene, ETSY_MIN_SEC);
    default:
      return scene;
  }
}

/** Scale every slide's duration so the total (incl. transitions + outro) hits `targetSec`. */
function scaleDurations(scene: Scene, targetSec: number): Scene {
  const tl = buildTimeline(scene);
  // Solve for a uniform factor on the slide HOLD durations. total = sum(dur*k) + overlaps + outro.
  const overlaps = Math.max(0, scene.slides.length - 1) * tl.trans;
  const fixed = overlaps + tl.outroSec;
  const holdSum = tl.durations.reduce((a, b) => a + b, 0);
  if (holdSum <= 0) return scene;
  const k = Math.max(0.4 / (holdSum / scene.slides.length || 1), (targetSec - fixed) / holdSum);
  const slides = scene.slides.map((s) => ({ ...s, durationSec: Math.max(0.4, s.durationSec * k) }));
  return { ...scene, slides };
}

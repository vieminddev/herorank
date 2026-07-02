/**
 * Unit tests for the Video Maker's pure Scene logic — timeline math, frame resolution, presets,
 * and the smart export checks. These are browser-API-free (no canvas / WebCodecs), so they run in
 * plain vitest and lock in the behaviour the live preview + exporter share.
 */
import { describe, it, expect } from 'vitest';
import { buildTimeline, resolveFrame, aspectDims, type Scene } from '../src/lib/video/scene';
import { runExportChecks, applyFix, ETSY_MAX_SEC } from '../src/lib/video/exportChecks';
import { PRESETS, getPreset, kenBurnsForSlide } from '../src/lib/video/presets';

function makeScene(partial: Partial<Scene> = {}): Scene {
  const blob = new Blob(['x'], { type: 'image/png' });
  return {
    slides: [
      { src: blob, durationSec: 3 },
      { src: blob, durationSec: 3 },
      { src: blob, durationSec: 3 },
    ],
    transition: { type: 'fade', seconds: 0.6 },
    aspect: '1:1',
    fps: 25,
    background: '#000000',
    preset: 'classic',
    ...partial,
  };
}

describe('timeline', () => {
  it('sums slide durations minus nothing for hard cuts', () => {
    const tl = buildTimeline(makeScene({ transition: { type: 'none', seconds: 0 } }));
    expect(tl.total).toBeCloseTo(9, 5); // 3 + 3 + 3
    expect(tl.trans).toBe(0);
  });

  it('overlaps consecutive slides by the transition length', () => {
    const tl = buildTimeline(makeScene());
    // 3*3 + 2*0.6 = 10.2
    expect(tl.total).toBeCloseTo(10.2, 5);
  });

  it('includes the outro duration in the total', () => {
    const tl = buildTimeline(
      makeScene({ outro: { text: 'Shop', bg: '#000', durationSec: 2.5 }, transition: { type: 'none', seconds: 0 } })
    );
    expect(tl.slidesTotal).toBeCloseTo(9, 5);
    expect(tl.total).toBeCloseTo(11.5, 5);
  });
});

describe('resolveFrame', () => {
  it('returns the first slide at t=0', () => {
    const tl = buildTimeline(makeScene());
    const fs = resolveFrame(0, tl);
    expect(fs.idx).toBe(0);
    expect(fs.transFactor).toBeNull();
  });

  it('enters a transition near the end of a slide', () => {
    const tl = buildTimeline(makeScene());
    // slide 0 holds 3s fully, then crossfades into slide 1 over [3, 3.6) → t=3.3 is mid-transition.
    const fs = resolveFrame(3.3, tl);
    expect(fs.idx).toBe(0);
    expect(fs.next).toBe(1);
    expect(fs.transFactor).not.toBeNull();
    expect(fs.transFactor!).toBeGreaterThan(0);
    expect(fs.transFactor!).toBeLessThanOrEqual(1);
  });

  it('clamps to the last slide past the end', () => {
    const tl = buildTimeline(makeScene());
    const fs = resolveFrame(999, tl);
    expect(fs.idx).toBe(2);
  });
});

describe('aspectDims', () => {
  it('maps 9:16 to a vertical 1080x1920', () => {
    expect(aspectDims('9:16')).toEqual({ width: 1080, height: 1920 });
  });
  it('maps 16:9 to 1920x1080', () => {
    expect(aspectDims('16:9')).toEqual({ width: 1920, height: 1080 });
  });
});

describe('export checks', () => {
  it('warns + offers a trim when the video exceeds 15s', () => {
    const long = makeScene({
      slides: Array.from({ length: 6 }, () => ({ src: new Blob(['x']), durationSec: 4 })),
    });
    const checks = runExportChecks(long, true);
    const overLength = checks.find((c) => c.fix?.id === 'trim-15');
    expect(overLength).toBeDefined();
    expect(overLength!.level).toBe('warn');
  });

  it('trim-15 fix brings the total to ~15s', () => {
    const long = makeScene({
      slides: Array.from({ length: 6 }, () => ({ src: new Blob(['x']), durationSec: 4 })),
      transition: { type: 'none', seconds: 0 },
    });
    const fixed = applyFix(long, 'trim-15');
    expect(buildTimeline(fixed).total).toBeLessThanOrEqual(ETSY_MAX_SEC + 0.01);
  });

  it('switch-1-1 fix changes the aspect', () => {
    const fixed = applyFix(makeScene({ aspect: '16:9' }), 'switch-1-1');
    expect(fixed.aspect).toBe('1:1');
  });

  it('flags WebM-only browsers as info', () => {
    const checks = runExportChecks(makeScene(), false);
    expect(checks.some((c) => c.message.toLowerCase().includes('webm'))).toBe(true);
  });
});

describe('presets', () => {
  it('exposes 8 presets including Custom', () => {
    expect(PRESETS).toHaveLength(8);
    expect(PRESETS.some((p) => p.id === 'custom')).toBe(true);
  });

  it('cycles Ken Burns pans across slides for a preset that has them', () => {
    const cinematic = getPreset('cinematic');
    const kb0 = kenBurnsForSlide(cinematic, 0);
    const kb1 = kenBurnsForSlide(cinematic, 1);
    expect(kb0).toBeDefined();
    expect(kb0!.pan).not.toBe(kb1!.pan);
  });

  it('returns no Ken Burns for the minimal preset', () => {
    expect(kenBurnsForSlide(getPreset('minimal'), 0)).toBeUndefined();
  });
});

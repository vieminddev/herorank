/**
 * Predictive trend forecaster unit tests (pure fn, no D1/KV/network).
 *
 * Relative import (not $lib) keeps the suite independent of the alias resolver, matching the
 * other etsy/estimation suites.
 */
import { describe, it, expect } from 'vitest';
import { forecastTrend } from '../src/lib/server/services/etsy/forecast';

const WEEK = 7 * 86_400;
const T0 = 1_700_000_000;

/** Build a weekly-spaced series from a list of demand scores. */
function weekly(scores: number[]): { capturedAt: number; demandScore: number }[] {
  return scores.map((demandScore, i) => ({ capturedAt: T0 + i * WEEK, demandScore }));
}

describe('forecastTrend', () => {
  it("returns 'building' with null projection when <3 points", () => {
    expect(forecastTrend([])).toMatchObject({ signal: 'building', projectedIndex: null, basedOn: 0 });
    expect(forecastTrend(weekly([40, 50]))).toMatchObject({
      signal: 'building',
      projectedIndex: null,
      basedOn: 2,
    });
  });

  it("classifies a clean upward ramp as 'rising' with a positive slope", () => {
    const f = forecastTrend(weekly([30, 40, 50, 60, 70]));
    expect(f.signal).toBe('rising');
    expect(f.slopePerWeek).toBeGreaterThan(0);
    expect(f.projectedIndex).toBe(80); // next week past 70 at +10/wk
    expect(f.basedOn).toBe(5);
    expect(f.confidence).toBe('medium');
  });

  it("classifies a clean downward ramp as 'cooling' with a negative slope", () => {
    const f = forecastTrend(weekly([80, 70, 60, 50]));
    expect(f.signal).toBe('cooling');
    expect(f.slopePerWeek).toBeLessThan(0);
    expect(f.projectedIndex).toBe(40);
    expect(f.confidence).toBe('low'); // 4 points
  });

  it("treats a flat series as 'steady'", () => {
    const f = forecastTrend(weekly([50, 50, 51, 50, 49]));
    expect(f.signal).toBe('steady');
  });

  it('clamps the projected index into 0..100', () => {
    const high = forecastTrend(weekly([85, 90, 95, 100]));
    expect(high.projectedIndex).toBeLessThanOrEqual(100);
    expect(high.projectedIndex).toBeGreaterThanOrEqual(0);

    const low = forecastTrend(weekly([20, 14, 8, 2]));
    expect(low.projectedIndex).toBeGreaterThanOrEqual(0);
    expect(low.projectedIndex).toBeLessThanOrEqual(100);
  });

  it('flags a wildly scattered series as volatile', () => {
    const f = forecastTrend(weekly([10, 90, 15, 85, 20, 80]));
    expect(f.signal).toBe('volatile');
  });

  it('reports high confidence at 9+ points', () => {
    const f = forecastTrend(weekly([30, 33, 36, 39, 42, 45, 48, 51, 54]));
    expect(f.confidence).toBe('high');
    expect(f.basedOn).toBe(9);
  });
});

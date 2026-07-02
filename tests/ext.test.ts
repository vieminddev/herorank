/**
 * Browser-extension `/ext` route helpers.
 *
 * Focused on `estConversionPct` — the honest conversion ESTIMATE (monthly sales ÷ lifetime views)
 * surfaced by the extension's listing overlay. Pure function, no D1/KV/Etsy client needed.
 *
 * Relative import (not $lib) keeps the suite independent of the SvelteKit alias resolver,
 * matching tests/estimation.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { estConversionPct } from '../src/lib/server/api/routes/ext';

describe('estConversionPct (honest conversion estimate)', () => {
  it('formats monthly sales ÷ lifetime views as a 1-decimal percentage string', () => {
    // 12 sales / 540 views = 2.222… % → "2.2%"
    expect(estConversionPct(12, 540)).toBe('2.2%');
    expect(estConversionPct(25, 1000)).toBe('2.5%');
  });

  it('returns null when views is 0 (guards divide-by-zero)', () => {
    expect(estConversionPct(10, 0)).toBeNull();
  });

  it('returns null when views is negative or non-finite', () => {
    expect(estConversionPct(10, -5)).toBeNull();
    expect(estConversionPct(10, NaN)).toBeNull();
  });

  it('returns null when there is no sales signal', () => {
    expect(estConversionPct(0, 540)).toBeNull();
    expect(estConversionPct(NaN, 540)).toBeNull();
  });
});

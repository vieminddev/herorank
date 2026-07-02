/**
 * Real-traffic demand signal tests (Phase 4) — `aggregateViews` in demandScore + `aggViews`
 * round-tripping through the keyword history store.
 *
 * Covers:
 *   (a) demandScore uses REAL views when present → strictly higher than the faves-only blend
 *       for the same listing set (views dominates).
 *   (b) demandScore is UNCHANGED when aggregateViews is absent/undefined (backward compatible).
 *   (c) a snapshot round-trips aggViews through insert → series (and NULL for legacy rows).
 *
 * Relative imports (not $lib) keep the suite independent of the SvelteKit alias resolver,
 * matching tests/etsy.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { demandScore } from '../src/lib/server/services/estimation/index';
import { ESTIMATION_CONFIG } from '../src/lib/server/services/estimation/config';
import { createKeywordHistory } from '../src/lib/server/services/etsy/cache';
import type { D1Database } from '@cloudflare/workers-types';

// ---------------------------------------------------------------------------
// In-memory D1 fake — supports keywords_cache insert (with agg_views) + series SELECT.
// Pattern-matches the SQL the store issues rather than parsing it.
// ---------------------------------------------------------------------------
function makeD1() {
  const keywords: Array<{
    keyword: string;
    category_id: number | null;
    demand_score: number;
    result_count: number;
    competition: string;
    agg_views: number | null;
    captured_at: number;
  }> = [];
  let clock = Math.floor(Date.now() / 1000);

  function prepare(sql: string) {
    let args: unknown[] = [];
    const api = {
      bind(...a: unknown[]) {
        args = a;
        return api;
      },
      async first<T>(): Promise<T | null> {
        return null as unknown as T | null;
      },
      async run() {
        if (sql.startsWith('INSERT INTO keywords_cache')) {
          const [keyword, category_id, demand_score, result_count, competition, agg_views] =
            args as [string, number | null, number, number, string, number | null];
          keywords.push({
            keyword,
            category_id,
            demand_score,
            result_count,
            competition,
            agg_views,
            // monotonically increasing so series ordering is deterministic
            captured_at: clock++,
          });
        }
        return { success: true };
      },
      async all<T>() {
        if (sql.includes('FROM keywords_cache')) {
          const [keyword, limit] = args as [string, number];
          const rows = keywords
            .filter((r) => r.keyword === keyword)
            .sort((a, b) => b.captured_at - a.captured_at)
            .slice(0, limit)
            .map((r) => ({
              captured_at: r.captured_at,
              demand_score: r.demand_score,
              result_count: r.result_count,
              agg_views: r.agg_views,
            }));
          return { results: rows as unknown as T[] };
        }
        return { results: [] as T[] };
      },
    };
    return api;
  }

  const db = { prepare } as unknown as D1Database;
  return { db, keywords };
}

// ---------------------------------------------------------------------------
// (a) + (b) demandScore with / without real views
// ---------------------------------------------------------------------------
describe('demandScore — real views signal', () => {
  // Same underlying listing set: identical faves/velocity/resultCount.
  const baseInput = {
    resultCount: 5_000,
    aggregateReviewVelocity: 40,
    favoritesSignal: 1_200,
  };

  it('(a) scores HIGHER when real views are present than the faves-only blend', () => {
    const favesOnly = demandScore(baseInput);
    const withViews = demandScore({ ...baseInput, aggregateViews: 300_000 });
    expect(withViews.score).toBeGreaterThan(favesOnly.score);
  });

  it('(a) views dominates: large views lift the score toward saturation', () => {
    const saturatedViews = demandScore({ ...baseInput, aggregateViews: ESTIMATION_CONFIG.normScales.views });
    // views weight alone (0.5) at norm≈100 should push the score well above the faves-only result.
    expect(saturatedViews.score).toBeGreaterThanOrEqual(
      Math.round(ESTIMATION_CONFIG.demandWeights.views * 100)
    );
  });

  it('(b) is UNCHANGED when aggregateViews is absent (backward compatible)', () => {
    const noField = demandScore(baseInput);
    const explicitUndefined = demandScore({ ...baseInput, aggregateViews: undefined });
    // Recompute the original three-way blend by hand from config to pin exact equality.
    const { demandWeights, normScales } = ESTIMATION_CONFIG;
    const normLog = (x: number, scale: number) =>
      x <= 0 ? 0 : Math.min(100, (100 * Math.log10(1 + x)) / Math.log10(1 + scale));
    const expected = Math.round(
      demandWeights.velocity * normLog(baseInput.aggregateReviewVelocity, normScales.velocity) +
        demandWeights.faves * normLog(baseInput.favoritesSignal, normScales.faves) +
        demandWeights.resultCount * normLog(baseInput.resultCount, normScales.resultCount)
    );
    expect(noField.score).toBe(expected);
    expect(explicitUndefined.score).toBe(expected);
  });

  it('(b) zero/non-positive views falls back to the faves-only blend (no change)', () => {
    const noField = demandScore(baseInput).score;
    expect(demandScore({ ...baseInput, aggregateViews: 0 }).score).toBe(noField);
    expect(demandScore({ ...baseInput, aggregateViews: -5 }).score).toBe(noField);
  });

  it('stays within [0,100] and monotonic in views', () => {
    const low = demandScore({ ...baseInput, aggregateViews: 1_000 }).score;
    const high = demandScore({ ...baseInput, aggregateViews: 800_000 }).score;
    expect(high).toBeGreaterThanOrEqual(low);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// (c) aggViews round-trips through insert → series
// ---------------------------------------------------------------------------
describe('KeywordHistoryStore — aggViews round-trip', () => {
  it('persists aggViews on insert and returns it in series (oldest → newest)', async () => {
    const { db } = makeD1();
    const history = createKeywordHistory(db);

    await history.insert({
      keyword: 'name necklace',
      categoryId: 1199,
      demandScore: 40,
      resultCount: 5000,
      competition: 'medium',
      aggViews: 120_000,
    });
    await history.insert({
      keyword: 'name necklace',
      categoryId: 1199,
      demandScore: 55,
      resultCount: 5200,
      competition: 'medium',
      aggViews: 180_000,
    });

    const series = await history.series('name necklace');
    expect(series).toHaveLength(2);
    expect(series.map((p) => p.aggViews)).toEqual([120_000, 180_000]);
    expect(series[1].demandScore).toBe(55);
  });

  it('stores NULL aggViews when the snapshot omits it (back-compat legacy rows)', async () => {
    const { db, keywords } = makeD1();
    const history = createKeywordHistory(db);

    await history.insert({
      keyword: 'custom ring',
      categoryId: null,
      demandScore: 30,
      resultCount: 800,
      competition: 'low',
      // aggViews intentionally omitted
    });

    expect(keywords[0].agg_views).toBeNull();
    const series = await history.series('custom ring');
    expect(series[0].aggViews).toBeNull();
  });
});

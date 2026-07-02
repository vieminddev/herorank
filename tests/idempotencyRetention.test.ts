import { describe, it, expect } from 'vitest';
import { makeSqliteD1, makeFakeR2, gunzipToText } from './helpers/sqliteD1';
import { createKeywordHistory, type KeywordSnapshot } from '../src/lib/server/services/etsy/cache';
import { createShopPulse } from '../src/lib/server/services/etsy/shopPulse';
import { pruneTimeSeries, pruneAnalyses, RETENTION_DAYS } from '../src/lib/server/services/etsy/retention';

const WEEK_MS = 7 * 86_400 * 1000;
const DAY = 86_400;

function kwSnap(over: Partial<KeywordSnapshot> = {}): KeywordSnapshot {
  return { keyword: 'name necklace', categoryId: 1199, demandScore: 40, resultCount: 5000, competition: 'medium', ...over };
}

describe('idempotency — keywords_cache insertWeekly', () => {
  it('upserts (one row per keyword per ISO-week) on a same-week re-run', async () => {
    const { db, tables } = makeSqliteD1();
    const history = createKeywordHistory(db);
    const t = 1_800_000_000_000;

    await history.insertWeekly(kwSnap({ demandScore: 40, aggViews: 100_000 }), t);
    await history.insertWeekly(kwSnap({ demandScore: 55, aggViews: 180_000 }), t + 3_600_000); // +1h, same week

    expect(tables.keywords).toHaveLength(1); // NOT duplicated
    expect(tables.keywords[0].demand_score).toBe(55); // refreshed to the latest run's value
    expect(tables.keywords[0].agg_views).toBe(180_000);
  });

  it('keeps distinct rows across different weeks (the real time-series)', async () => {
    const { db } = makeSqliteD1();
    const history = createKeywordHistory(db);
    const t = 1_800_000_000_000;

    await history.insertWeekly(kwSnap({ demandScore: 40 }), t);
    await history.insertWeekly(kwSnap({ demandScore: 45 }), t + WEEK_MS);
    await history.insertWeekly(kwSnap({ demandScore: 50 }), t + 2 * WEEK_MS);

    const series = await history.series('name necklace');
    expect(series).toHaveLength(3);
    expect(series.map((p) => p.demandScore)).toEqual([40, 45, 50]); // oldest → newest
  });

  it('append insert() is unchanged — still adds rows (back-compat)', async () => {
    const { db, tables } = makeSqliteD1();
    const history = createKeywordHistory(db);
    await history.insert(kwSnap({ demandScore: 10 }));
    await history.insert(kwSnap({ demandScore: 20 }));
    expect(tables.keywords).toHaveLength(2); // append (week_bucket NULL → no conflict)
  });
});

describe('idempotency — shop_pulse insertDaily', () => {
  const DAY_MS = 86_400 * 1000;

  it('upserts one row per shop per DAY; distinct across days', async () => {
    const { db, tables } = makeSqliteD1();
    const pulse = createShopPulse(db);
    const t = 1_800_000_000_000; // 2027-01-15 08:00 UTC
    const base = { shopId: 501, categoryId: 1199, reviewCount: 100, activeListings: 40, numFavorers: 10, reviewAverage: 4.8 };

    await pulse.insertDaily({ ...base, soldCount: 1000 }, t);
    await pulse.insertDaily({ ...base, soldCount: 1005 }, t + 3_600_000); // +1h, SAME day → upsert
    expect(tables.shopPulse).toHaveLength(1);
    expect(tables.shopPulse[0].sold_count).toBe(1005);

    // The fix: a NEXT-DAY snapshot (still the same ISO-week) now makes a distinct row, so REAL
    // sales velocity accrues within ~1 day instead of waiting two ISO-weeks.
    await pulse.insertDaily({ ...base, soldCount: 1020 }, t + DAY_MS); // next day → new row
    await pulse.insertDaily({ ...base, soldCount: 1140 }, t + 6 * DAY_MS); // +6d → new row
    const series = await pulse.series(501);
    expect(series.map((r) => r.soldCount)).toEqual([1005, 1020, 1140]); // 3 distinct daily points
  });
});

describe('retention — pruneTimeSeries', () => {
  it('deletes rows older than each window, keeps recent ones', async () => {
    const { db, tables, seedRank, seedAnalysis } = makeSqliteD1();
    const history = createKeywordHistory(db);
    const pulse = createShopPulse(db);
    const now = 1_800_000_000; // seconds
    const nowMs = now * 1000;

    // keywords_cache: fresh (10d) + stale (older than window)
    await history.insertWeekly(kwSnap({ keyword: 'fresh-kw' }), (now - 10 * DAY) * 1000);
    await history.insertWeekly(kwSnap({ keyword: 'stale-kw' }), (now - (RETENTION_DAYS.keywords_cache + 5) * DAY) * 1000);
    // shop_pulse: fresh + stale
    await pulse.insertDaily({ shopId: 1, categoryId: null, soldCount: 1, reviewCount: 1, activeListings: 1, numFavorers: 1, reviewAverage: 5 }, (now - 10 * DAY) * 1000);
    await pulse.insertDaily({ shopId: 2, categoryId: null, soldCount: 1, reviewCount: 1, activeListings: 1, numFavorers: 1, reviewAverage: 5 }, (now - (RETENTION_DAYS.shop_pulse + 5) * DAY) * 1000);
    // rank_history: fresh (30d) + stale (older than 180d)
    seedRank({ listing_id: 1, captured_at: now - 30 * DAY });
    seedRank({ listing_id: 2, captured_at: now - (RETENTION_DAYS.rank_history + 10) * DAY });
    // analyses: fresh (100d) + stale (older than 365d window) — the previously-unbounded table
    seedAnalysis({ subject: 'fresh', created_at: now - 100 * DAY });
    seedAnalysis({ subject: 'stale', created_at: now - (RETENTION_DAYS.analyses + 20) * DAY });

    const pruned = await pruneTimeSeries(db, nowMs); // 3 market tables (now in vierank-history)
    const an = await pruneAnalyses(db, nowMs); // analyses (OLTP)

    expect(pruned).toEqual({ keywords: 1, shopPulse: 1, rankHistory: 1, archived: 0 });
    expect(an).toEqual({ analyses: 1, archived: 0 });
    expect(tables.keywords.map((r) => r.keyword)).toEqual(['fresh-kw']);
    expect(tables.shopPulse.map((r) => r.shop_id)).toEqual([1]);
    expect(tables.rankHistory.map((r) => r.listing_id)).toEqual([1]);
    expect(tables.analyses.map((r) => r.subject)).toEqual(['fresh']);
  });

  it('is a no-op when everything is within the windows', async () => {
    const { db, tables, seedRank } = makeSqliteD1();
    const now = 1_800_000_000;
    seedRank({ listing_id: 1, captured_at: now - 5 * DAY });
    const pruned = await pruneTimeSeries(db, now * 1000);
    expect(pruned.rankHistory).toBe(0);
    expect(tables.rankHistory).toHaveLength(1);
  });
});

describe('retention — R2 cold archive (archive-then-prune)', () => {
  it('archives pruned rows to R2 as NDJSON.gz, then deletes them from D1', async () => {
    const { db, tables, seedRank } = makeSqliteD1();
    const { bucket, objects } = makeFakeR2();
    const now = 1_800_000_000;
    const date = new Date(now * 1000).toISOString().slice(0, 10);

    // Two stale rank rows (older than 180d) + one fresh.
    seedRank({ listing_id: 11, keyword: 'mug', position: 3, captured_at: now - (RETENTION_DAYS.rank_history + 10) * DAY });
    seedRank({ listing_id: 12, keyword: 'mug', position: 7, captured_at: now - (RETENTION_DAYS.rank_history + 20) * DAY });
    seedRank({ listing_id: 13, keyword: 'mug', position: 1, captured_at: now - 5 * DAY });

    const pruned = await pruneTimeSeries(db, now * 1000, bucket);

    // Deleted the 2 stale rows from D1, kept the fresh one.
    expect(pruned.rankHistory).toBe(2);
    expect(pruned.archived).toBe(2);
    expect(tables.rankHistory.map((r) => r.listing_id)).toEqual([13]);

    // The archive object exists and round-trips back to the original rows.
    const key = `archive/rank_history/${date}.ndjson.gz`;
    expect(objects.has(key)).toBe(true);
    const text = await gunzipToText(objects.get(key)!);
    const lines = text.split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.listing_id).sort()).toEqual([11, 12]);
  });

  it('falls back to delete-only when no R2 bucket is provided (no archive object)', async () => {
    const { db, tables, seedRank } = makeSqliteD1();
    const now = 1_800_000_000;
    seedRank({ listing_id: 1, captured_at: now - (RETENTION_DAYS.rank_history + 10) * DAY });
    const pruned = await pruneTimeSeries(db, now * 1000); // no bucket
    expect(pruned.rankHistory).toBe(1);
    expect(pruned.archived).toBe(0);
    expect(tables.rankHistory).toHaveLength(0);
  });
});

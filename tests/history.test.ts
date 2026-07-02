/**
 * Tests for the unified history layer (vierank-history `metric_series`):
 *   - bucket math (pure)
 *   - review-timeline backfill (pagination + monthly bucketing + idempotency)
 *   - cron→series adapters (pure)
 *   - seriesRepo D1 behavior (idempotent upsert, ordered reads, latest, cross-entity leaderboard)
 */
import { describe, it, expect } from 'vitest';
import { bucketFor, bucketStart, bucketDays } from '../src/lib/server/services/history/buckets';
import {
  reviewsToMonthlyPoints,
  backfillShopReviews,
  REVIEW_BACKFILL_SOURCE,
} from '../src/lib/server/services/history/reviewBackfill';
import { shopSnapshotPoints, keywordTrendPoints } from '../src/lib/server/services/history/cronSeries';
import { blendVelocity } from '../src/lib/server/services/history/velocity';
import { runHistoryAccumulator } from '../src/lib/server/services/history/accumulator';
import type { SeriesPoint, SeriesRepo, UpsertPoint } from '../src/lib/server/repositories/seriesRepo';
import {
  createSeriesRepo,
  type SeriesRepo,
  type UpsertPoint,
  type MetricKey,
} from '../src/lib/server/repositories/seriesRepo';
import type { EtsyReview, EtsyReviewPage } from '../src/lib/server/services/etsy/types';

const DAY = 86_400;

// --- bucket math -----------------------------------------------------------
describe('buckets', () => {
  it('day/week buckets are floor(ts / span) and round-trip to their start', () => {
    const t = 1_800_001_234; // arbitrary
    expect(bucketFor(t, 'day')).toBe(Math.floor(t / DAY));
    expect(bucketFor(t, 'week')).toBe(Math.floor(t / (7 * DAY)));
    const db = bucketFor(t, 'day');
    expect(bucketStart(db, 'day')).toBe(db * DAY);
    expect(bucketStart(db, 'day')).toBeLessThanOrEqual(t);
    expect(bucketStart(db + 1, 'day')).toBeGreaterThan(t);
  });

  it('month bucket = year*12 + monthIndex and is stable within a calendar month', () => {
    const jan = Math.floor(Date.UTC(2026, 0, 3) / 1000);
    const janLate = Math.floor(Date.UTC(2026, 0, 28) / 1000);
    const feb = Math.floor(Date.UTC(2026, 1, 1) / 1000);
    expect(bucketFor(jan, 'month')).toBe(2026 * 12 + 0);
    expect(bucketFor(janLate, 'month')).toBe(bucketFor(jan, 'month')); // same month → same bucket
    expect(bucketFor(feb, 'month')).toBe(bucketFor(jan, 'month') + 1);
    expect(bucketStart(bucketFor(jan, 'month'), 'month')).toBe(Math.floor(Date.UTC(2026, 0, 1) / 1000));
  });

  it('bucketDays reflects calendar month length', () => {
    expect(bucketDays(0, 'day')).toBe(1);
    expect(bucketDays(0, 'week')).toBe(7);
    expect(bucketDays(2024 * 12 + 1, 'month')).toBe(29); // Feb 2024 (leap)
    expect(bucketDays(2026 * 12 + 1, 'month')).toBe(28); // Feb 2026
    expect(bucketDays(2026 * 12 + 0, 'month')).toBe(31); // Jan
  });
});

// --- review backfill -------------------------------------------------------
function review(tsSec: number, rating = 5): EtsyReview {
  return { created_timestamp: tsSec, rating };
}

describe('reviewsToMonthlyPoints', () => {
  it('buckets reviews by month, emitting count + avg rating per month', () => {
    const jan = Math.floor(Date.UTC(2026, 0, 10) / 1000);
    const jan2 = Math.floor(Date.UTC(2026, 0, 20) / 1000);
    const feb = Math.floor(Date.UTC(2026, 1, 5) / 1000);
    const points = reviewsToMonthlyPoints(77, [review(jan, 5), review(jan2, 3), review(feb, 4)]);

    const reviews = points.filter((p) => p.metric === 'reviews');
    const ratings = points.filter((p) => p.metric === 'review_rating');
    expect(reviews).toHaveLength(2); // Jan + Feb
    const janPt = reviews.find((p) => p.bucket === bucketFor(jan, 'month'))!;
    expect(janPt.value).toBe(2);
    expect(janPt.entityType).toBe('shop');
    expect(janPt.entityId).toBe('77');
    expect(janPt.granularity).toBe('month');
    expect(janPt.source).toBe(REVIEW_BACKFILL_SOURCE);
    const janRating = ratings.find((p) => p.bucket === bucketFor(jan, 'month'))!;
    expect(janRating.value).toBe(4); // (5+3)/2
  });

  it('skips reviews with a missing/invalid timestamp', () => {
    const ok = Math.floor(Date.UTC(2026, 0, 10) / 1000);
    const points = reviewsToMonthlyPoints(1, [review(ok), { created_timestamp: 0, rating: 5 }]);
    expect(points.filter((p) => p.metric === 'reviews')[0].value).toBe(1);
  });
});

/** In-memory SeriesRepo for backfill logic tests. */
function fakeSeriesRepo(): SeriesRepo & { points: UpsertPoint[] } {
  const points: UpsertPoint[] = [];
  const keyOf = (p: { entityType: string; entityId: string; metric: string; granularity: string; bucket: number }) =>
    `${p.entityType}|${p.entityId}|${p.metric}|${p.granularity}|${p.bucket}`;
  return {
    points,
    async upsert(p) {
      const i = points.findIndex((q) => keyOf(q) === keyOf(p));
      if (i >= 0) points[i] = p;
      else points.push(p);
    },
    async bulkUpsert(ps) {
      for (const p of ps) await this.upsert(p);
    },
    async series(key, q) {
      return points
        .filter(
          (p) =>
            p.entityType === key.entityType &&
            p.entityId === key.entityId &&
            p.metric === key.metric &&
            p.granularity === key.granularity &&
            (q?.sinceBucket == null || p.bucket >= q.sinceBucket)
        )
        .sort((a, b) => a.bucket - b.bucket)
        .slice(-(q?.limit ?? 52))
        .map((p) => ({ bucket: p.bucket, ts: p.ts, value: p.value, source: p.source, meta: p.meta ?? null }));
    },
    async latest(key) {
      const s = await this.series(key, { limit: 9999 });
      return s.length ? s[s.length - 1] : null;
    },
    async latestByMetric() {
      return new Map();
    },
    async shopsMissingReviewBackfill(limit) {
      const sold = new Set(
        points.filter((p) => p.entityType === 'shop' && p.metric === 'sold_count').map((p) => p.entityId)
      );
      const haveReviews = new Set(
        points
          .filter((p) => p.entityType === 'shop' && p.metric === 'reviews' && p.granularity === 'month')
          .map((p) => p.entityId)
      );
      const missing = [...sold].filter((id) => !haveReviews.has(id)).sort();
      return missing.slice(0, limit).map((id) => {
        const meta = points.find((p) => p.entityType === 'shop' && p.entityId === id && p.metric === 'sold_count')?.meta;
        let categoryId: number | null = null;
        if (meta) { try { categoryId = (JSON.parse(meta) as { categoryId?: number }).categoryId ?? null; } catch { /* */ } }
        return { shopId: Number(id), categoryId };
      });
    },
  };
}

function fakeReviewClient(total: number, pageSize = 100) {
  // total reviews, one per day going back from a fixed date, newest first.
  const base = Math.floor(Date.UTC(2026, 5, 1) / 1000);
  let calls = 0;
  return {
    calls: () => calls,
    async getReviewsByShop(_shopId: number, p?: { limit?: number; offset?: number }): Promise<EtsyReviewPage> {
      calls++;
      const limit = p?.limit ?? pageSize;
      const offset = p?.offset ?? 0;
      const results: EtsyReview[] = [];
      for (let i = offset; i < Math.min(offset + limit, total); i++) {
        results.push(review(base - i * DAY, 5));
      }
      return { count: total, results };
    },
  };
}

describe('backfillShopReviews', () => {
  it('paginates the full history and writes monthly series', async () => {
    const series = fakeSeriesRepo();
    const client = fakeReviewClient(250); // 3 pages of 100/100/50
    const res = await backfillShopReviews({ client, series }, 42);
    expect(res.skipped).toBe(false);
    expect(res.pagesFetched).toBe(3); // 100 + 100 + 50(short) → stop
    expect(res.reviewsSeen).toBe(250);
    expect(res.monthsCovered).toBeGreaterThan(0);
    // wrote reviews points for shop 42
    expect(series.points.some((p) => p.entityType === 'shop' && p.entityId === '42' && p.metric === 'reviews')).toBe(true);
  });

  it('respects maxPages so one shop cannot drain the quota', async () => {
    const series = fakeSeriesRepo();
    const client = fakeReviewClient(10_000);
    const res = await backfillShopReviews({ client, series }, 1, { maxPages: 2 });
    expect(res.pagesFetched).toBe(2);
    expect(client.calls()).toBe(2);
  });

  it('is idempotent — skips a shop that already has backfilled history', async () => {
    const series = fakeSeriesRepo();
    const client = fakeReviewClient(120);
    await backfillShopReviews({ client, series }, 7);
    const callsAfterFirst = client.calls();
    const res2 = await backfillShopReviews({ client, series }, 7);
    expect(res2.skipped).toBe(true);
    expect(client.calls()).toBe(callsAfterFirst); // no further Etsy calls
  });
});

// --- cron → series adapters ------------------------------------------------
describe('cronSeries adapters', () => {
  it('shopSnapshotPoints emits daily points and skips null counters', () => {
    const now = Math.floor(Date.UTC(2026, 2, 15, 4, 30) / 1000);
    const pts = shopSnapshotPoints(9, { soldCount: 1200, reviewCount: null, activeListings: 40, numFavorers: 5 }, now);
    const metrics = pts.map((p) => p.metric).sort();
    expect(metrics).toEqual(['active_listings', 'num_favorers', 'sold_count']); // review_count null → skipped
    expect(pts.every((p) => p.granularity === 'day' && p.entityType === 'shop' && p.entityId === '9')).toBe(true);
    expect(pts[0].bucket).toBe(bucketFor(now, 'day'));
  });

  it('keywordTrendPoints emits weekly demand + market points', () => {
    const now = Math.floor(Date.UTC(2026, 2, 15) / 1000);
    const pts = keywordTrendPoints('name necklace', { demandScore: 62, priceMedian: 2400, whitespace: 71 }, now);
    const byMetric = Object.fromEntries(pts.map((p) => [p.metric, p.value]));
    expect(byMetric.demand).toBe(62);
    expect(byMetric.price_median).toBe(2400);
    expect(byMetric.whitespace).toBe(71);
    expect(pts.every((p) => p.granularity === 'week' && p.entityType === 'keyword')).toBe(true);
  });
});

// --- blended velocity (read side) -----------------------------------------
describe('blendVelocity', () => {
  const sp = (bucket: number, ts: number, value: number): SeriesPoint => ({ bucket, ts, value, source: 'cron', meta: null });
  const days30 = () => 30;

  it('prefers live sold_count delta when ≥2 daily points (basis sold)', () => {
    // +700 sold over 28 days → 175/week.
    const sold = [sp(0, 0, 1000), sp(28, 28 * DAY, 1700)];
    const v = blendVelocity(sold, [], days30);
    expect(v.basis).toBe('sold');
    expect(v.perWeek).toBe(175);
    expect(v.confidence).toBe('medium'); // 28 days → 21≤d<56
  });

  it('falls back to monthly review cadence when sold history is thin (basis reviews)', () => {
    // 90 reviews over 3 months (~90 days) → 7/week. Capped at medium confidence.
    const reviews = [sp(100, 0, 30), sp(101, 0, 30), sp(102, 0, 30)];
    const v = blendVelocity([sp(5, 0, 10)], reviews, days30);
    expect(v.basis).toBe('reviews');
    expect(v.perWeek).toBe(7);
    expect(v.confidence).toBe('medium');
  });

  it('is "building" only when neither source is usable', () => {
    expect(blendVelocity([], [], days30)).toEqual({ perWeek: null, basis: 'building', confidence: 'building' });
    // single review month → low confidence proxy
    expect(blendVelocity([], [sp(100, 0, 4)], days30).confidence).toBe('low');
  });
});

// --- seriesRepo against an in-memory metric_series D1 ----------------------
/** Minimal fake D1 implementing exactly the SQL seriesRepo issues against metric_series. */
function fakeMetricSeriesD1() {
  const rows: Record<string, { entity_type: string; entity_id: string; metric: string; granularity: string; bucket: number; ts: number; value: number; source: string; meta: string | null }> = {};
  const keyOf = (et: string, ei: string, m: string, g: string, b: number) => `${et}|${ei}|${m}|${g}|${b}`;

  function prepare(sql: string) {
    let a: unknown[] = [];
    const api = {
      bind(...args: unknown[]) { a = args; return api; },
      async run() {
        if (sql.startsWith('INSERT INTO metric_series')) {
          const [entity_type, entity_id, metric, granularity, bucket, ts, value, source, meta] = a as never[];
          rows[keyOf(entity_type, entity_id, metric, granularity, bucket as number)] = {
            entity_type, entity_id, metric, granularity, bucket: bucket as number, ts: ts as number,
            value: value as number, source, meta: (meta ?? null) as string | null,
          };
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
      async first<T>(): Promise<T | null> {
        // latest(): WHERE entity_type/entity_id/metric/granularity ORDER BY bucket DESC LIMIT 1
        const [et, ei, m, g] = a as [string, string, string, string];
        const matches = Object.values(rows).filter((r) => r.entity_type === et && r.entity_id === ei && r.metric === m && r.granularity === g);
        if (!matches.length) return null;
        const r = matches.sort((x, y) => y.bucket - x.bucket)[0];
        return { bucket: r.bucket, ts: r.ts, value: r.value, source: r.source, meta: r.meta } as T;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes('NOT EXISTS')) {
          // shopsMissingReviewBackfill: shop ids with sold_count(day) but no reviews(month).
          const all = Object.values(rows);
          const haveReviews = new Set(all.filter((r) => r.metric === 'reviews' && r.granularity === 'month').map((r) => r.entity_id));
          const sold = all.filter((r) => r.entity_type === 'shop' && r.metric === 'sold_count' && r.granularity === 'day');
          const byId = new Map<string, string | null>();
          for (const r of sold) if (!haveReviews.has(r.entity_id)) byId.set(r.entity_id, r.meta);
          const limit = a[0] as number;
          return { results: [...byId.entries()].sort().slice(0, limit).map(([entity_id, meta]) => ({ entity_id, meta })) as T[] };
        }
        if (sql.includes('JOIN')) {
          // latestByMetric: binds [et, m, g, (...ids), et, m, g, (...ids)]
          const [et, m, g] = a as [string, string, string];
          const matches = Object.values(rows).filter((r) => r.entity_type === et && r.metric === m && r.granularity === g);
          const latestByEntity = new Map<string, typeof matches[number]>();
          for (const r of matches) {
            const cur = latestByEntity.get(r.entity_id);
            if (!cur || r.bucket > cur.bucket) latestByEntity.set(r.entity_id, r);
          }
          return { results: [...latestByEntity.values()].map((r) => ({ entity_id: r.entity_id, bucket: r.bucket, ts: r.ts, value: r.value, source: r.source, meta: r.meta })) as T[] };
        }
        // series(): WHERE et/ei/m/g [AND bucket>=?] ORDER BY bucket DESC LIMIT ?
        const [et, ei, m, g] = a as [string, string, string, string];
        const hasSince = sql.includes('bucket >=');
        const since = hasSince ? (a[4] as number) : -Infinity;
        const limit = a[a.length - 1] as number;
        const matches = Object.values(rows)
          .filter((r) => r.entity_type === et && r.entity_id === ei && r.metric === m && r.granularity === g && r.bucket >= since)
          .sort((x, y) => y.bucket - x.bucket)
          .slice(0, limit)
          .map((r) => ({ bucket: r.bucket, ts: r.ts, value: r.value, source: r.source, meta: r.meta }));
        return { results: matches as T[] };
      },
    };
    return api;
  }
  const db = {
    prepare,
    async batch(stmts: { run: () => Promise<unknown> }[]) { for (const s of stmts) await s.run(); return []; },
  } as unknown as import('@cloudflare/workers-types').D1Database;
  return { db, rows };
}

describe('seriesRepo', () => {
  const key: MetricKey = { entityType: 'shop', entityId: '5', metric: 'sold_count', granularity: 'day' };
  const pt = (bucket: number, value: number): UpsertPoint => ({ ...key, bucket, ts: bucket * DAY, value, source: 'cron' });

  it('upsert is idempotent per (entity, metric, granularity, bucket)', async () => {
    const { db, rows } = fakeMetricSeriesD1();
    const repo = createSeriesRepo(db);
    await repo.upsert(pt(100, 10));
    await repo.upsert(pt(100, 17)); // same bucket → overwrite, not duplicate
    expect(Object.keys(rows)).toHaveLength(1);
    expect((await repo.latest(key))!.value).toBe(17);
  });

  it('series returns oldest→newest and honors limit', async () => {
    const { db } = fakeMetricSeriesD1();
    const repo = createSeriesRepo(db);
    await repo.bulkUpsert([pt(1, 1), pt(3, 3), pt(2, 2)]);
    const all = await repo.series(key);
    expect(all.map((p) => p.value)).toEqual([1, 2, 3]);
    const last2 = await repo.series(key, { limit: 2 });
    expect(last2.map((p) => p.value)).toEqual([2, 3]); // most-recent 2, returned ascending
  });

  it('latestByMetric returns the most-recent point per entity', async () => {
    const { db } = fakeMetricSeriesD1();
    const repo = createSeriesRepo(db);
    await repo.bulkUpsert([
      { entityType: 'shop', entityId: 'a', metric: 'sold_per_week', granularity: 'week', bucket: 10, ts: 0, value: 5, source: 'cron' },
      { entityType: 'shop', entityId: 'a', metric: 'sold_per_week', granularity: 'week', bucket: 11, ts: 0, value: 8, source: 'cron' },
      { entityType: 'shop', entityId: 'b', metric: 'sold_per_week', granularity: 'week', bucket: 9, ts: 0, value: 3, source: 'cron' },
    ]);
    const map = await repo.latestByMetric({ entityType: 'shop', metric: 'sold_per_week', granularity: 'week' });
    expect(map.get('a')!.value).toBe(8); // latest bucket for a
    expect(map.get('b')!.value).toBe(3);
  });

  it('shopsMissingReviewBackfill returns shops with sold_count but no reviews-month, with category', async () => {
    const { db } = fakeMetricSeriesD1();
    const repo = createSeriesRepo(db);
    const sold = (id: string, cat: number): UpsertPoint => ({ entityType: 'shop', entityId: id, metric: 'sold_count', granularity: 'day', bucket: 1, ts: 0, value: 1, source: 'cron', meta: JSON.stringify({ categoryId: cat }) });
    const reviews = (id: string): UpsertPoint => ({ entityType: 'shop', entityId: id, metric: 'reviews', granularity: 'month', bucket: 1, ts: 0, value: 1, source: 'review-backfill' });
    await repo.bulkUpsert([sold('10', 1199), sold('20', 1200), reviews('20')]); // 20 already backfilled
    const missing = await repo.shopsMissingReviewBackfill(10);
    expect(missing).toEqual([{ shopId: 10, categoryId: 1199 }]);
  });
});

// --- history accumulator (budget gate) ------------------------------------
describe('runHistoryAccumulator', () => {
  function seedShops(series: SeriesRepo & { points: UpsertPoint[] }, n: number) {
    for (let i = 1; i <= n; i++) {
      series.points.push({ entityType: 'shop', entityId: String(i), metric: 'sold_count', granularity: 'day', bucket: 1, ts: 0, value: 100, source: 'cron', meta: JSON.stringify({ categoryId: 1199 }) });
    }
  }

  it('spends only up to (dailyTarget - usedToday), never exceeding the target', async () => {
    const series = fakeSeriesRepo();
    seedShops(series, 50);
    const client = fakeReviewClient(500); // each shop → 5 pages (5 calls) until short page
    // usedToday already at 11900 of 12000 → budget 100; only ~ a couple shops backfill.
    const res = await runHistoryAccumulator(
      { client, series, usedToday: async () => 11_900 },
      { dailyTarget: 12_000, perTickCalls: 250, maxPagesPerShop: 5 }
    );
    expect(res.budget).toBe(100); // 12000 - 11900
    expect(res.callsSpent).toBeGreaterThan(0);
    expect(res.usedBefore + res.callsSpent).toBeLessThanOrEqual(12_000 + 5); // within one shop's page slack
  });

  it('does nothing when the daily target is already met', async () => {
    const series = fakeSeriesRepo();
    seedShops(series, 10);
    const res = await runHistoryAccumulator(
      { client: fakeReviewClient(100), series, usedToday: async () => 12_000 },
      { dailyTarget: 12_000 }
    );
    expect(res.budget).toBe(0);
    expect(res.callsSpent).toBe(0);
  });

  it('reports queueEmpty when no shops need backfill', async () => {
    const series = fakeSeriesRepo(); // no shops seeded
    const res = await runHistoryAccumulator(
      { client: fakeReviewClient(100), series, usedToday: async () => 0 },
      { dailyTarget: 12_000, perTickCalls: 250 }
    );
    expect(res.queueEmpty).toBe(true);
    expect(res.shopsBackfilled).toBe(0);
  });
});

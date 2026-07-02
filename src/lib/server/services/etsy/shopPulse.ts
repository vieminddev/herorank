/**
 * Shop pulse store (cron data-strategy report, Nhịp B) — REAL sales velocity from public data.
 *
 * Each DAILY snapshot records a shop's PUBLIC counters (transaction_sold_count, review_count,
 * listing_active_count, num_favorers, review_average) into `shop_pulse`. The day-over-day delta of
 * `sold_count` (normalised to a weekly rate by `shopVelocity`) is REAL sales velocity — no
 * estimation. Also feeds public review-rate calibration (review_count / sold_count) so we can
 * calibrate without OAuth-connected shops.
 *
 * Granularity (changed 2026-06-23): snapshots bucket by UTC-DAY, not ISO-week. The research cron
 * runs daily, so daily buckets give a 2nd snapshot after ~1 day → REAL velocity (and a differentiated
 * "Selling Now") appears within days instead of waiting two ISO-weeks. The `week_bucket` COLUMN is
 * reused to hold the day index (the (shop_id, week_bucket) unique key = one row per shop per day);
 * the name is legacy. `shopVelocity` already normalises any span to a per-week rate, so the velocity
 * math is unchanged.
 *
 * Pure-ish: D1 I/O only. `shopVelocity` is a PURE function over a series so it is unit-testable.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface ShopPulseSnapshot {
  shopId: number;
  categoryId: number | null;
  soldCount: number | null; // transaction_sold_count (lifetime, REAL)
  reviewCount: number | null;
  activeListings: number | null;
  numFavorers: number | null;
  reviewAverage: number | null;
}

export interface ShopPulsePoint {
  capturedAt: number; // epoch seconds
  soldCount: number | null;
  reviewCount: number | null;
  activeListings: number | null;
  numFavorers: number | null;
}

export interface ShopVelocity {
  /** REAL sales/week from the sold_count slope, or null when <2 usable points. */
  soldPerWeek: number | null;
  /** Reviews/week (corroborating signal). */
  reviewPerWeek: number | null;
  /** Span of history the velocity is based on, in days. */
  basedOnDays: number;
  confidence: 'building' | 'low' | 'medium' | 'high';
}

const WEEK = 7 * 86_400;

/**
 * REAL sales velocity from a chronological shop_pulse series. Uses the first/last usable points
 * (lifetime counters are monotonic, so endpoint-delta over elapsed weeks is the cleanest rate).
 * <2 points with sold_count → 'building' (honest: not enough history). Confidence scales with span.
 */
export function shopVelocity(points: ShopPulsePoint[]): ShopVelocity {
  const sorted = [...points].sort((a, b) => a.capturedAt - b.capturedAt);
  const withSold = sorted.filter((p) => p.soldCount != null);

  if (withSold.length < 2) {
    return { soldPerWeek: null, reviewPerWeek: null, basedOnDays: 0, confidence: 'building' };
  }

  const first = withSold[0];
  const last = withSold[withSold.length - 1];
  const elapsedSec = Math.max(1, last.capturedAt - first.capturedAt);
  const weeks = elapsedSec / WEEK;
  const basedOnDays = Math.round(elapsedSec / 86_400);

  const soldDelta = (last.soldCount as number) - (first.soldCount as number);
  // Counters only go up; clamp tiny negatives (data hiccups) to 0.
  const soldPerWeek = weeks > 0 ? Math.max(0, Math.round(soldDelta / weeks)) : null;

  const reviewPts = sorted.filter((p) => p.reviewCount != null);
  let reviewPerWeek: number | null = null;
  if (reviewPts.length >= 2) {
    const rd = (reviewPts[reviewPts.length - 1].reviewCount as number) - (reviewPts[0].reviewCount as number);
    const rw = Math.max(1, reviewPts[reviewPts.length - 1].capturedAt - reviewPts[0].capturedAt) / WEEK;
    reviewPerWeek = Math.max(0, Math.round(rd / rw));
  }

  const confidence: ShopVelocity['confidence'] =
    basedOnDays >= 56 ? 'high' : basedOnDays >= 21 ? 'medium' : 'low';

  return { soldPerWeek, reviewPerWeek, basedOnDays, confidence };
}

export interface ShopPulseStore {
  /** Append a snapshot (no dedup — used by tests / ad-hoc callers). */
  insert(snap: ShopPulseSnapshot): Promise<void>;
  /**
   * IDEMPOTENT daily upsert (the cron primitive): exactly one row per (shop, UTC-day). A re-run on
   * the same day UPDATES that day's row instead of duplicating — so a retried/double-fired daily cron
   * can't corrupt the sales-velocity delta. `nowMs` injectable for tests.
   */
  insertDaily(snap: ShopPulseSnapshot, nowMs?: number): Promise<void>;
  /** Snapshots for a shop, oldest → newest, capped at `limit` most-recent (default 26). */
  series(shopId: number, limit?: number): Promise<ShopPulsePoint[]>;
}

interface ShopPulseRow {
  captured_at: number;
  sold_count: number | null;
  review_count: number | null;
  active_listings: number | null;
  num_favorers: number | null;
}

export function createShopPulse(db: D1Database): ShopPulseStore {
  return {
    async insert(snap: ShopPulseSnapshot): Promise<void> {
      await db
        .prepare(
          'INSERT INTO shop_pulse (shop_id, category_id, sold_count, review_count, active_listings, num_favorers, review_average) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          snap.shopId,
          snap.categoryId,
          snap.soldCount,
          snap.reviewCount,
          snap.activeListings,
          snap.numFavorers,
          snap.reviewAverage
        )
        .run();
    },

    async insertDaily(snap: ShopPulseSnapshot, nowMs = Date.now()): Promise<void> {
      const nowSec = Math.floor(nowMs / 1000);
      // UTC-day index. Stored in the legacy `week_bucket` column → one row per (shop, day).
      const dayBucket = Math.floor(nowSec / 86_400);
      await db
        .prepare(
          'INSERT INTO shop_pulse (shop_id, category_id, sold_count, review_count, active_listings, ' +
            'num_favorers, review_average, week_bucket, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT(shop_id, week_bucket) DO UPDATE SET ' +
            'category_id=excluded.category_id, sold_count=excluded.sold_count, ' +
            'review_count=excluded.review_count, active_listings=excluded.active_listings, ' +
            'num_favorers=excluded.num_favorers, review_average=excluded.review_average, ' +
            'captured_at=excluded.captured_at'
        )
        .bind(
          snap.shopId,
          snap.categoryId,
          snap.soldCount,
          snap.reviewCount,
          snap.activeListings,
          snap.numFavorers,
          snap.reviewAverage,
          dayBucket,
          nowSec
        )
        .run();
    },

    async series(shopId, limit = 26): Promise<ShopPulsePoint[]> {
      const { results } = await db
        .prepare(
          'SELECT captured_at, sold_count, review_count, active_listings, num_favorers ' +
            'FROM shop_pulse WHERE shop_id = ? ORDER BY captured_at DESC LIMIT ?'
        )
        .bind(shopId, Math.max(1, Math.floor(limit)))
        .all<ShopPulseRow>();
      return (results ?? [])
        .map((r) => ({
          capturedAt: r.captured_at,
          soldCount: r.sold_count,
          reviewCount: r.review_count,
          activeListings: r.active_listings,
          numFavorers: r.num_favorers,
        }))
        .sort((a, b) => a.capturedAt - b.capturedAt);
    },
  };
}

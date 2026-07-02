/**
 * Sales-velocity from the unified `metric_series` — the read side that makes the review backfill pay
 * off. Best Sellers / Selling Now want a sold/week figure; with only days of live `sold_count` they
 * are stuck at "building". This blends two sources so velocity is meaningful from day one:
 *
 *   1. LIVE — Δ of daily `sold_count` over its span (the authoritative absolute rate). Used whenever
 *      ≥2 daily points exist. confidence scales with the span (same thresholds as the old shopVelocity).
 *   2. PROXY — recent monthly `reviews` cadence (from the backfill) → reviews/week. Reviews under-count
 *      and lag sales, so this is labelled `basis: 'reviews'` and capped at 'medium' confidence; it
 *      exists to RANK and trend shops before live history accrues, not to claim an absolute count.
 *
 * The blend (`blendVelocity`) is PURE + unit-tested; `readShopVelocity` just fetches the two series.
 */
import type { SeriesRepo, SeriesPoint } from '../../repositories/seriesRepo';

const WEEK_DAYS = 7;

export interface SeriesVelocity {
  /** sold/week (live delta) or reviews/week (proxy), or null when nothing usable. */
  perWeek: number | null;
  basis: 'sold' | 'reviews' | 'building';
  confidence: 'building' | 'low' | 'medium' | 'high';
}

/**
 * Blend live sold_count daily points with backfilled monthly review counts (PURE).
 * `soldDaily` and `reviewsMonthly` are oldest→newest. `bucketDaysFor(bucket)` maps a month bucket to
 * its day-length (injected so this stays pure / no calendar dependency leaks in).
 */
export function blendVelocity(
  soldDaily: SeriesPoint[],
  reviewsMonthly: SeriesPoint[],
  bucketDaysFor: (bucket: number) => number
): SeriesVelocity {
  // 1. Live sold_count delta (monotonic lifetime counter → endpoint delta over elapsed weeks).
  if (soldDaily.length >= 2) {
    const first = soldDaily[0];
    const last = soldDaily[soldDaily.length - 1];
    const days = Math.max(1, (last.ts - first.ts) / 86_400);
    const perWeek = Math.max(0, Math.round(((last.value - first.value) / days) * WEEK_DAYS));
    const confidence = days >= 56 ? 'high' : days >= 21 ? 'medium' : 'low';
    return { perWeek, basis: 'sold', confidence };
  }

  // 2. Proxy from backfilled monthly reviews — average over the most recent up-to-3 complete months.
  if (reviewsMonthly.length >= 1) {
    const recent = reviewsMonthly.slice(-3);
    const reviews = recent.reduce((a, p) => a + p.value, 0);
    const days = recent.reduce((a, p) => a + bucketDaysFor(p.bucket), 0);
    const perWeek = days > 0 ? Math.max(0, Math.round((reviews / days) * WEEK_DAYS)) : null;
    // Honest cap: review proxy never claims better than 'medium', and needs ≥2 months for that.
    const confidence = reviewsMonthly.length >= 2 ? 'medium' : 'low';
    return { perWeek, basis: 'reviews', confidence };
  }

  return { perWeek: null, basis: 'building', confidence: 'building' };
}

/** Fetch the two series for a shop and blend them. */
export async function readShopVelocity(
  series: SeriesRepo,
  shopId: number,
  bucketDaysFor: (bucket: number) => number
): Promise<SeriesVelocity> {
  const entityId = String(shopId);
  const [soldDaily, reviewsMonthly] = await Promise.all([
    series.series({ entityType: 'shop', entityId, metric: 'sold_count', granularity: 'day' }, { limit: 60 }),
    series.series({ entityType: 'shop', entityId, metric: 'reviews', granularity: 'month' }, { limit: 13 }),
  ]);
  return blendVelocity(soldDaily, reviewsMonthly, bucketDaysFor);
}

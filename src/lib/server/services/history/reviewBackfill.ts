/**
 * Review-timeline backfill — reconstruct a shop's HISTORICAL sales cadence from its public reviews.
 *
 * Why this exists: `metric_series` only has data as deep as the cron has been running (days). But
 * every Etsy review carries a `created_timestamp` going back years, and a review is a proxy for a
 * completed sale. So paginating a shop's full public review history and bucketing it by month yields
 * an instant multi-year `reviews`/month series — turning Best Sellers / Selling Now from "building"
 * (needs 2 live snapshots) into real history on the first sight of a shop. No OAuth needed; works for
 * competitors too.
 *
 * Honest about what it is: reviews UNDER-count sales (only a fraction of buyers review) and lag them,
 * so the value is the trend SHAPE and relative ranking, not an absolute sales count. Downstream
 * readers label it accordingly (source = 'review-backfill'). The live `sold_count` delta from
 * shop_pulse remains the authoritative absolute velocity once enough live snapshots accrue.
 *
 * The bucketing core (`reviewsToMonthlyPoints`) is PURE and unit-tested; the orchestrator only adds
 * pagination + persistence.
 */
import type { EtsyClient, EtsyReview } from '../etsy/types';
import type { SeriesRepo, UpsertPoint } from '../../repositories/seriesRepo';
import { bucketFor, bucketStart } from './buckets';

export const REVIEW_BACKFILL_SOURCE = 'review-backfill';

/**
 * Bucket raw reviews into monthly `metric_series` points (PURE).
 *
 * Emits, per calendar month the shop has reviews:
 *   - metric `reviews`        → count of reviews that month (the cadence signal)
 *   - metric `review_rating`  → average star rating that month (quality-over-time, free to compute)
 *
 * Reviews are NOT deduped here: Etsy replicates a review per transaction-item, and for a sales-volume
 * proxy those replicas legitimately reflect multi-item orders. (Dedupe is for the recent-reviews UI,
 * not for cadence.)
 */
export function reviewsToMonthlyPoints(
  shopId: number,
  reviews: Pick<EtsyReview, 'created_timestamp' | 'rating'>[],
  opts?: { categoryId?: number | null }
): UpsertPoint[] {
  const byBucket = new Map<number, { count: number; ratingSum: number }>();
  for (const r of reviews) {
    if (!r.created_timestamp || r.created_timestamp <= 0) continue;
    const bucket = bucketFor(r.created_timestamp, 'month');
    const agg = byBucket.get(bucket) ?? { count: 0, ratingSum: 0 };
    agg.count += 1;
    agg.ratingSum += typeof r.rating === 'number' ? r.rating : 0;
    byBucket.set(bucket, agg);
  }

  const entityId = String(shopId);
  const meta = opts?.categoryId != null ? JSON.stringify({ categoryId: opts.categoryId }) : null;
  const points: UpsertPoint[] = [];
  for (const [bucket, agg] of byBucket) {
    const ts = bucketStart(bucket, 'month');
    points.push({
      entityType: 'shop',
      entityId,
      metric: 'reviews',
      granularity: 'month',
      bucket,
      ts,
      value: agg.count,
      source: REVIEW_BACKFILL_SOURCE,
      meta,
    });
    points.push({
      entityType: 'shop',
      entityId,
      metric: 'review_rating',
      granularity: 'month',
      bucket,
      ts,
      value: agg.count > 0 ? agg.ratingSum / agg.count : 0,
      source: REVIEW_BACKFILL_SOURCE,
      meta,
    });
  }
  // Chronological — keeps batched writes and any debugging readable.
  return points.sort((a, b) => a.bucket - b.bucket || a.metric.localeCompare(b.metric));
}

export interface BackfillResult {
  shopId: number;
  skipped: boolean; // already had backfilled history (idempotent no-op)
  pagesFetched: number;
  reviewsSeen: number;
  monthsCovered: number;
  earliest: number | null; // epoch seconds of the oldest review, or null
}

export interface BackfillDeps {
  client: Pick<EtsyClient, 'getReviewsByShop'>;
  series: SeriesRepo;
}

export interface BackfillOptions {
  categoryId?: number | null;
  /** Hard cap on pages so one heavy shop can't drain the Etsy quota. Default 20 (~2000 reviews). */
  maxPages?: number;
  /** Page size (Etsy max 100). Default 100. */
  pageSize?: number;
  /** Re-backfill even if history already exists (e.g. to refresh recent months). Default false. */
  force?: boolean;
}

/**
 * Paginate a shop's reviews and persist the monthly series. Idempotent: skips a shop that already
 * has a `reviews` month series unless `force`, and the upserts themselves are conflict-safe so a
 * re-run never duplicates. Bounded by `maxPages` to protect the Etsy daily quota.
 */
export async function backfillShopReviews(
  deps: BackfillDeps,
  shopId: number,
  opts: BackfillOptions = {}
): Promise<BackfillResult> {
  const { client, series } = deps;
  const maxPages = Math.max(1, Math.floor(opts.maxPages ?? 20));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 100)));
  const entityId = String(shopId);

  if (!opts.force) {
    const existing = await series.latest({
      entityType: 'shop',
      entityId,
      metric: 'reviews',
      granularity: 'month',
    });
    if (existing) {
      return { shopId, skipped: true, pagesFetched: 0, reviewsSeen: 0, monthsCovered: 0, earliest: null };
    }
  }

  const reviews: EtsyReview[] = [];
  let pagesFetched = 0;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const res = await client.getReviewsByShop(shopId, { limit: pageSize, offset });
    pagesFetched++;
    const batch = res.results ?? [];
    reviews.push(...batch);
    // Stop when the page is short (last page) or we've reached Etsy's reported total.
    if (batch.length < pageSize) break;
    if (res.count && offset + batch.length >= res.count) break;
  }

  const points = reviewsToMonthlyPoints(shopId, reviews, { categoryId: opts.categoryId });
  await series.bulkUpsert(points);

  const earliest = reviews.reduce<number | null>(
    (min, r) => (r.created_timestamp && (min == null || r.created_timestamp < min) ? r.created_timestamp : min),
    null
  );
  const monthsCovered = points.filter((p) => p.metric === 'reviews').length;
  return { shopId, skipped: false, pagesFetched, reviewsSeen: reviews.length, monthsCovered, earliest };
}

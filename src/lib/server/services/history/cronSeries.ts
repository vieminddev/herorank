/**
 * Pure adapters that turn the data the research cron already fetches into `metric_series` points
 * (ZERO extra Etsy calls — these reuse objects refreshTrends/refreshBestSellers already have in hand).
 *
 * Keeping them here (pure, no I/O) means the cron just maps → `seriesRepo.bulkUpsert`, and the
 * mapping is unit-testable on its own. Metric vocabulary is open: add a field → add a point, no
 * schema change.
 */
import type { UpsertPoint } from '../../repositories/seriesRepo';
import { bucketFor, bucketStart } from './buckets';

/** A shop's public counters → DAILY series points (sold_count, review_count, active_listings, num_favorers). */
export function shopSnapshotPoints(
  shopId: number,
  snap: {
    soldCount: number | null;
    reviewCount: number | null;
    activeListings: number | null;
    numFavorers: number | null;
    categoryId?: number | null;
  },
  nowSec: number
): UpsertPoint[] {
  const bucket = bucketFor(nowSec, 'day');
  const ts = bucketStart(bucket, 'day');
  const entityId = String(shopId);
  const meta = snap.categoryId != null ? JSON.stringify({ categoryId: snap.categoryId }) : null;
  const out: UpsertPoint[] = [];
  const add = (metric: string, value: number | null) => {
    if (value == null || !Number.isFinite(value)) return;
    out.push({ entityType: 'shop', entityId, metric, granularity: 'day', bucket, ts, value, source: 'cron', meta });
  };
  add('sold_count', snap.soldCount);
  add('review_count', snap.reviewCount);
  add('active_listings', snap.activeListings);
  add('num_favorers', snap.numFavorers);
  return out;
}

/** A keyword's weekly market snapshot → WEEKLY series points (demand + price/views signals). */
export function keywordTrendPoints(
  keyword: string,
  snap: {
    demandScore: number;
    resultCount?: number;
    priceMedian?: number;
    medianViews?: number;
    newListings7d?: number;
    whitespace?: number;
    categoryId?: number | null;
  },
  nowSec: number
): UpsertPoint[] {
  const bucket = bucketFor(nowSec, 'week');
  const ts = bucketStart(bucket, 'week');
  const entityId = keyword;
  const meta = snap.categoryId != null ? JSON.stringify({ categoryId: snap.categoryId }) : null;
  const out: UpsertPoint[] = [];
  const add = (metric: string, value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return;
    out.push({ entityType: 'keyword', entityId, metric, granularity: 'week', bucket, ts, value, source: 'cron', meta });
  };
  add('demand', snap.demandScore);
  add('result_count', snap.resultCount);
  add('price_median', snap.priceMedian);
  add('median_views', snap.medianViews);
  add('new_listings', snap.newListings7d);
  add('whitespace', snap.whitespace);
  return out;
}

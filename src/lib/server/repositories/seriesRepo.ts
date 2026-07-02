/**
 * Series repository — D1 data access for the unified `metric_series` time-series table
 * (vierank-history DB). Every historical market signal (keyword demand, shop sales velocity,
 * listing rank/price, review cadence, …) reads and writes through here.
 *
 * Interface + factory. The interface is faked in tests; the D1 impl uses parameterized queries and
 * `INSERT … ON CONFLICT … DO UPDATE` for idempotent upserts (one row per
 * (entity_type, entity_id, metric, granularity, bucket) — re-running a cron/backfill overwrites,
 * never duplicates, so velocity/forecast math is never skewed by double-fires).
 *
 * Pass it the HISTORY_DB binding (via `getHistoryDb(c)` / `historyDbFromEnv(env)`), NOT the OLTP DB.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { Granularity } from '../services/history/buckets';

/** Identifies one series (a single line on a chart). */
export interface MetricKey {
  entityType: string;
  entityId: string;
  metric: string;
  granularity: Granularity;
}

/** A point written to a series. */
export interface UpsertPoint extends MetricKey {
  bucket: number;
  ts: number;
  value: number;
  source: string;
  meta?: string | null;
}

/** A point read back from a series. */
export interface SeriesPoint {
  bucket: number;
  ts: number;
  value: number;
  source: string;
  meta: string | null;
}

export interface SeriesQuery {
  /** Cap to the most-recent N buckets (then returned oldest→newest). Default 52. */
  limit?: number;
  /** Only buckets ≥ this index (e.g. last 12 months). */
  sinceBucket?: number;
}

export interface SeriesRepo {
  /** Idempotent upsert of one point. */
  upsert(p: UpsertPoint): Promise<void>;
  /** Idempotent upsert of many points in a single D1 batch (atomic, fewer round-trips). */
  bulkUpsert(points: UpsertPoint[]): Promise<void>;
  /** One series, oldest→newest. */
  series(key: MetricKey, q?: SeriesQuery): Promise<SeriesPoint[]>;
  /** The single most-recent point of a series, or null. */
  latest(key: MetricKey): Promise<SeriesPoint | null>;
  /**
   * The latest point per entity for one metric — for cross-entity leaderboards
   * (e.g. every shop's most recent `sold_per_week`). Optionally restrict to `entityIds`.
   */
  latestByMetric(opts: {
    entityType: string;
    metric: string;
    granularity: Granularity;
    entityIds?: string[];
  }): Promise<Map<string, SeriesPoint>>;
  /**
   * Shops that HAVE a live `sold_count` (so they've been discovered) but NOT yet a `reviews` month
   * series (so they haven't been review-backfilled) — the work-queue for the history accumulator.
   * Returns the shop id + its category (parsed from the sold_count point's meta) so the backfill can
   * tag the cadence by category (for category-level seasonality). Ordered for stable paging.
   */
  shopsMissingReviewBackfill(limit: number): Promise<Array<{ shopId: number; categoryId: number | null }>>;
}

interface SeriesRow {
  bucket: number;
  ts: number;
  value: number;
  source: string;
  meta: string | null;
}

const UPSERT_SQL =
  'INSERT INTO metric_series (entity_type, entity_id, metric, granularity, bucket, ts, value, source, meta) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(entity_type, entity_id, metric, granularity, bucket) DO UPDATE SET ' +
  'ts=excluded.ts, value=excluded.value, source=excluded.source, meta=excluded.meta';

export function createSeriesRepo(db: D1Database): SeriesRepo {
  const bindUpsert = (p: UpsertPoint) =>
    db
      .prepare(UPSERT_SQL)
      .bind(
        p.entityType,
        p.entityId,
        p.metric,
        p.granularity,
        p.bucket,
        p.ts,
        p.value,
        p.source,
        p.meta ?? null
      );

  return {
    async upsert(p) {
      await bindUpsert(p).run();
    },

    async bulkUpsert(points) {
      if (points.length === 0) return;
      // D1 batches up to ~100 statements well; chunk to stay clear of limits on large backfills.
      const CHUNK = 50;
      for (let i = 0; i < points.length; i += CHUNK) {
        await db.batch(points.slice(i, i + CHUNK).map(bindUpsert));
      }
    },

    async series(key, q) {
      const limit = Math.max(1, Math.floor(q?.limit ?? 52));
      const sinceBucket = q?.sinceBucket;
      const where =
        'entity_type = ? AND entity_id = ? AND metric = ? AND granularity = ?' +
        (sinceBucket != null ? ' AND bucket >= ?' : '');
      const binds: (string | number)[] = [key.entityType, key.entityId, key.metric, key.granularity];
      if (sinceBucket != null) binds.push(sinceBucket);
      binds.push(limit);
      const { results } = await db
        .prepare(
          `SELECT bucket, ts, value, source, meta FROM metric_series WHERE ${where} ` +
            'ORDER BY bucket DESC LIMIT ?'
        )
        .bind(...binds)
        .all<SeriesRow>();
      return (results ?? [])
        .map((r) => ({ bucket: r.bucket, ts: r.ts, value: r.value, source: r.source, meta: r.meta }))
        .sort((a, b) => a.bucket - b.bucket);
    },

    async latest(key) {
      const row = await db
        .prepare(
          'SELECT bucket, ts, value, source, meta FROM metric_series ' +
            'WHERE entity_type = ? AND entity_id = ? AND metric = ? AND granularity = ? ' +
            'ORDER BY bucket DESC LIMIT 1'
        )
        .bind(key.entityType, key.entityId, key.metric, key.granularity)
        .first<SeriesRow>();
      return row
        ? { bucket: row.bucket, ts: row.ts, value: row.value, source: row.source, meta: row.meta }
        : null;
    },

    async latestByMetric({ entityType, metric, granularity, entityIds }) {
      // Latest bucket per entity for one metric. The grouped MAX(bucket) is resolved first, then
      // joined back for the row at that bucket. Index idx_metric_series_metric serves the scan.
      const idFilter = entityIds?.length
        ? ` AND entity_id IN (${entityIds.map(() => '?').join(',')})`
        : '';
      const binds: (string | number)[] = [entityType, metric, granularity];
      if (entityIds?.length) binds.push(...entityIds);
      const { results } = await db
        .prepare(
          'SELECT m.entity_id AS entity_id, m.bucket AS bucket, m.ts AS ts, m.value AS value, ' +
            'm.source AS source, m.meta AS meta FROM metric_series m ' +
            'JOIN (SELECT entity_id, MAX(bucket) AS mb FROM metric_series ' +
            `WHERE entity_type = ? AND metric = ? AND granularity = ?${idFilter} ` +
            'GROUP BY entity_id) g ON g.entity_id = m.entity_id AND g.mb = m.bucket ' +
            'WHERE m.entity_type = ? AND m.metric = ? AND m.granularity = ?' +
            (idFilter ? idFilter : '')
        )
        .bind(...binds, entityType, metric, granularity, ...(entityIds ?? []))
        .all<SeriesRow & { entity_id: string }>();
      const map = new Map<string, SeriesPoint>();
      for (const r of results ?? []) {
        map.set(r.entity_id, {
          bucket: r.bucket,
          ts: r.ts,
          value: r.value,
          source: r.source,
          meta: r.meta,
        });
      }
      return map;
    },

    async shopsMissingReviewBackfill(limit) {
      const lim = Math.max(1, Math.floor(limit));
      const { results } = await db
        .prepare(
          "SELECT s.entity_id AS entity_id, MAX(s.meta) AS meta FROM metric_series s " +
            "WHERE s.entity_type = 'shop' AND s.metric = 'sold_count' AND s.granularity = 'day' " +
            "AND NOT EXISTS (SELECT 1 FROM metric_series r WHERE r.entity_type = 'shop' " +
            "AND r.entity_id = s.entity_id AND r.metric = 'reviews' AND r.granularity = 'month') " +
            'GROUP BY s.entity_id ORDER BY s.entity_id LIMIT ?'
        )
        .bind(lim)
        .all<{ entity_id: string; meta: string | null }>();
      return (results ?? []).map((r) => {
        let categoryId: number | null = null;
        if (r.meta) {
          try {
            const m = JSON.parse(r.meta) as { categoryId?: number | null };
            categoryId = m.categoryId ?? null;
          } catch {
            /* ignore malformed meta */
          }
        }
        return { shopId: Number(r.entity_id), categoryId };
      });
    },
  };
}

/**
 * Time-series retention + cold archive (data-strategy report follow-up).
 *
 * The cron's time-series tables grow forever otherwise. `pruneTimeSeries` (run weekly by the
 * scheduled handler) keeps a bounded hot window in D1; rows past the window are first ARCHIVED to
 * R2 as NDJSON.gz (so operational history is kept for backfill / read-path continuity at ~$0 — R2
 * has zero egress), then DELETEd from D1.
 *
 * R2 is optional: when no `archive` bucket is passed (plain `vite dev`, or before the bucket
 * exists) it falls back to delete-only — nothing breaks, you just don't keep the cold copy.
 *
 * Windows (keep enough for every read path; older history lives in R2):
 *   - keywords_cache : 104 weeks (forecast reads the last 26 weekly points).
 *   - shop_pulse     : 104 weeks (sales-velocity reads the recent span).
 *   - rank_history   : 180 days (daily cadence — the biggest grower).
 */
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

const DAY = 86_400;

export const RETENTION_DAYS = {
  keywords_cache: 104 * 7, // 728 days (~2 years of weekly snapshots)
  shop_pulse: 104 * 7,
  rank_history: 180,
  // `analyses` (OLTP, per-user tool-result snapshots) was previously UNBOUNDED — the one real path to
  // the 10GB ceiling. Cap at 1 year (the history feed shows only recent rows); older rows go to R2.
  analyses: 365,
} as const;

/**
 * Per-granularity windows for the unified `metric_series` (vierank-history DB), keyed on `ts`.
 * MONTH series hold the deep review-backfilled sales cadence — the whole point of expanding history —
 * and are tiny, so they are kept ~10 years (effectively forever). DAY series (snapshots) churn fast.
 */
export const METRIC_SERIES_RETENTION_DAYS = {
  day: 180,
  week: 104 * 7, // 728
  month: 3650, // ~10 years — keep the deep history
} as const;

export interface PruneResult {
  keywords: number;
  shopPulse: number;
  rankHistory: number;
  /** Rows written to R2 (0 when no archive bucket is configured). */
  archived: number;
}

export interface MetricSeriesPruneResult {
  day: number;
  week: number;
  month: number;
  archived: number;
}

/** gzip a string with the runtime-native CompressionStream (no deps; available in Workers + Node 18+). */
async function gzip(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  void writer.write(new TextEncoder().encode(text));
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** YYYY-MM-DD (UTC) of a run, used as the archive partition key suffix. */
function runDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Archive rows past their window to R2 (if a bucket is given), then delete them from D1.
 * Returns rows removed per table + total rows archived.
 */
export async function pruneTimeSeries(
  db: D1Database,
  nowMs: number = Date.now(),
  archive?: R2Bucket
): Promise<PruneResult> {
  const now = Math.floor(nowMs / 1000);
  const date = runDate(nowMs);
  let archived = 0;

  // `timeCol` lets the same archive→delete logic serve tables with different time columns
  // (most use `captured_at`; `analyses` uses `created_at`). `partition` optionally sub-keys the R2
  // object (used to keep per-granularity metric_series archives separate within the same run-date).
  async function archiveAndPrune(
    table: string,
    days: number,
    opts?: { timeCol?: string; where?: string; binds?: (string | number)[]; partition?: string }
  ): Promise<number> {
    const timeCol = opts?.timeCol ?? 'captured_at';
    const cutoff = now - days * DAY;
    const extra = opts?.where ? ` AND ${opts.where}` : '';
    const extraBinds = opts?.binds ?? [];
    const part = opts?.partition ? `${opts.partition}/` : '';

    // 1. Archive the soon-to-be-deleted rows to R2 first (best-effort; a failed archive must NOT
    //    delete the rows — we skip the delete so next week retries). One object per table per run.
    if (archive) {
      const { results } = await db
        .prepare(`SELECT * FROM ${table} WHERE ${timeCol} < ?${extra}`)
        .bind(cutoff, ...extraBinds)
        .all<Record<string, unknown>>();
      const rows = results ?? [];
      if (rows.length > 0) {
        const ndjson = rows.map((r) => JSON.stringify(r)).join('\n');
        const body = await gzip(ndjson);
        // Key: archive/{table}/{partition?}{run-date}.ndjson.gz — weekly runs are 7 days apart so
        // keys never collide; a same-day re-run overwrites with the same slice (idempotent).
        await archive.put(`archive/${table}/${part}${date}.ndjson.gz`, body, {
          httpMetadata: { contentType: 'application/gzip' },
          customMetadata: { table, cutoff: String(cutoff), rows: String(rows.length) },
        });
        archived += rows.length;
      }
    }

    // 2. Delete from D1.
    const res = await db
      .prepare(`DELETE FROM ${table} WHERE ${timeCol} < ?${extra}`)
      .bind(cutoff, ...extraBinds)
      .run();
    return (res as { meta?: { changes?: number } }).meta?.changes ?? 0;
  }

  // Sequential (D1 is single-writer; tiny weekly batches). These three typed time-series tables now
  // live in the vierank-history DB — pass that handle. `analyses` (OLTP) is pruned by pruneAnalyses.
  const keywords = await archiveAndPrune('keywords_cache', RETENTION_DAYS.keywords_cache);
  const shopPulse = await archiveAndPrune('shop_pulse', RETENTION_DAYS.shop_pulse);
  const rankHistory = await archiveAndPrune('rank_history', RETENTION_DAYS.rank_history);

  return { keywords, shopPulse, rankHistory, archived };
}

/**
 * Prune the OLTP `analyses` table (per-user tool-result snapshots, keyed on `created_at`), archiving
 * to R2 first. Separated from pruneTimeSeries because `analyses` stays in the OLTP DB (user FK) while
 * the market time-series tables moved to vierank-history. Returns rows removed + archived.
 */
export async function pruneAnalyses(
  db: D1Database,
  nowMs: number = Date.now(),
  archive?: R2Bucket
): Promise<{ analyses: number; archived: number }> {
  const now = Math.floor(nowMs / 1000);
  const date = runDate(nowMs);
  const cutoff = now - RETENTION_DAYS.analyses * DAY;
  let archived = 0;

  if (archive) {
    const { results } = await db
      .prepare('SELECT * FROM analyses WHERE created_at < ?')
      .bind(cutoff)
      .all<Record<string, unknown>>();
    const rows = results ?? [];
    if (rows.length > 0) {
      const body = await gzip(rows.map((r) => JSON.stringify(r)).join('\n'));
      await archive.put(`archive/analyses/${date}.ndjson.gz`, body, {
        httpMetadata: { contentType: 'application/gzip' },
        customMetadata: { table: 'analyses', cutoff: String(cutoff), rows: String(rows.length) },
      });
      archived += rows.length;
    }
  }
  const res = await db.prepare('DELETE FROM analyses WHERE created_at < ?').bind(cutoff).run();
  return { analyses: (res as { meta?: { changes?: number } }).meta?.changes ?? 0, archived };
}

/**
 * Prune the unified `metric_series` (vierank-history DB) per granularity, archiving to R2 first.
 * Keyed on `ts`. Pass the HISTORY_DB handle (NOT the OLTP db). Month series are effectively kept.
 */
export async function pruneMetricSeries(
  historyDb: D1Database,
  nowMs: number = Date.now(),
  archive?: R2Bucket
): Promise<MetricSeriesPruneResult> {
  const now = Math.floor(nowMs / 1000);
  const date = runDate(nowMs);
  let archived = 0;

  async function pruneGran(gran: 'day' | 'week' | 'month', days: number): Promise<number> {
    const cutoff = now - days * DAY;
    if (archive) {
      const { results } = await historyDb
        .prepare('SELECT * FROM metric_series WHERE granularity = ? AND ts < ?')
        .bind(gran, cutoff)
        .all<Record<string, unknown>>();
      const rows = results ?? [];
      if (rows.length > 0) {
        const body = await gzip(rows.map((r) => JSON.stringify(r)).join('\n'));
        await archive.put(`archive/metric_series/${gran}/${date}.ndjson.gz`, body, {
          httpMetadata: { contentType: 'application/gzip' },
          customMetadata: { table: 'metric_series', granularity: gran, rows: String(rows.length) },
        });
        archived += rows.length;
      }
    }
    const res = await historyDb
      .prepare('DELETE FROM metric_series WHERE granularity = ? AND ts < ?')
      .bind(gran, cutoff)
      .run();
    return (res as { meta?: { changes?: number } }).meta?.changes ?? 0;
  }

  const day = await pruneGran('day', METRIC_SERIES_RETENTION_DAYS.day);
  const week = await pruneGran('week', METRIC_SERIES_RETENTION_DAYS.week);
  const month = await pruneGran('month', METRIC_SERIES_RETENTION_DAYS.month);
  return { day, week, month, archived };
}

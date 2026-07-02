/**
 * Pure-JS fake D1 for the time-series tables — implements the EXACT semantics the etsy stores +
 * retention rely on: ON CONFLICT(entity, week_bucket) upsert, append insert, ordered series reads,
 * and DELETE ... WHERE captured_at < ?. No native deps (better-sqlite3's prebuilt binary doesn't
 * load under vitest here), so idempotency + retention are still tested for real behavior.
 */
import type { D1Database } from '@cloudflare/workers-types';

interface KwRow {
  id: number; keyword: string; category_id: number | null; demand_score: number; result_count: number;
  competition: string; captured_at: number; agg_views: number | null; price_median: number | null;
  price_p25: number | null; price_p75: number | null; median_views: number | null;
  has_variations_pct: number | null; new_listings_7d: number | null; week_bucket: number | null;
}
interface PulseRow {
  id: number; shop_id: number; category_id: number | null; sold_count: number | null;
  review_count: number | null; active_listings: number | null; num_favorers: number | null;
  review_average: number | null; captured_at: number; week_bucket: number | null;
}
interface RankRow { id: number; listing_id: number; keyword: string; position: number | null; captured_at: number; }
interface AnalysisRow { id: number; user_id: string; tool: string; subject: string; created_at: number; }

export interface FakeD1 {
  db: D1Database;
  tables: { keywords: KwRow[]; shopPulse: PulseRow[]; rankHistory: RankRow[]; analyses: AnalysisRow[] };
  keyUsage: Map<string, number>;
  seedRank(row: { listing_id: number; keyword?: string; position?: number | null; captured_at: number }): void;
  seedAnalysis(row: { user_id?: string; tool?: string; subject?: string; created_at: number }): void;
}

export function makeSqliteD1(): FakeD1 {
  const keywords: KwRow[] = [];
  const shopPulse: PulseRow[] = [];
  const rankHistory: RankRow[] = [];
  const analyses: AnalysisRow[] = [];
  const keyUsage = new Map<string, number>(); // `${day}|${key_id}` -> count
  let id = 1;
  let clock = 1_700_000_000;

  function prepare(sql: string) {
    let a: unknown[] = [];
    const api = {
      bind(...args: unknown[]) { a = args; return api; },

      async run() {
        // --- etsy_key_usage (per-key pool counter) ---
        if (sql.startsWith('INSERT INTO etsy_key_usage')) {
          const [day, key_id] = a as [string, string];
          const k = `${day}|${key_id}`;
          keyUsage.set(k, (keyUsage.get(k) ?? 0) + 1);
          return { success: true, meta: { changes: 1 } };
        }
        // --- keywords_cache ---
        if (sql.startsWith('INSERT INTO keywords_cache')) {
          const [keyword, category_id, demand_score, result_count, competition, agg_views, price_median,
            price_p25, price_p75, median_views, has_variations_pct, new_listings_7d, week_bucket, captured_at] = a as never[];
          const wb = (week_bucket ?? null) as number | null;
          if (sql.includes('ON CONFLICT') && wb !== null) {
            const ex = keywords.find((r) => r.keyword === keyword && r.week_bucket === wb);
            if (ex) {
              Object.assign(ex, { category_id: category_id ?? null, demand_score, result_count, competition,
                agg_views: agg_views ?? null, price_median: price_median ?? null, price_p25: price_p25 ?? null,
                price_p75: price_p75 ?? null, median_views: median_views ?? null,
                has_variations_pct: has_variations_pct ?? null, new_listings_7d: new_listings_7d ?? null,
                captured_at: (captured_at as number) ?? ex.captured_at });
              return { success: true, meta: { changes: 1 } };
            }
          }
          keywords.push({ id: id++, keyword: keyword as string, category_id: (category_id ?? null) as number | null,
            demand_score: demand_score as number, result_count: result_count as number, competition: competition as string,
            agg_views: (agg_views ?? null) as number | null, price_median: (price_median ?? null) as number | null,
            price_p25: (price_p25 ?? null) as number | null, price_p75: (price_p75 ?? null) as number | null,
            median_views: (median_views ?? null) as number | null, has_variations_pct: (has_variations_pct ?? null) as number | null,
            new_listings_7d: (new_listings_7d ?? null) as number | null, week_bucket: wb,
            captured_at: (captured_at as number) ?? clock++ });
          return { success: true, meta: { changes: 1 } };
        }
        // --- shop_pulse ---
        if (sql.startsWith('INSERT INTO shop_pulse')) {
          const [shop_id, category_id, sold_count, review_count, active_listings, num_favorers, review_average, week_bucket, captured_at] = a as never[];
          const wb = (week_bucket ?? null) as number | null;
          if (sql.includes('ON CONFLICT') && wb !== null) {
            const ex = shopPulse.find((r) => r.shop_id === shop_id && r.week_bucket === wb);
            if (ex) {
              Object.assign(ex, { category_id: category_id ?? null, sold_count: sold_count ?? null,
                review_count: review_count ?? null, active_listings: active_listings ?? null,
                num_favorers: num_favorers ?? null, review_average: review_average ?? null,
                captured_at: (captured_at as number) ?? ex.captured_at });
              return { success: true, meta: { changes: 1 } };
            }
          }
          shopPulse.push({ id: id++, shop_id: shop_id as number, category_id: (category_id ?? null) as number | null,
            sold_count: (sold_count ?? null) as number | null, review_count: (review_count ?? null) as number | null,
            active_listings: (active_listings ?? null) as number | null, num_favorers: (num_favorers ?? null) as number | null,
            review_average: (review_average ?? null) as number | null, week_bucket: wb,
            captured_at: (captured_at as number) ?? clock++ });
          return { success: true, meta: { changes: 1 } };
        }
        // --- retention DELETEs ---
        if (sql.startsWith('DELETE FROM ')) {
          const cutoff = a[0] as number;
          // `analyses` keys on created_at; the time-series tables on captured_at.
          if (sql.includes('analyses')) {
            let removed = 0;
            for (let i = analyses.length - 1; i >= 0; i--) {
              if (analyses[i].created_at < cutoff) { analyses.splice(i, 1); removed++; }
            }
            return { success: true, meta: { changes: removed } };
          }
          const target = sql.includes('keywords_cache') ? keywords : sql.includes('shop_pulse') ? shopPulse : rankHistory;
          let removed = 0;
          for (let i = target.length - 1; i >= 0; i--) {
            if ((target[i] as { captured_at: number }).captured_at < cutoff) { target.splice(i, 1); removed++; }
          }
          return { success: true, meta: { changes: removed } };
        }
        return { success: true, meta: { changes: 0 } };
      },

      async first<T>(): Promise<T | null> {
        // etsy_key_usage current count for (day, key_id)
        if (sql.includes('FROM etsy_key_usage')) {
          const [day, key_id] = a as [string, string];
          const c = keyUsage.get(`${day}|${key_id}`);
          return (c === undefined ? null : ({ count: c } as unknown)) as T | null;
        }
        // keywords_cache prior(): most recent row strictly older than cutoff.
        if (sql.includes('FROM keywords_cache') && sql.includes('captured_at <')) {
          const [keyword, cutoff] = a as [string, number];
          const row = keywords.filter((r) => r.keyword === keyword && r.captured_at < cutoff)
            .sort((x, y) => y.captured_at - x.captured_at)[0];
          return (row ?? null) as T | null;
        }
        return null as T | null;
      },

      async all<T>(): Promise<{ results: T[] }> {
        // retention archive query: SELECT * FROM <table> WHERE <timeCol> < ? → full rows
        if (sql.startsWith('SELECT * FROM ')) {
          const cutoff = a[0] as number;
          if (sql.includes('analyses')) {
            return { results: analyses.filter((r) => r.created_at < cutoff) as unknown as T[] };
          }
          const target = sql.includes('keywords_cache') ? keywords : sql.includes('shop_pulse') ? shopPulse : rankHistory;
          return { results: target.filter((r) => (r as { captured_at: number }).captured_at < cutoff) as unknown as T[] };
        }
        if (sql.includes('FROM shop_pulse')) {
          const [shopId, limit] = a as [number, number];
          const rows = shopPulse.filter((p) => p.shop_id === shopId)
            .sort((x, y) => y.captured_at - x.captured_at).slice(0, limit)
            .map((p) => ({ captured_at: p.captured_at, sold_count: p.sold_count, review_count: p.review_count, active_listings: p.active_listings, num_favorers: p.num_favorers }));
          return { results: rows as T[] };
        }
        if (sql.includes('FROM keywords_cache')) {
          const [keyword, limit] = a as [string, number];
          const rows = keywords.filter((r) => r.keyword === keyword)
            .sort((x, y) => y.captured_at - x.captured_at).slice(0, limit)
            .map((r) => ({ captured_at: r.captured_at, demand_score: r.demand_score, result_count: r.result_count, agg_views: r.agg_views }));
          return { results: rows as T[] };
        }
        return { results: [] as T[] };
      },
    };
    return api;
  }

  const db = { prepare } as unknown as D1Database;
  return {
    db,
    tables: { keywords, shopPulse, rankHistory, analyses },
    keyUsage,
    seedRank(row) {
      rankHistory.push({ id: id++, listing_id: row.listing_id, keyword: row.keyword ?? 'k', position: row.position ?? 1, captured_at: row.captured_at });
    },
    seedAnalysis(row) {
      analyses.push({ id: id++, user_id: row.user_id ?? 'u1', tool: row.tool ?? 'rank-check', subject: row.subject ?? 's', created_at: row.created_at });
    },
  };
}

/** Minimal in-memory R2 bucket for tests — records put()s so archive content can be asserted. */
export function makeFakeR2() {
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    async put(key: string, value: ArrayBuffer | Uint8Array) {
      objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value));
      return { key } as unknown;
    },
  } as unknown as import('@cloudflare/workers-types').R2Bucket;
  return { bucket, objects };
}

/** gunzip helper for tests (DecompressionStream is available in Node 18+). */
export async function gunzipToText(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  void writer.write(new Uint8Array(bytes)); // fresh ArrayBuffer-backed view (TS 5.7 BufferSource)
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder().decode(out);
}

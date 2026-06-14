/**
 * Shared cache-first layer (Engineer F owns, spec §2) — KV payloads + D1 keyword time-series.
 *
 * Two stores by data shape:
 *   - KV  : rendered tool payloads, GLOBAL across users (BR-P3-05). Soft/hard TTL: the value
 *           wraps `{ payload, fetchedAt }` and KV is written with a HARD ttl = 2× soft. A read
 *           past soft-TTL but within hard-TTL is "stale" (used for graceful degradation,
 *           spec §2.3). Fresh = within soft-TTL.
 *   - D1  : `keywords_cache` point-in-time demand snapshots, queryable for `trendDelta` (§3.4),
 *           which KV (blob, TTL-expiring) cannot do.
 *
 * Key scheme is versioned (`etsy:v1:...`) so a future bump invalidates everything at once.
 * `normalize` collapses casing/whitespace so 'Custom Necklace' and 'custom necklace' share an
 * entry.
 */
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { CompetitionLabel } from './types';

// --- TTLs (seconds), per spec §2.1 ------------------------------------------
export const TTL = {
  keyword: 7 * 86_400, // 7d (configurable up to 30)
  listing: 24 * 3_600, // 24h
  shop: 24 * 3_600,
  reviews: 24 * 3_600,
  rank: 24 * 3_600,
  niche: 7 * 86_400,
  trends: 7 * 86_400,
  bestsellers: 7 * 86_400,
  taxonomy: 30 * 86_400,
} as const;

export const CACHE_VERSION = 'v1';

export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

// --- Key builders -----------------------------------------------------------
export const cacheKeys = {
  listing: (id: number) => `etsy:${CACHE_VERSION}:listing:${id}`,
  shop: (id: number) => `etsy:${CACHE_VERSION}:shop:${id}`,
  shopName: (name: string) => `etsy:${CACHE_VERSION}:shopname:${normalize(name)}`,
  reviewsShop: (id: number) => `etsy:${CACHE_VERSION}:reviews:shop:${id}`,
  rank: (listingId: number, kw: string) =>
    `etsy:${CACHE_VERSION}:rank:${listingId}:${normalize(kw)}`,
  niche: (q: string) => `etsy:${CACHE_VERSION}:niche:${normalize(q)}`,
  keyword: (seed: string) => `etsy:${CACHE_VERSION}:keyword:${normalize(seed)}`,
  trends: (categoryId: number | string) => `etsy:${CACHE_VERSION}:trends:${categoryId}`,
  bestsellers: (categoryId: number | string) => `etsy:${CACHE_VERSION}:bestsellers:${categoryId}`,
  taxonomy: () => `etsy:${CACHE_VERSION}:taxonomy`,
};

interface CacheEnvelope<T> {
  payload: T;
  fetchedAt: number; // epoch ms
  softTtl: number; // seconds
}

export interface CacheReadResult<T> {
  payload: T;
  /** within soft-TTL = fresh; past soft but within hard = stale. */
  fresh: boolean;
}

/**
 * KV cache wrapper. `get` returns the payload plus a `fresh` flag; the caller decides whether
 * a stale entry is acceptable (graceful degradation) or a refresh is needed.
 */
export function createEtsyCache(kv: KVNamespace) {
  return {
    /** Read an entry. Returns null only when truly absent / hard-expired. */
    async get<T>(key: string, now: number = Date.now()): Promise<CacheReadResult<T> | null> {
      const raw = await kv.get(key);
      if (!raw) return null;
      let env: CacheEnvelope<T>;
      try {
        env = JSON.parse(raw) as CacheEnvelope<T>;
      } catch {
        return null;
      }
      const ageSec = (now - env.fetchedAt) / 1000;
      return { payload: env.payload, fresh: ageSec <= env.softTtl };
    },

    /** Write with soft TTL inside the value and a HARD KV ttl of 2× soft (keeps a stale copy). */
    async put<T>(key: string, payload: T, softTtl: number, now: number = Date.now()): Promise<void> {
      const env: CacheEnvelope<T> = { payload, fetchedAt: now, softTtl };
      await kv.put(key, JSON.stringify(env), { expirationTtl: Math.max(60, softTtl * 2) });
    },
  };
}

export type EtsyCache = ReturnType<typeof createEtsyCache>;

// --- D1 keyword history (time-series for trendDelta, spec §2.2) -------------

export interface KeywordSnapshot {
  keyword: string; // normalized
  categoryId: number | null;
  demandScore: number; // 0-100
  resultCount: number;
  competition: CompetitionLabel;
}

export interface KeywordHistoryStore {
  /** Append a point-in-time snapshot. */
  insert(snap: KeywordSnapshot): Promise<void>;
  /**
   * Most recent snapshot strictly older than `olderThanSec` ago for a keyword (the "prior"
   * period for trendDelta). Returns null on cold start.
   */
  prior(keyword: string, olderThanSec: number, now?: number): Promise<KeywordSnapshot | null>;
}

interface KeywordRow {
  keyword: string;
  category_id: number | null;
  demand_score: number;
  result_count: number;
  competition: string;
}

export function createKeywordHistory(db: D1Database): KeywordHistoryStore {
  return {
    async insert(snap: KeywordSnapshot): Promise<void> {
      await db
        .prepare(
          'INSERT INTO keywords_cache (keyword, category_id, demand_score, result_count, competition) ' +
            'VALUES (?, ?, ?, ?, ?)'
        )
        .bind(
          normalize(snap.keyword),
          snap.categoryId,
          snap.demandScore,
          snap.resultCount,
          snap.competition
        )
        .run();
    },

    async prior(keyword, olderThanSec, now = Date.now()): Promise<KeywordSnapshot | null> {
      const cutoff = Math.floor(now / 1000) - olderThanSec;
      const row = await db
        .prepare(
          'SELECT keyword, category_id, demand_score, result_count, competition ' +
            'FROM keywords_cache WHERE keyword = ? AND captured_at < ? ' +
            'ORDER BY captured_at DESC LIMIT 1'
        )
        .bind(normalize(keyword), cutoff)
        .first<KeywordRow>();
      if (!row) return null;
      return {
        keyword: row.keyword,
        categoryId: row.category_id,
        demandScore: row.demand_score,
        resultCount: row.result_count,
        competition: row.competition as CompetitionLabel,
      };
    },
  };
}

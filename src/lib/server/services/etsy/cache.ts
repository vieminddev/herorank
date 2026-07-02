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

// --- TTLs (seconds) — bounded by Etsy's API display-freshness limits ---------
// Etsy API Terms: LISTING content may not be displayed older than 6h; OTHER Etsy content
// (shop/reviews/etc.) not older than 24h. soft-TTL = how long we serve as fresh; hard-TTL
// (default 2× soft) only feeds graceful degradation. Listing pins hard = soft so we never
// display listing data past 6h. Derived analytics (keyword demand / trends) aren't verbatim
// Etsy content, so they may live longer.
export const TTL = {
  keyword: 7 * 86_400, // 7d (configurable up to 30) — derived demand metric, not verbatim content
  listing: 6 * 3_600, // 6h — Etsy's hard cap for displaying LISTING content (no stale; see put)
  shop: 12 * 3_600, // 12h soft → 24h hard, within Etsy's 24h cap for non-listing content
  reviews: 12 * 3_600, // 12h soft → 24h hard
  rank: 24 * 3_600, // derived SERP position (not verbatim listing content)
  niche: 7 * 86_400,
  trends: 7 * 86_400,
  bestsellers: 24 * 3_600, // 24h — surfaces shop/listing names → keep within Etsy's 24h cap
  taxonomy: 30 * 86_400, // category tree — near-static reference data
} as const;

export const CACHE_VERSION = 'v1';

export function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

// --- Key builders -----------------------------------------------------------
export const cacheKeys = {
  listing: (id: number) => `etsy:${CACHE_VERSION}:listing:${id}`,
  // `:r2` / `:r3` — incremental busts for the review cache without touching cron-built KV.
  // `:r3` busted to invalidate entries written before `complaints`/`reviewsSampled` were added.
  shop: (id: number) => `etsy:${CACHE_VERSION}:shop:r2:${id}`,
  shopName: (name: string) => `etsy:${CACHE_VERSION}:shopname:${normalize(name)}`,
  reviewsShop: (id: number) => `etsy:${CACHE_VERSION}:reviews:shop:r6:${id}`,
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

    /**
     * Write with soft TTL inside the value and a HARD KV ttl that defaults to 2× soft (keeps a
     * stale copy for graceful degradation). Pass `hardTtl = softTtl` to FORBID stale serving —
     * required for listing content, which Etsy caps at 6h of display age with no leeway.
     */
    async put<T>(
      key: string,
      payload: T,
      softTtl: number,
      opts: { hardTtl?: number; now?: number } = {}
    ): Promise<void> {
      const now = opts.now ?? Date.now();
      const hard = Math.max(60, opts.hardTtl ?? softTtl * 2);
      const env: CacheEnvelope<T> = { payload, fetchedAt: now, softTtl };
      await kv.put(key, JSON.stringify(env), { expirationTtl: hard });
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
  /**
   * Sum of REAL `views` across the sampled top-N listings for this keyword — real traffic
   * volume captured at snapshot time. Optional/back-compat: undefined → stored NULL (older rows
   * predate the column). Enables future views-velocity forecasting.
   */
  aggViews?: number;
  /** Nhịp A market-pulse fields (cron data-strategy report). All optional → stored NULL when absent. */
  priceMedian?: number; // cents
  priceP25?: number; // cents
  priceP75?: number; // cents
  medianViews?: number;
  hasVariationsPct?: number; // 0-100
  newListings7d?: number;
}

/** A point in a keyword's recorded demand time-series (for forecasting). */
export interface KeywordSeriesPoint {
  capturedAt: number; // epoch seconds
  demandScore: number; // 0-100
  resultCount: number;
  /** Aggregate real `views` at this point, or null for rows captured before the column existed. */
  aggViews: number | null;
}

export interface KeywordHistoryStore {
  /** Append a point-in-time snapshot (no dedup — used by ad-hoc callers/tests). */
  insert(snap: KeywordSnapshot): Promise<void>;
  /**
   * IDEMPOTENT weekly upsert (the cron primitive): exactly one row per (keyword, ISO-week). A
   * re-run within the same week UPDATES that week's row instead of duplicating — so a retried or
   * double-fired weekly cron can't skew the forecast OLS. `nowMs` injectable for tests.
   */
  insertWeekly(snap: KeywordSnapshot, nowMs?: number): Promise<void>;
  /**
   * Most recent snapshot strictly older than `olderThanSec` ago for a keyword (the "prior"
   * period for trendDelta). Returns null on cold start.
   */
  prior(keyword: string, olderThanSec: number, now?: number): Promise<KeywordSnapshot | null>;
  /**
   * The keyword's snapshots ordered by `captured_at` ASC (oldest → newest), capped at `limit`
   * most-recent points (default ~26 weeks). Powers predictive trend forecasting.
   */
  series(keyword: string, limit?: number): Promise<KeywordSeriesPoint[]>;
  /**
   * The MOST RECENT cached snapshot for each of `keywords` that we actually have real data for,
   * keyed by normalized keyword. Keywords with no row are simply absent from the map. One query;
   * used to mark AI-generated keyword results as REAL where our cron has measured them.
   */
  latestMany(
    keywords: string[]
  ): Promise<Map<string, { demandScore: number; resultCount: number; competition: CompetitionLabel }>>;
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
          'INSERT INTO keywords_cache (keyword, category_id, demand_score, result_count, competition, ' +
            'agg_views, price_median, price_p25, price_p75, median_views, has_variations_pct, new_listings_7d) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          normalize(snap.keyword),
          snap.categoryId,
          snap.demandScore,
          snap.resultCount,
          snap.competition,
          snap.aggViews ?? null,
          snap.priceMedian ?? null,
          snap.priceP25 ?? null,
          snap.priceP75 ?? null,
          snap.medianViews ?? null,
          snap.hasVariationsPct ?? null,
          snap.newListings7d ?? null
        )
        .run();
    },

    async insertWeekly(snap: KeywordSnapshot, nowMs = Date.now()): Promise<void> {
      const nowSec = Math.floor(nowMs / 1000);
      const week = Math.floor(nowSec / 604_800); // weeks since epoch (one snapshot per ISO-week)
      await db
        .prepare(
          'INSERT INTO keywords_cache (keyword, category_id, demand_score, result_count, competition, ' +
            'agg_views, price_median, price_p25, price_p75, median_views, has_variations_pct, new_listings_7d, ' +
            'week_bucket, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT(keyword, week_bucket) DO UPDATE SET ' +
            'category_id=excluded.category_id, demand_score=excluded.demand_score, ' +
            'result_count=excluded.result_count, competition=excluded.competition, agg_views=excluded.agg_views, ' +
            'price_median=excluded.price_median, price_p25=excluded.price_p25, price_p75=excluded.price_p75, ' +
            'median_views=excluded.median_views, has_variations_pct=excluded.has_variations_pct, ' +
            'new_listings_7d=excluded.new_listings_7d, captured_at=excluded.captured_at'
        )
        .bind(
          normalize(snap.keyword),
          snap.categoryId,
          snap.demandScore,
          snap.resultCount,
          snap.competition,
          snap.aggViews ?? null,
          snap.priceMedian ?? null,
          snap.priceP25 ?? null,
          snap.priceP75 ?? null,
          snap.medianViews ?? null,
          snap.hasVariationsPct ?? null,
          snap.newListings7d ?? null,
          week,
          nowSec
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

    async series(keyword, limit = 26): Promise<KeywordSeriesPoint[]> {
      // Take the N most-recent rows (DESC + LIMIT), then re-order ASC so the caller gets a
      // chronological series suitable for regression. SQLite stores captured_at as epoch sec.
      const { results } = await db
        .prepare(
          'SELECT captured_at, demand_score, result_count, agg_views ' +
            'FROM keywords_cache WHERE keyword = ? ' +
            'ORDER BY captured_at DESC LIMIT ?'
        )
        .bind(normalize(keyword), Math.max(1, Math.floor(limit)))
        .all<{ captured_at: number; demand_score: number; result_count: number; agg_views: number | null }>();
      return (results ?? [])
        .map((r) => ({
          capturedAt: r.captured_at,
          demandScore: r.demand_score,
          resultCount: r.result_count,
          aggViews: r.agg_views ?? null,
        }))
        .sort((a, b) => a.capturedAt - b.capturedAt);
    },

    async latestMany(keywords) {
      const out = new Map<string, { demandScore: number; resultCount: number; competition: CompetitionLabel }>();
      const norm = [...new Set(keywords.map(normalize).filter(Boolean))];
      if (norm.length === 0) return out;
      const placeholders = norm.map(() => '?').join(',');
      const { results } = await db
        .prepare(
          `SELECT keyword, demand_score, result_count, competition, captured_at FROM keywords_cache ` +
            `WHERE keyword IN (${placeholders}) ORDER BY captured_at DESC`
        )
        .bind(...norm)
        .all<{ keyword: string; demand_score: number; result_count: number; competition: string; captured_at: number }>();
      // Rows are newest-first; keep the first (latest) row seen per keyword.
      for (const r of results ?? []) {
        if (out.has(r.keyword)) continue;
        out.set(r.keyword, {
          demandScore: r.demand_score,
          resultCount: r.result_count,
          competition: r.competition as CompetitionLabel,
        });
      }
      return out;
    },
  };
}

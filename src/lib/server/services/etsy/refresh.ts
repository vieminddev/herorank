/**
 * Cron refresh service functions (Engineer F owns, spec §5) — PURE, directly callable.
 *
 * Phase 4 will attach these to a Worker `scheduled()` handler + `wrangler.jsonc triggers.crons`.
 * Phase 3 ships them as plain async functions (no Hono, no scheduled wiring) so they are unit-
 * testable now and Phase 4 only has to call them. They pre-warm the shared cache so user
 * requests for best-sellers / etsy-trends are cheap (cache reads, Q11 = 1 credit).
 *
 * Quota discipline (BR-P3-CRON-01): every refresh takes a `UsageCounter` already constructed
 * with the CRON sub-cap (env.ETSY_CRON_CAP, default 2000). When `consume` throws
 * QuotaExceededError, the run stops and defers remaining seeds to the next trigger — it is
 * idempotent (each keyword/category cached independently), so a partial run just resumes.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { EtsyClient, EtsyListing } from './types';
import type { EtsyCache, KeywordHistoryStore } from './cache';
import { cacheKeys, TTL, normalize } from './cache';
import { QuotaExceededError } from './client';
import { getEstimation } from './estimationContract';
import type { EtsyTrendsResponse, BestSellersResponse, TrendRow, BestSellerRow } from './types';
import { SEED_CATEGORIES, type SeedCategory } from './seeds';
import type { ShopPulseStore } from './shopPulse';
import { shopVelocity } from './shopPulse';
import { upsertCalibrationFactor } from '../calibration/calibrationJob';
import { runPool } from './concurrency';
import type { SeriesRepo } from '../../repositories/seriesRepo';
import { shopSnapshotPoints, keywordTrendPoints } from '../history/cronSeries';
import { backfillShopReviews } from '../history/reviewBackfill';
import { readShopVelocity } from '../history/velocity';
import { bucketDays } from '../history/buckets';

export interface RefreshDeps {
  client: EtsyClient;
  cache: EtsyCache;
  history: KeywordHistoryStore;
  /**
   * Weekly shop-pulse store (Nhịp B) — records REAL public shop counters for sales velocity.
   * Optional/back-compat: absent → best-sellers skips shop_pulse + sales-velocity (behaves as before).
   */
  shopPulse?: ShopPulseStore;
  /**
   * Raw D1 handle, used to UPSERT public review-rate calibration factors. Optional/back-compat:
   * absent → public calibration is skipped (behaves as before).
   */
  db?: D1Database;
  /**
   * Unified time-series store (vierank-history `metric_series`). When present the cron DUAL-WRITES
   * its snapshots here (keyword demand/price weekly; shop counters daily) at ZERO extra Etsy cost —
   * this is the durable, "add a metric without a migration" home for history. Optional/back-compat:
   * absent → only the legacy keywords_cache/shop_pulse writes happen.
   */
  series?: SeriesRepo;
  /**
   * Shared, mutable budget for the one-time review-timeline BACKFILL (deep history from public
   * reviews). Each shop newly backfilled decrements `remaining`; at 0 the cron stops starting new
   * backfills this run (idempotent skips are free). Spreads the heavy pagination across days so the
   * Etsy quota is never drained. Absent → no backfill. Only consulted when `series` is also set.
   */
  backfillBudget?: { remaining: number };
  /** Max review pages per shop during backfill (default 20 ≈ 2000 reviews). */
  reviewBackfillMaxPages?: number;
  /** Shops sampled per category in best-sellers (discovery feed for the accumulator). Default 20. */
  shopsPerCategory?: number;
  /** Lead keywords per category used to discover candidate shops. Default 3. */
  leadKeywords?: number;
  /** Injectable clock (epoch ms) for deterministic tests; defaults to Date.now(). */
  now?: number;
  /**
   * Max Etsy calls in flight at once during a sweep. Default 1 (fully sequential — preserves the
   * legacy ordering/quota semantics the unit tests assert). The cron passes a higher value
   * (env.ETSY_REFRESH_CONCURRENCY, default 8) so a research half finishes in ~1 min instead of
   * ~13 min. Physical RPS stays bounded by the key pool's per-key gate regardless of this value.
   */
  concurrency?: number;
}

/** Minimum aggregate sold sample (across a category's sampled shops) to trust a public review-rate. */
const CALIBRATION_MIN_SAMPLE = 100;

/**
 * Whitespace opportunity score 0-100 (cron data-strategy report §3, Nhịp A) — PURE + testable.
 *
 * A good business idea = high DEMAND, low SUPPLY, few NEW entrants. We start from the demand
 * index (already 0-100) and subtract two penalties:
 *   - supply penalty: log-scaled by `resultCount` (market size). Log scaling because supply spans
 *     orders of magnitude (hundreds → hundreds of thousands); a linear penalty would zero-out every
 *     mature market. `25 * log10(1+count)/log10(1+SUPPLY_SCALE)` → ~25 pts at the saturation scale.
 *   - entry-velocity penalty: linear in the SAMPLED `newListings7d` (how fast rivals pour in =
 *     saturation speed). Capped contribution so one busy week can't dominate.
 * Result is clamped to [0,100]. Higher = more whitespace (demand the supply/entry hasn't caught).
 */
export function whitespaceScore(input: {
  demandIndex: number;
  resultCount: number;
  newListings7d: number;
}): number {
  const SUPPLY_SCALE = 200_000; // ~ saturation count where supply penalty maxes out
  const supplyPenalty =
    input.resultCount > 0
      ? (25 * Math.log10(1 + input.resultCount)) / Math.log10(1 + SUPPLY_SCALE)
      : 0;
  // Each new sampled listing in the last 7d costs 2 pts, capped at 25 (heavy entry velocity).
  const entryVelocityPenalty = Math.min(25, Math.max(0, input.newListings7d) * 2);
  const raw = input.demandIndex - supplyPenalty - entryVelocityPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Estimate reviews in the trailing 90 days from a sampled review page (newest-first, capped at the
 * page `limit`). PURE + testable.
 *
 * Why not a plain `count within 90d`: `getReviewsByShop` returns only the N most-recent reviews
 * (N ≤ limit, default 100). For any shop that earns ≥ limit reviews per 90 days — i.e. every real
 * best-seller — all N sampled reviews fall inside the window, so the count CLIPS at the sample size
 * and every busy shop reports the SAME number (the root cause of the identical "Est. sales"). Here we
 * detect that saturation (hit the page cap AND every sampled review is within 90d) and instead
 * extrapolate from the sampled review CADENCE: span the newest→oldest sampled timestamps and project
 * the per-day rate across 90 days. When NOT saturated, the direct 90d count is already accurate.
 * Reuses the page we already fetched → ZERO extra Etsy calls.
 */
export function reviews90dFromSample(timestamps: number[], nowSec: number, sampleLimit = 100): number {
  const ts = timestamps.filter((t) => Number.isFinite(t)).sort((a, b) => b - a); // newest first
  if (ts.length === 0) return 0;
  const cutoff = nowSec - 90 * 86_400;
  const within90 = ts.filter((t) => t >= cutoff).length;
  // Not saturated → the count is the real number of reviews in the window.
  if (ts.length < sampleLimit || within90 < ts.length) return within90;
  // Saturated: the shop gets MORE than `ts.length` reviews per 90d → extrapolate from the cadence.
  const spanDays = Math.max(1, (ts[0] - ts[ts.length - 1]) / 86_400);
  return Math.round((ts.length / spanDays) * 90);
}

/** Median of a numeric array (sorted copy); 0 for empty. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Percentile (0-1) via nearest-rank on a sorted copy; 0 for empty. */
function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx];
}

/** Price of a listing in CENTS (amount/divisor → dollars → cents), or null when absent/invalid. */
function priceCents(l: EtsyListing): number | null {
  const p = l.price;
  if (!p || !p.divisor) return null;
  return Math.round((p.amount / p.divisor) * 100);
}

export interface RefreshResult {
  processed: number;
  deferred: number;
  /** True when the cron sub-cap stopped the run early (remaining seeds deferred). */
  quotaHit: boolean;
}

function priceVal(p?: { amount: number; divisor: number }): number {
  return p && p.divisor ? p.amount / p.divisor : 0;
}

const COUNTRY_CODES: Record<string, string> = {
  'United States': 'US', 'United Kingdom': 'GB', 'Canada': 'CA', 'Australia': 'AU',
  'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL',
  'Poland': 'PL', 'India': 'IN', 'China': 'CN', 'Japan': 'JP', 'Brazil': 'BR',
  'Mexico': 'MX', 'New Zealand': 'NZ', 'Ireland': 'IE', 'Sweden': 'SE', 'Denmark': 'DK',
  'Norway': 'NO', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT', 'Portugal': 'PT',
  'Greece': 'GR', 'Finland': 'FI', 'Czech Republic': 'CZ', 'Romania': 'RO', 'Hungary': 'HU',
  'Turkey': 'TR', 'South Korea': 'KR', 'Taiwan': 'TW', 'Singapore': 'SG', 'Israel': 'IL',
  'Vietnam': 'VN', 'Thailand': 'TH', 'Philippines': 'PH', 'South Africa': 'ZA',
  'Ukraine': 'UA', 'Argentina': 'AR', 'Colombia': 'CO', 'Chile': 'CL', 'Indonesia': 'ID',
};

function toCountryCode(name: string | null | undefined): string {
  if (!name) return '';
  return COUNTRY_CODES[name] ?? name.substring(0, 2).toUpperCase();
}

/**
 * Build `keywords_cache` snapshots + per-category `trends:` KV for the seed keywords.
 * Each seed keyword: findActiveListings sample → demandScore → snapshot row + trendDelta.
 */
export async function refreshTrends(
  deps: RefreshDeps,
  seeds: SeedCategory[] = SEED_CATEGORIES
): Promise<RefreshResult> {
  const est = await getEstimation();

  // Flatten (category, keyword) pairs in seed order so a sequential run (concurrency=1) keeps the
  // legacy ordering, and a concurrent run still processes keywords as workers free up.
  const work = seeds.flatMap((cat) => cat.keywords.map((kw) => ({ cat, kw })));

  interface TrendOut {
    catName: string;
    taxonomyId: number | null;
    row: TrendRow;
  }

  const { results, stopped } = await runPool<{ cat: SeedCategory; kw: string }, TrendOut>(
    work,
    deps.concurrency ?? 1,
    async ({ cat, kw }) => {
      try {
        const page = await deps.client.findActiveListings({ keywords: kw, sortOn: 'score', limit: 25 });
        const sample = page.results ?? [];
        const faves = sample.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
        // REAL traffic: sum lifetime `views` across the sampled top-N listings. This is the
        // primary demand signal (far better than faves, which are frequently 0).
        const views = sample.reduce((a, l) => a + (l.views ?? 0), 0);
        const demand = est.demandScore({
          resultCount: page.count ?? sample.length,
          aggregateReviewVelocity: Math.round(faves / 1000),
          favoritesSignal: faves,
          aggregateViews: views,
        });
        const competition = est.competitionLevel(page.count ?? sample.length);
        const prior = await deps.history.prior(kw, 6 * 86_400);
        const trend = est.trendDelta(demand.score, prior ? prior.demandScore : null);

        // --- Nhịp A market pulse from the same sampled top-N listings (ZERO extra Etsy calls) ---
        const resultCount = page.count ?? sample.length;
        const cents = sample.map(priceCents).filter((c): c is number => c != null);
        const priceMedian = cents.length ? median(cents) : undefined;
        const priceP25 = cents.length ? percentile(cents, 0.25) : undefined;
        const priceP75 = cents.length ? percentile(cents, 0.75) : undefined;
        const viewVals = sample.map((l) => l.views ?? 0);
        const medianViews = sample.length ? median(viewVals) : undefined;
        const hasVariationsPct = sample.length
          ? Math.round((100 * sample.filter((l) => l.has_variations).length) / sample.length)
          : undefined;
        // SAMPLED proxy for new-entrant velocity: count sampled listings created in the last 7d.
        // It only sees the score-sorted top-N (not the whole market), so it under-counts — used as
        // a relative saturation-speed signal, not an absolute new-listings-per-week figure.
        const nowSec = Math.floor((deps.now ?? Date.now()) / 1000);
        const weekAgoSec = nowSec - 7 * 86_400;
        const newListings7d = sample.filter(
          (l) => typeof l.created_timestamp === 'number' && l.created_timestamp >= weekAgoSec
        ).length;
        const whitespace = whitespaceScore({
          demandIndex: demand.score,
          resultCount,
          newListings7d,
        });

        // Idempotent per (keyword, ISO-week): a re-run/retry this week upserts instead of
        // appending a duplicate point (which would skew the forecast OLS).
        await deps.history.insertWeekly(
          {
            keyword: kw,
            categoryId: cat.taxonomyId ?? null,
            demandScore: demand.score,
            resultCount,
            competition,
            aggViews: views,
            priceMedian,
            priceP25,
            priceP75,
            medianViews,
            hasVariationsPct,
            newListings7d,
          },
          deps.now
        );

        // Dual-write to the durable unified series (zero extra Etsy calls). Idempotent per ISO-week.
        if (deps.series) {
          await deps.series.bulkUpsert(
            keywordTrendPoints(
              kw,
              {
                demandScore: demand.score,
                resultCount,
                priceMedian,
                medianViews,
                newListings7d,
                whitespace,
                categoryId: cat.taxonomyId ?? null,
              },
              nowSec
            )
          );
        }

        const row: TrendRow = {
          keyword: kw,
          category: cat.name,
          demandIndex: demand.score,
          trend: trend.direction,
          change: trend.change,
          priceMedian: priceMedian ?? null,
          priceP25: priceP25 ?? null,
          priceP75: priceP75 ?? null,
          medianViews: medianViews ?? null,
          hasVariationsPct: hasVariationsPct ?? null,
          newListings7d,
          whitespace,
          estimated: { demandIndex: true, change: true },
        };
        return { catName: cat.name, taxonomyId: cat.taxonomyId ?? null, row };
      } catch (err) {
        // Quota exhaustion is the STOP signal (defer the rest to the next run); any other error on
        // one keyword is skipped (idempotent — the next run retries it).
        if (err instanceof QuotaExceededError) throw err;
        return undefined;
      }
    },
    (err) => err instanceof QuotaExceededError
  );

  // Regroup results by category (preserving seed order via the flattened work list) for the
  // per-category trends KV, and build the global ranking.
  const allRows: TrendRow[] = [];
  const byCat = new Map<string, { taxonomyId: number | null; rows: TrendRow[] }>();
  for (const cat of seeds) byCat.set(cat.name, { taxonomyId: cat.taxonomyId ?? null, rows: [] });
  for (const { catName, taxonomyId, row } of results) {
    const g = byCat.get(catName) ?? { taxonomyId, rows: [] };
    g.rows.push(row);
    byCat.set(catName, g);
    allRows.push(row);
  }

  for (const { taxonomyId, rows } of byCat.values()) {
    // Per-category KV (used by future category filtering); also write the global 'all' below.
    if (rows.length && taxonomyId) {
      const catPayload: EtsyTrendsResponse = {
        cached: false,
        filter: null,
        trends: rows,
        buildingHistory: rows.every((r) => r.change === '—'),
      };
      await deps.cache.put(cacheKeys.trends(taxonomyId), catPayload, TTL.trends);
    }
  }

  const processed = results.length;
  // Everything not successfully processed is deferred — whether skipped on a non-quota error or
  // never started because quota stopped the sweep. (Identical to the legacy countRemaining total.)
  const deferred = work.length - processed;
  const quotaHit = stopped;

  const payload: EtsyTrendsResponse = {
    cached: false,
    filter: null,
    trends: allRows.sort((a, b) => b.demandIndex - a.demandIndex),
    buildingHistory: allRows.length > 0 && allRows.every((r) => r.change === '—'),
  };
  await deps.cache.put(cacheKeys.trends('all'), payload, TTL.trends);

  return { processed, deferred, quotaHit };
}

/**
 * Build per-category `bestsellers:` KV: top shops by review-velocity (the only public sales
 * proxy). Also writes a global `popular` ranking for the on-demand fallback.
 */
export async function refreshBestSellers(
  deps: RefreshDeps,
  seeds: SeedCategory[] = SEED_CATEGORIES
): Promise<RefreshResult> {
  const est = await getEstimation();

  // Each category is an independent sequential chain (lead search → per-shop getShop+reviews →
  // calibration → per-category KV). Run the CATEGORIES concurrently (bounded) so 15 categories'
  // chains interleave through the key pool instead of running back-to-back. Physical RPS stays
  // bounded by the per-key gate. concurrency=1 (default) preserves the legacy sequential order.
  interface BestOut {
    rows: BestSellerRow[];
  }

  const { results, stopped } = await runPool<SeedCategory, BestOut>(
    seeds,
    deps.concurrency ?? 1,
    async (cat) => {
    const rows: BestSellerRow[] = [];
    // Per-category PUBLIC calibration aggregate: Σreview_count / Σsold_count across this
    // category's sampled shops → REAL review-rate (no OAuth needed). Only AGGREGATE sums are
    // kept/persisted — never any single shop's raw counters (privacy by aggregation).
    let sumReviewCount = 0;
    let sumSoldCount = 0;
    try {
      // Sample top listings across the first 3 lead keywords to discover more candidate shops.
      // Using multiple keywords reduces single-keyword sampling bias and surfaces a wider pool.
      const leads = cat.keywords.slice(0, Math.max(1, deps.leadKeywords ?? 3));
      const pages = await Promise.all(
        leads.map((kw) => deps.client.findActiveListings({ keywords: kw, sortOn: 'score', limit: 25 }))
      );
      const page = pages[0]; // used for avg price reference below
      const allListings = pages.flatMap((p) => p.results ?? []);
      const shopIds = [...new Set(allListings.map((l) => l.shop_id).filter((s): s is number => !!s))].slice(
        0,
        Math.max(1, deps.shopsPerCategory ?? 20)
      );

      let rank = 1;
      for (const shopId of shopIds) {
        const shop = await deps.client.getShop(shopId);
        const reviewsPage = await deps.client.getReviewsByShop(shopId, { limit: 100 });
        const reviews = reviewsPage.results ?? [];
        // Unsaturated 90-day review estimate (see reviews90dFromSample) — extrapolates from review
        // cadence when the 100-review sample is saturated, so busy shops no longer all clip to the
        // same number (the cause of every shop showing an identical "Est. sales").
        const nowSec = Math.floor((deps.now ?? Date.now()) / 1000);
        const recent = reviews90dFromSample(reviews.map((r) => r.created_timestamp), nowSec);
        const sales = est.salesEstimate({
          reviewsLast90d: recent,
          avgPrice: priceVal((page.results ?? [])[0]?.price),
          categoryId: cat.taxonomyId ?? null,
        });

        // --- Nhịp B shop pulse: record this week's REAL public counters (ZERO extra Etsy calls,
        // reuses the `shop` object already fetched). The week-over-week Δ of sold_count is REAL
        // sales velocity (not an estimate). Skipped when no shopPulse store is wired (back-compat).
        let soldPerWeek: number | null = null;
        let soldVelocityConfidence: BestSellerRow['soldVelocityConfidence'];
        if (deps.shopPulse) {
          // Idempotent per (shop, UTC-day): a same-day re-run upserts instead of duplicating,
          // keeping the sales-velocity delta clean. Daily cadence → 2nd snapshot in ~1 day.
          await deps.shopPulse.insertDaily(
            {
              shopId,
              categoryId: cat.taxonomyId ?? null,
              soldCount: shop.transaction_sold_count ?? null,
              reviewCount: shop.review_count ?? null,
              activeListings: shop.listing_active_count ?? null,
              numFavorers: shop.num_favorers ?? null,
              reviewAverage: shop.review_average ?? null,
            },
            deps.now
          );
          // REAL sales velocity from the recorded series (needs 2+ snapshots → else 'building').
          const velocity = shopVelocity(await deps.shopPulse.series(shopId));
          soldPerWeek = velocity.soldPerWeek;
          soldVelocityConfidence = velocity.confidence;
        }

        // --- Durable unified series (vierank-history) ---
        if (deps.series) {
          // Daily public-counter snapshot (zero extra Etsy calls — reuses `shop`).
          await deps.series.bulkUpsert(
            shopSnapshotPoints(
              shopId,
              {
                soldCount: shop.transaction_sold_count ?? null,
                reviewCount: shop.review_count ?? null,
                activeListings: shop.listing_active_count ?? null,
                numFavorers: shop.num_favorers ?? null,
                categoryId: cat.taxonomyId ?? null,
              },
              nowSec
            )
          );
          // One-time deep backfill of this shop's monthly sales cadence from its full public review
          // history — turns "building" into multi-year history on first sight. Budget-gated so the
          // extra pagination spreads across days and never drains the quota; idempotent skips are free.
          if (deps.backfillBudget && deps.backfillBudget.remaining > 0) {
            try {
              const r = await backfillShopReviews(
                { client: deps.client, series: deps.series },
                shopId,
                { categoryId: cat.taxonomyId ?? null, maxPages: deps.reviewBackfillMaxPages }
              );
              if (!r.skipped) deps.backfillBudget.remaining -= 1;
            } catch (err) {
              if (err instanceof QuotaExceededError) throw err;
              // Non-quota backfill error: skip this shop's deep history (next run retries it).
            }
          }
          // READ the blended velocity from the durable store: live sold_count delta when ≥2 daily
          // points exist, else the backfilled monthly-review cadence as a proxy — so "Selling Now"
          // has a real ranking signal from day one instead of every shop showing "building".
          const sv = await readShopVelocity(deps.series, shopId, (b) => bucketDays(b, 'month'));
          if (sv.perWeek != null) {
            soldPerWeek = sv.perWeek;
            soldVelocityConfidence = sv.confidence;
          }
        }

        // Fold this shop's REAL public counters into the category calibration aggregate.
        sumReviewCount += shop.review_count ?? 0;
        sumSoldCount += shop.transaction_sold_count ?? 0;

        const row: BestSellerRow = {
          rank: rank++,
          name: shop.shop_name,
          country: shop.shop_location_country ?? '—',
          countryCode: toCountryCode(shop.shop_location_country),
          rating: shop.review_average ?? 0,
          opened: shop.created_timestamp
            ? new Date(shop.created_timestamp * 1000).toLocaleDateString('en-US')
            : '—',
          listings: shop.listing_active_count ?? 0,
          faves: shop.num_favorers ?? 0,
          sales: sales.monthlySales * 12,
          // REAL public fields (transaction_sold_count + its week-over-week slope). NOT estimates.
          soldCount: shop.transaction_sold_count ?? undefined,
          soldPerWeek,
          soldVelocityConfidence,
        };
        rows.push(row);
      }
    } catch (err) {
      // Quota exhaustion stops the whole sweep (defer remaining categories to the next run); any
      // other error skips THIS category (return undefined → counted as deferred) and lets the pool
      // continue with the rest.
      if (err instanceof QuotaExceededError) throw err;
      return undefined;
    }

    // PUBLIC review-rate calibration (no OAuth): once the aggregate sold sample is big enough and
    // we know the category, persist Σreviews/Σsold as this category's review-rate factor. Reuses
    // the SAME upsert the OAuth calibration job uses, so estimates everywhere improve.
    if (deps.db && cat.taxonomyId != null && sumSoldCount >= CALIBRATION_MIN_SAMPLE) {
      const reviewRate = sumReviewCount / sumSoldCount;
      await upsertCalibrationFactor(deps.db, cat.taxonomyId, reviewRate, sumSoldCount);
    }

    if (rows.length) {
      // "Best sellers" = biggest ALL-TIME sellers → rank by REAL lifetime sales
      // (transaction_sold_count); shops with no public counter fall back to the estimated annual
      // sales. This is deliberately a DIFFERENT key from "Selling Now" (which ranks by soldPerWeek
      // velocity) so the two views surface different shops instead of looking identical.
      const rankKey = (r: BestSellerRow): number => r.soldCount ?? r.sales;
      rows.sort((a, b) => rankKey(b) - rankKey(a) || b.faves - a.faves).forEach((r, i) => (r.rank = i + 1));
      const payload: BestSellersResponse = {
        cached: false,
        category: cat.name,
        view: 'shops',
        shops: rows,
        estimated: { sales: true, ranking: true },
      };
      // Key on the category name so the FE dropdown selection resolves for every category;
      // also key on taxonomyId when known (used by other lookups). Pin hardTtl = soft so shop
      // content is never served past Etsy's 24h display cap (the daily cron refreshes well within).
      await deps.cache.put(cacheKeys.bestsellers(normalize(cat.name)), payload, TTL.bestsellers, { hardTtl: TTL.bestsellers });
      if (cat.taxonomyId) {
        await deps.cache.put(cacheKeys.bestsellers(cat.taxonomyId), payload, TTL.bestsellers, { hardTtl: TTL.bestsellers });
      }
    }

    return { rows };
    }
  );

  // Accumulate every category's shops into the global ranking. `processed` = shops processed;
  // `deferred` = categories not completed (skipped on error or never started after a quota stop).
  const allRows: BestSellerRow[] = results.flatMap((r) => r.rows);
  const processed = allRows.length;
  const deferred = seeds.length - results.length;
  const quotaHit = stopped;

  // Global popular ranking for on-demand fallback (spec §4.5 option a). Same rule as per-category:
  // rank by REAL lifetime sales (transaction_sold_count), else the estimated annual sales — distinct
  // from "Selling Now" which ranks the same shops by soldPerWeek velocity. A shop can rank in
  // several seed categories, so dedupe by name (keeping its best entry) → the global list never
  // repeats a shop (was both a wrong-data and an FE duplicate-key issue).
  const popKey = (r: BestSellerRow): number => r.soldCount ?? r.sales;
  const seenShop = new Set<string>();
  const popular: BestSellerRow[] = allRows
    .sort((a, b) => popKey(b) - popKey(a) || b.faves - a.faves)
    .filter((r) => {
      const k = (r.name ?? '').toLowerCase().trim();
      if (!k || seenShop.has(k)) return false;
      seenShop.add(k);
      return true;
    });
  popular.forEach((r, i) => (r.rank = i + 1));
  const popPayload: BestSellersResponse = {
    cached: false,
    category: null,
    view: 'shops',
    shops: popular.slice(0, 10),
    estimated: { sales: true, ranking: true },
  };
  await deps.cache.put(cacheKeys.bestsellers('popular'), popPayload, TTL.bestsellers, { hardTtl: TTL.bestsellers });

  return { processed, deferred, quotaHit };
}

/** Refresh the taxonomy tree cache (cheap; weekly). */
export async function refreshTaxonomy(deps: RefreshDeps): Promise<void> {
  const nodes = await deps.client.getSellerTaxonomyNodes();
  await deps.cache.put(cacheKeys.taxonomy(), nodes, TTL.taxonomy);
}


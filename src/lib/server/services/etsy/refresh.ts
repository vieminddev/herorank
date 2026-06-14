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
import type { EtsyClient } from './types';
import type { EtsyCache, KeywordHistoryStore } from './cache';
import { cacheKeys, TTL, normalize } from './cache';
import { QuotaExceededError } from './client';
import { getEstimation } from './estimationContract';
import type { EtsyTrendsResponse, BestSellersResponse, TrendRow, BestSellerRow } from './types';
import { SEED_CATEGORIES, type SeedCategory } from './seeds';

export interface RefreshDeps {
  client: EtsyClient;
  cache: EtsyCache;
  history: KeywordHistoryStore;
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

/**
 * Build `keywords_cache` snapshots + per-category `trends:` KV for the seed keywords.
 * Each seed keyword: findActiveListings sample → demandScore → snapshot row + trendDelta.
 */
export async function refreshTrends(
  deps: RefreshDeps,
  seeds: SeedCategory[] = SEED_CATEGORIES
): Promise<RefreshResult> {
  const est = await getEstimation();
  let processed = 0;
  let deferred = 0;
  let quotaHit = false;

  const allRows: TrendRow[] = [];

  outer: for (const cat of seeds) {
    const catRows: TrendRow[] = [];
    for (const kw of cat.keywords) {
      try {
        const page = await deps.client.findActiveListings({ keywords: kw, sortOn: 'score', limit: 25 });
        const sample = page.results ?? [];
        const faves = sample.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
        const demand = est.demandScore({
          resultCount: page.count ?? sample.length,
          aggregateReviewVelocity: Math.round(faves / 1000),
          favoritesSignal: faves,
        });
        const competition = est.competitionLevel(page.count ?? sample.length);
        const prior = await deps.history.prior(kw, 6 * 86_400);
        const trend = est.trendDelta(demand.score, prior ? prior.demandScore : null);

        await deps.history.insert({
          keyword: kw,
          categoryId: cat.taxonomyId ?? null,
          demandScore: demand.score,
          resultCount: page.count ?? sample.length,
          competition,
        });

        const row: TrendRow = {
          keyword: kw,
          category: cat.name,
          demandIndex: demand.score,
          trend: trend.direction,
          change: trend.change,
          estimated: { demandIndex: true, change: true },
        };
        catRows.push(row);
        allRows.push(row);
        processed++;
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          quotaHit = true;
          deferred = countRemaining(seeds, cat, kw);
          break outer;
        }
        // Non-quota error on one keyword → skip it, keep going (idempotent next run).
        deferred++;
      }
    }
    // Per-category KV (used by future category filtering); also write the global 'all' below.
    if (catRows.length && cat.taxonomyId) {
      const catPayload: EtsyTrendsResponse = {
        cached: false,
        filter: null,
        trends: catRows,
        buildingHistory: catRows.every((r) => r.change === '—'),
      };
      await deps.cache.put(cacheKeys.trends(cat.taxonomyId), catPayload, TTL.trends);
    }
  }

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
  let processed = 0;
  let deferred = 0;
  let quotaHit = false;
  const popular: BestSellerRow[] = [];

  outer: for (const cat of seeds) {
    const rows: BestSellerRow[] = [];
    try {
      // Sample top listings for the category's lead keyword to discover candidate shops.
      const lead = cat.keywords[0] ?? cat.name;
      const page = await deps.client.findActiveListings({ keywords: lead, sortOn: 'score', limit: 25 });
      const shopIds = [...new Set((page.results ?? []).map((l) => l.shop_id).filter((s): s is number => !!s))].slice(0, 10);

      let rank = 1;
      for (const shopId of shopIds) {
        const shop = await deps.client.getShop(shopId);
        const reviewsPage = await deps.client.getReviewsByShop(shopId, { limit: 100 });
        const reviews = reviewsPage.results ?? [];
        const cutoff = Math.floor(Date.now() / 1000) - 90 * 86_400;
        const recent = reviews.filter((r) => r.created_timestamp >= cutoff).length;
        const sales = est.salesEstimate({
          reviewsLast90d: recent,
          avgPrice: priceVal((page.results ?? [])[0]?.price),
          categoryId: cat.taxonomyId ?? null,
        });
        const row: BestSellerRow = {
          rank: rank++,
          name: shop.shop_name,
          country: shop.shop_location_country ?? '—',
          countryCode: '',
          rating: shop.review_average ?? 0,
          opened: shop.created_timestamp
            ? new Date(shop.created_timestamp * 1000).toLocaleDateString('en-US')
            : '—',
          listings: shop.listing_active_count ?? 0,
          faves: shop.num_favorers ?? 0,
          sales: sales.monthlySales * 12,
        };
        rows.push(row);
        popular.push(row);
        processed++;
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        quotaHit = true;
        deferred = seeds.length;
        break outer;
      }
      deferred++;
    }

    if (rows.length && cat.taxonomyId) {
      rows.sort((a, b) => b.sales - a.sales).forEach((r, i) => (r.rank = i + 1));
      const payload: BestSellersResponse = {
        cached: false,
        category: cat.name,
        view: 'shops',
        shops: rows,
        estimated: { sales: true, ranking: true },
      };
      await deps.cache.put(cacheKeys.bestsellers(cat.taxonomyId), payload, TTL.bestsellers);
      await deps.cache.put(cacheKeys.bestsellers(normalize(cat.name)), payload, TTL.bestsellers);
    }
  }

  // Global popular ranking for on-demand fallback (spec §4.5 option a).
  popular.sort((a, b) => b.sales - a.sales).forEach((r, i) => (r.rank = i + 1));
  const popPayload: BestSellersResponse = {
    cached: false,
    category: null,
    view: 'shops',
    shops: popular.slice(0, 10),
    estimated: { sales: true, ranking: true },
  };
  await deps.cache.put(cacheKeys.bestsellers('popular'), popPayload, TTL.bestsellers);

  return { processed, deferred, quotaHit };
}

/** Refresh the taxonomy tree cache (cheap; weekly). */
export async function refreshTaxonomy(deps: RefreshDeps): Promise<void> {
  const nodes = await deps.client.getSellerTaxonomyNodes();
  await deps.cache.put(cacheKeys.taxonomy(), nodes, TTL.taxonomy);
}

function countRemaining(seeds: SeedCategory[], fromCat: SeedCategory, fromKw: string): number {
  let remaining = 0;
  let started = false;
  for (const cat of seeds) {
    for (const kw of cat.keywords) {
      if (cat === fromCat && kw === fromKw) started = true;
      if (started) remaining++;
    }
  }
  return remaining;
}

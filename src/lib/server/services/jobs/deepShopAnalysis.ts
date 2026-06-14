/**
 * Deep shop analysis (Engineer F owns) — §2.1/§2.2, the heavy off-request-path variant.
 *
 * Where Phase 3's `shop-analyzer` is bounded (cap ~100 listings/reviews so it fits one request),
 * the DEEP variant paginates the FULL shop (all listings + all reviews), runs per-listing
 * estimation + category aggregation, and returns a richer result JSON. It runs inside the queue
 * consumer (or the inline `waitUntil` fallback), NOT a request — so it can take many Etsy calls.
 *
 * Quota: every page fetch draws 1 from the SHARED usageCounter (USER budget — the job is user-
 * initiated, NOT the cron sub-cap). When the counter throws QuotaExceededError mid-job, we throw
 * `DeepAnalysisQuotaError` so the consumer can mark the job `deferred` and re-queue (BR-P4-01 /
 * BA §2.2 step 6) — partial work is discarded; nothing is charged.
 *
 * Pure-ish: all I/O via injected deps (client/cache/usage/estimation), so it is unit-testable
 * with fakes. `runDeepShopAnalysis(deps, shop)` returns the result JSON; the consumer persists it.
 */
import type { EtsyClient, EtsyListing, EtsyReview, UsageCounter } from '../etsy/types';
import type { EtsyCache } from '../etsy/cache';
import { cacheKeys, TTL } from '../etsy/cache';
import { QuotaExceededError } from '../etsy/client';
import { getEstimation } from '../etsy/estimationContract';
import {
  loadReviewRateProvider,
  noopReviewRateProvider,
  type ReviewRateProvider,
} from '../calibration/reviewRateProvider';
import type { D1Database } from '@cloudflare/workers-types';

/** Raised when the user budget is exhausted mid-job → consumer defers + re-queues. */
export class DeepAnalysisQuotaError extends Error {
  readonly code = 'ETSY_QUOTA' as const;
  constructor() {
    super('Etsy quota exhausted during deep analysis');
    this.name = 'DeepAnalysisQuotaError';
  }
}

/** Raised when the shop handle does not resolve — consumer marks failed (no charge, no retry). */
export class ShopNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(shop: string) {
    super(`Shop not found: ${shop}`);
    this.name = 'ShopNotFoundError';
  }
}

export interface DeepShopAnalysisDeps {
  client: EtsyClient;
  cache: EtsyCache;
  usage: UsageCounter;
  /** Optional D1 handle for loading calibration factors. Absent → noop provider (Phase-3 fallback). */
  db?: D1Database;
  /** Directly injected provider (overrides db loader; primarily for tests). */
  reviewRateProvider?: ReviewRateProvider;
  /** Safety bound so a pathological shop can't loop forever (pages, not items). */
  maxPages?: number;
  pageSize?: number;
}

export interface DeepCategoryBreakdown {
  categoryId: number | null;
  listings: number;
  estimatedMonthlySales: number;
}

export interface DeepShopAnalysisResult {
  shopId: number;
  name: string;
  activeListings: number;
  analyzedListings: number;
  totalReviews: number;
  reviewsLast90d: number;
  avgRating: number;
  estimatedMonthlySales: number;
  estimatedMonthlyRevenue: string;
  estimatedAnnualSales: number;
  categories: DeepCategoryBreakdown[];
  topListings: Array<{
    id: number;
    title: string;
    estimatedMonthlySales: number;
    faves: number;
    grade: string;
  }>;
  estimated: { sales: true; revenue: true; scores: true };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // up to 2000 listings/reviews — "deep" but bounded against abuse.
const SEC_90D = 90 * 86_400;

function priceVal(p?: EtsyListing['price']): number {
  return p && p.divisor ? p.amount / p.divisor : 0;
}

function reviewsLast90d(reviews: EtsyReview[], now: number): number {
  const cutoff = Math.floor(now / 1000) - SEC_90D;
  return reviews.filter((r) => r.created_timestamp >= cutoff).length;
}

function formatMoney(value: number, currency = 'USD'): string {
  const sym = currency === 'USD' ? '$' : '';
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(2)}`;
}

function gradeFromScore(avg: number): string {
  if (avg >= 90) return 'A';
  if (avg >= 80) return 'B';
  if (avg >= 70) return 'C';
  if (avg >= 60) return 'D';
  return 'F';
}

/** Paginate a `{ count, results }` reader, consuming 1 quota per page. */
async function paginate<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ count: number; results: T[] }>,
  usage: UsageCounter,
  pageSize: number,
  maxPages: number
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    try {
      await usage.consume(1);
    } catch (err) {
      if (err instanceof QuotaExceededError) throw new DeepAnalysisQuotaError();
      throw err;
    }
    const res = await fetchPage(offset, pageSize);
    const results = res.results ?? [];
    out.push(...results);
    offset += pageSize;
    if (results.length < pageSize || out.length >= (res.count ?? out.length)) break;
  }
  return out;
}

export async function runDeepShopAnalysis(
  deps: DeepShopAnalysisDeps,
  shopHandle: string,
  now: number = Date.now()
): Promise<DeepShopAnalysisResult> {
  const pageSize = deps.pageSize ?? PAGE_SIZE;
  const maxPages = deps.maxPages ?? MAX_PAGES;
  const est = await getEstimation();

  // Load calibration provider once per job (BR-P4-CAL-01).
  // Injected provider wins (tests); else load from D1 if available; else noop (Phase-3 fallback).
  const reviewProvider: ReviewRateProvider =
    deps.reviewRateProvider ??
    (deps.db ? await loadReviewRateProvider(deps.db) : noopReviewRateProvider);

  // Resolve shop (cache the name→id like the Phase 3 shop-analyzer does).
  const nameKey = cacheKeys.shopName(shopHandle);
  let shopId: number | null = null;
  const cachedId = await deps.cache.get<{ shopId: number }>(nameKey, now);
  if (cachedId?.fresh) shopId = cachedId.payload.shopId;
  if (shopId === null) {
    await deps.usage.consume(1).catch((err) => {
      if (err instanceof QuotaExceededError) throw new DeepAnalysisQuotaError();
      throw err;
    });
    const found = await deps.client.findShops({ shopName: shopHandle, limit: 1 });
    if (!found.length) throw new ShopNotFoundError(shopHandle);
    shopId = found[0].shop_id;
    await deps.cache.put(nameKey, { shopId }, TTL.shop, now);
  }

  // Shop meta (1 call).
  await deps.usage.consume(1).catch((err) => {
    if (err instanceof QuotaExceededError) throw new DeepAnalysisQuotaError();
    throw err;
  });
  const shop = await deps.client.getShop(shopId);
  const currency = shop.currency_code ?? 'USD';

  // FULL listings + reviews (paginated, USER budget).
  const listings = await paginate<EtsyListing>(
    (offset, limit) => deps.client.getActiveListingsByShop(shopId as number, { offset, limit }),
    deps.usage,
    pageSize,
    maxPages
  );
  const reviews = await paginate<EtsyReview>(
    (offset, limit) => deps.client.getReviewsByShop(shopId as number, { offset, limit }),
    deps.usage,
    pageSize,
    maxPages
  );

  const recent90 = reviewsLast90d(reviews, now);
  const prices = listings.map((l) => priceVal(l.price)).filter((p) => p > 0);
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const shopSales = est.salesEstimate({
    reviewsLast90d: recent90,
    avgPrice,
    categoryId: listings[0]?.taxonomy_id ?? null,
  }, reviewProvider);

  // Per-category aggregation across ALL listings.
  const byCategory = new Map<number | null, { listings: number; sales: number }>();
  const reviewsPerListing = listings.length ? recent90 / listings.length : 0;
  const topListings: DeepShopAnalysisResult['topListings'] = [];

  for (const l of listings) {
    const cat = l.taxonomy_id ?? null;
    const lp = priceVal(l.price);
    const lSales = est.salesEstimate({
      reviewsLast90d: Math.round(reviewsPerListing),
      avgPrice: lp,
      categoryId: cat,
    }, reviewProvider);
    const entry = byCategory.get(cat) ?? { listings: 0, sales: 0 };
    entry.listings++;
    entry.sales += lSales.monthlySales;
    byCategory.set(cat, entry);

    const audit = est.listingAudit(l);
    const avgScore =
      (audit.title.score + audit.tags.score + audit.images.score + audit.video.score + audit.description.score) / 5;
    topListings.push({
      id: l.listing_id,
      title: l.title,
      estimatedMonthlySales: lSales.monthlySales,
      faves: l.num_favorers ?? 0,
      grade: gradeFromScore(avgScore),
    });
  }

  topListings.sort((a, b) => b.estimatedMonthlySales - a.estimatedMonthlySales);

  const categories: DeepCategoryBreakdown[] = [...byCategory.entries()].map(([categoryId, v]) => ({
    categoryId,
    listings: v.listings,
    estimatedMonthlySales: v.sales,
  }));

  const sumRating = reviews.reduce((a, r) => a + r.rating, 0);
  const avgRating = reviews.length ? Math.round((sumRating / reviews.length) * 100) / 100 : (shop.review_average ?? 0);

  return {
    shopId,
    name: shop.shop_name,
    activeListings: shop.listing_active_count ?? listings.length,
    analyzedListings: listings.length,
    totalReviews: shop.review_count ?? reviews.length,
    reviewsLast90d: recent90,
    avgRating,
    estimatedMonthlySales: shopSales.monthlySales,
    estimatedMonthlyRevenue: formatMoney(shopSales.monthlySales * avgPrice, currency),
    estimatedAnnualSales: shopSales.monthlySales * 12,
    categories,
    topListings: topListings.slice(0, 20),
    estimated: { sales: true, revenue: true, scores: true },
  };
}

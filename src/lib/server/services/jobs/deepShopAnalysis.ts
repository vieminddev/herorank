/**
 * Deep shop analysis (Engineer F owns) — §2.1/§2.2, the heavy off-request-path variant.
 *
 * Where Phase 3's `shop-analyzer` route is bounded (caps ~100 listings/reviews so it fits one
 * request), the DEEP variant paginates the FULL shop (all listings + all reviews up to maxPages),
 * runs per-listing estimation + category aggregation, and returns the SAME response shape the
 * Shop Research page renders (`ShopAnalyzerResponse`) — just computed over the whole shop and with
 * many more displayed listings. It runs inside the queue consumer (or the inline `waitUntil`
 * fallback), NOT a request — so it can take many Etsy calls.
 *
 * CONTRACT: the result MUST be render-compatible with the quick analyzer (the page assigns
 * `shop = result` and reads `.stats`, `.tags`, `.listings`, `.reviews`, `.about`, …). It previously
 * returned a bespoke `{ topListings, categories[{categoryId}], estimatedMonthlySales }` shape that
 * the page could not render at all (every field it read was undefined) — that was the "deep doesn't
 * work" bug. Now it mirrors `ShopAnalyzerResponse` so deep === quick, only deeper.
 *
 * Quota: every page fetch draws 1 from the SHARED usageCounter (USER budget — the job is user-
 * initiated, NOT the cron sub-cap). When the counter throws QuotaExceededError mid-job, we throw
 * `DeepAnalysisQuotaError` so the consumer can mark the job `deferred` and re-queue (BR-P4-01 /
 * BA §2.2 step 6) — partial work is discarded; nothing is charged.
 *
 * Pure-ish: all I/O via injected deps (client/cache/usage/estimation), so it is unit-testable
 * with fakes. `runDeepShopAnalysis(deps, shop)` returns the result JSON; the consumer persists it.
 */
import type { EtsyClient, EtsyListing, EtsyReview, UsageCounter, ShopAnalyzerResponse } from '../etsy/types';
import type { EtsyCache } from '../etsy/cache';
import { cacheKeys, TTL } from '../etsy/cache';
import { QuotaExceededError } from '../etsy/client';
import { dedupeReviews } from '../etsy/reviews';
import { getEstimation } from '../etsy/estimationContract';
import { loadTaxonomyResolver } from '../etsy/taxonomyResolver';
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

/** Deep result is render-compatible with the quick shop-analyzer (the page renders both the same). */
export type DeepShopAnalysisResult = ShopAnalyzerResponse;

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // up to 2000 listings/reviews — "deep" but bounded against abuse.
const DISPLAY_LIMIT = 100; // listing rows returned (with media) — far more than quick's 20.
const MEDIA_BATCH = 100; // getListingsByListingIds batch size.
const SEC_90D = 90 * 86_400;

function priceVal(p?: EtsyListing['price']): number {
  return p && p.divisor ? p.amount / p.divisor : 0;
}

/**
 * Reviews in the trailing 90 days (sales-velocity signal). When the observed span is <90 days we
 * project the per-day rate out to 90 and take the larger of (true in-window count, projection) —
 * mirrors the quick analyzer so deep/quick agree.
 */
function reviewsLast90d(reviews: EtsyReview[], nowSec: number): number {
  if (!reviews.length) return 0;
  const ts = reviews
    .map((r) => r.created_timestamp)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (!ts.length) return 0;
  const cutoff = nowSec - SEC_90D;
  const within90 = ts.filter((t) => t >= cutoff).length;
  const spanDays = (ts[0] - ts[ts.length - 1]) / 86_400;
  if (spanDays >= 90) return within90;
  const projected = (ts.length / Math.max(1, spanDays)) * 90;
  return Math.round(Math.max(within90, projected));
}

function formatMoney(value: number, currency = 'USD'): string {
  const sym = currency === 'USD' ? '$' : '';
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(2)}`;
}

function formatDate(epochSec?: number): string {
  if (!epochSec) return '—';
  return new Date(epochSec * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function gradeFromScore(avg: number): string {
  if (avg >= 90) return 'A';
  if (avg >= 80) return 'B';
  if (avg >= 70) return 'C';
  if (avg >= 60) return 'D';
  return 'F';
}

/** Consume 1 quota unit, translating exhaustion into the deferrable DeepAnalysisQuotaError. */
async function consumeOne(usage: UsageCounter): Promise<void> {
  try {
    await usage.consume(1);
  } catch (err) {
    if (err instanceof QuotaExceededError) throw new DeepAnalysisQuotaError();
    throw err;
  }
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
    await consumeOne(usage);
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
  const nowSec = Math.floor(now / 1000);
  const est = await getEstimation();
  const { toTopLevel, nameOf } = await loadTaxonomyResolver(deps.client, deps.cache);

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
    await consumeOne(deps.usage);
    const found = await deps.client.findShops({ shopName: shopHandle, limit: 1 });
    if (!found.length) throw new ShopNotFoundError(shopHandle);
    shopId = found[0].shop_id;
    await deps.cache.put(nameKey, { shopId }, TTL.shop, { now });
  }

  // Shop meta (1 call).
  await consumeOne(deps.usage);
  const shop = await deps.client.getShop(shopId);
  const currency = shop.currency_code ?? 'USD';

  // FULL listings + reviews (paginated, USER budget).
  const listings = await paginate<EtsyListing>(
    (offset, limit) => deps.client.getActiveListingsByShop(shopId as number, { offset, limit }),
    deps.usage,
    pageSize,
    maxPages
  );
  const rawReviews = await paginate<EtsyReview>(
    (offset, limit) => deps.client.getReviewsByShop(shopId as number, { offset, limit }),
    deps.usage,
    pageSize,
    maxPages
  );
  // Collapse Etsy's per-transaction review duplication (8× identical rows on multi-item orders) —
  // for DISPLAY (distribution, recent list, avg rating). The RAW per-transaction set is kept for
  // the sales-velocity signal, where each transaction ≈ a sale and the duplication is meaningful.
  const reviews = dedupeReviews(rawReviews);

  const recent90 = reviewsLast90d(rawReviews, nowSec);
  const prices = listings.map((l) => priceVal(l.price)).filter((p) => p > 0);
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const shopSales = est.salesEstimate(
    {
      reviewsLast90d: recent90,
      avgPrice,
      categoryId: toTopLevel(listings[0]?.taxonomy_id),
    },
    reviewProvider
  );

  const activeListings = shop.listing_active_count ?? listings.length;
  const totalReviews = shop.review_count ?? reviews.length;
  // Real lifetime sales (transaction_sold_count) when present; else estimate × 12.
  const totalSales = shop.transaction_sold_count ?? shopSales.monthlySales * 12;

  // Displayed listing rows (with media). Sort by faves so the most relevant rows display first;
  // the frontend re-sorts client-side, so this just bounds which rows get the media fetch.
  const display = [...listings]
    .sort((a, b) => (b.num_favorers ?? 0) - (a.num_favorers ?? 0))
    .slice(0, DISPLAY_LIMIT);

  // Batch-fetch images/videos for the displayed rows (best-effort — never fail the job on media).
  const imageById = new Map<number, string>();
  const mediaById = new Map<number, EtsyListing>();
  const displayIds = display.map((l) => l.listing_id).filter((id): id is number => !!id);
  for (let i = 0; i < displayIds.length; i += MEDIA_BATCH) {
    const batch = displayIds.slice(i, i + MEDIA_BATCH);
    try {
      await consumeOne(deps.usage);
      const withMedia = await deps.client.getListingsByListingIds(batch, {
        includes: ['Images', 'Videos'],
      });
      for (const wl of withMedia) {
        if (!wl.listing_id) continue;
        mediaById.set(wl.listing_id, wl);
        const u = wl.images?.[0]?.url_570xN ?? wl.images?.[0]?.url_fullxfull;
        if (u) imageById.set(wl.listing_id, u);
      }
    } catch (err) {
      // Quota mid-media → defer the whole job (consistent with paginate). Other media errors are
      // swallowed: images are best-effort, the analysis is still valid without them.
      if (err instanceof DeepAnalysisQuotaError) throw err;
      break;
    }
  }

  // Distribute the shop's estimated monthly sales across the displayed rows by FAVES SHARE (a
  // per-listing demand proxy) so popular listings get more of the estimate than dead stock.
  const displayFaves = display.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
  const listingRows: ShopAnalyzerResponse['listings'] = display.map((l, i) => {
    const media = l.listing_id ? mediaById.get(l.listing_id) : undefined;
    const forAudit = media ? { ...l, images: media.images, videos: media.videos } : l;
    const audit = est.listingAudit(forAudit);
    const avgScore =
      (audit.title.score +
        audit.tags.score +
        audit.images.score +
        audit.video.score +
        audit.description.score) /
      5;
    const lp = priceVal(l.price);
    const faves = l.num_favorers ?? 0;
    const share = displayFaves > 0 ? faves / displayFaves : 1 / display.length;
    const estSales = Math.round(shopSales.monthlySales * share);
    return {
      id: l.listing_id || i + 1,
      title: l.title,
      imageUrl: (l.listing_id ? imageById.get(l.listing_id) : null) ?? null,
      price: formatMoney(lp, currency),
      grade: gradeFromScore(avgScore),
      scores: {
        title: audit.title.score,
        tags: audit.tags.score,
        images: audit.images.score,
        video: audit.video.score,
        description: audit.description.score,
      },
      sales: estSales,
      revenue: formatMoney(estSales * lp, currency),
      faves,
    };
  });

  // Aggregate most-used tags across ALL listings (top 60).
  const tagCounts = new Map<string, number>();
  for (const l of listings) for (const t of l.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([name, count]) => ({ name, count }));

  // Category mix by taxonomy NAME across ALL listings (top 60).
  const catCounts = new Map<string, number>();
  for (const l of listings) {
    const name = nameOf(l.taxonomy_id);
    if (name) catCounts.set(name, (catCounts.get(name) ?? 0) + 1);
  }
  const categories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([name, count]) => ({ name, count }));

  const totalFaves =
    listings.reduce((a, l) => a + (l.num_favorers ?? 0), 0) || (shop.num_favorers ?? 0);
  const reviewRate =
    shopSales.monthlySales > 0
      ? `${Math.min(100, Math.round((recent90 / 3 / shopSales.monthlySales) * 100))}%`
      : '—';

  // Real review-score distribution across ALL fetched reviews.
  const dist = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1' | '2' | '3' | '4' | '5', number>;
  for (const r of reviews) {
    const k = String(Math.min(5, Math.max(1, Math.round(r.rating)))) as '1' | '2' | '3' | '4' | '5';
    dist[k]++;
  }
  const sumRating = reviews.reduce((a, r) => a + r.rating, 0);
  const avgRating = reviews.length
    ? Math.round((sumRating / reviews.length) * 100) / 100
    : shop.review_average ?? 0;

  return {
    cached: false,
    name: shop.shop_name,
    title: shop.title ?? '',
    icon: shop.icon_url_fullxfull ?? null,
    rating: shop.review_average ?? avgRating,
    numRatings: totalReviews,
    location: shop.shop_location_country ?? '—',
    created: formatDate(shop.created_timestamp),
    stats: {
      activeListings,
      totalReviews,
      averagePrice: formatMoney(avgPrice, currency),
      totalFaves,
      reviewRate,
      monthlySales: shopSales.monthlySales,
      monthlyRevenue: shopSales.monthlyRevenue,
      totalSales,
      totalRevenue: formatMoney(totalSales * avgPrice, currency),
      salesPerListing: activeListings > 0 ? Math.round(totalSales / activeListings) : 0,
      salesReal: shop.transaction_sold_count != null,
    },
    tags,
    categories,
    listings: listingRows,
    reviews: {
      distribution: dist,
      // Deep reads the whole shop, so surface more recent reviews than quick's 10 — the sentiment
      // filter pills (Positive/Neutral/Negative) need a meaningful pool to be useful.
      recent: reviews.slice(0, 30).map((r) => ({
        rating: r.rating,
        text: r.review ?? '',
        date: formatDate(r.created_timestamp),
      })),
    },
    about: {
      location: shop.shop_location_country ?? '—',
      currency,
      vacation: shop.is_vacation ?? false,
      announcement: shop.announcement ?? null,
    },
    estimated: { sales: true, revenue: true, reviewRate: true, scores: true },
  };
}

/**
 * Etsy tool routes (Engineer F owns) — `/api/tools/*` for the 7 Phase 3 tools.
 *
 * Mounting: this default-exported `Hono<AppEnv>` is re-mounted inside Engineer C's
 * `routes/tools.ts` via `tools.route('/', etsyTools)` (spec §4, same pattern as llm-tools). This
 * file does NOT mount itself.
 *
 * Every JSON tool reuses the Phase 1 chain `requireAuth → requireCredits(key) → handler`, so a
 * failing tool (≥400) costs 0 credits (BR-P3-01). Each handler: zod-validate → cache-first
 * (KV) → EtsyClient (mock until a real key arrives) → estimation pure fns (Engineer G, behind
 * the `getEstimation()` contract) → response shape (estimated flags, no fabricated fields).
 *
 * EtsyError types are mapped to friendly HTTP bodies here (spec §4.0); upstream internals are
 * never leaked. Quota exhaustion serves stale cache when available (graceful degradation).
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getEnv, getUser, getDb } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { loadReviewRateProvider } from '../../services/calibration/reviewRateProvider';
import { requireCredits } from '../middleware/requireCredits';
import {
  EtsyError,
  EtsyConfigError,
  EtsyTimeoutError,
  EtsyRateLimitError,
  QuotaExceededError,
  EtsyNotFoundError,
} from '../../services/etsy/client';
import { getEtsyContext, hasEtsyKey } from '../../services/etsy/provider';
import { cacheKeys, TTL, normalize } from '../../services/etsy/cache';
import { createAnalysesStore } from '../../services/etsy/analysesStore';
import { getEstimation } from '../../services/etsy/estimationContract';
import type {
  EtsyClient,
  EtsyListing,
  EtsyReview,
  EtsyShop,
  ListingAnalyzerResponse,
  ShopAnalyzerResponse,
  RankCheckResponse,
  NicheFinderResponse,
  BestSellersResponse,
  EtsyTrendsResponse,
  BuyerCheckResponse,
  RankHistoryPoint,
  ListingAuditScores,
} from '../../services/etsy/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface MappedError {
  status: 400 | 404 | 429 | 502 | 503 | 504;
  error: string;
  message: string;
}

/** Map an EtsyError to its HTTP body (spec §4.0). No upstream detail leaked. */
function mapEtsyError(err: unknown): MappedError {
  if (err instanceof EtsyConfigError)
    return { status: 503, error: 'ETSY_UNAVAILABLE', message: 'Live Etsy data is not available yet. Please try again later.' };
  if (err instanceof EtsyTimeoutError)
    return { status: 504, error: 'ETSY_TIMEOUT', message: 'Etsy took too long to respond. Please try again.' };
  if (err instanceof QuotaExceededError)
    return { status: 503, error: 'ETSY_QUOTA', message: 'Live Etsy data is temporarily at capacity. Please try again later.' };
  if (err instanceof EtsyRateLimitError)
    return { status: 429, error: 'ETSY_BUSY', message: 'Etsy is busy. Please retry in a moment.' };
  if (err instanceof EtsyNotFoundError)
    return { status: 404, error: 'NOT_FOUND', message: 'That Etsy listing or shop was not found.' };
  if (err instanceof EtsyError)
    return { status: 502, error: 'ETSY_UNAVAILABLE', message: 'Etsy is temporarily unavailable. Please try again.' };
  return { status: 502, error: 'ETSY_UNAVAILABLE', message: 'Etsy is temporarily unavailable. Please try again.' };
}

/** Parse + zod-validate the JSON body. Returns data or a 400 Response. */
async function readBody<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: c.json(
        { error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        400
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Extract a numeric listing_id from a URL (…/listing/{id}/…) or a bare digit string. */
function parseListingId(input: string): number | null {
  const m = input.match(/listing\/(\d+)/) ?? input.match(/^(\d+)$/);
  if (m) return Number(m[1]);
  const digits = input.match(/(\d{4,})/);
  return digits ? Number(digits[1]) : null;
}

/** Extract a shop name from a shop URL (…/shop/{name}) or use the bare string. */
function parseShopName(input: string): string {
  const m = input.match(/shop\/([^/?#]+)/i);
  return (m ? m[1] : input).trim();
}

function priceValue(p?: EtsyListing['price']): number {
  if (!p || !p.divisor) return 0;
  return p.amount / p.divisor;
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

const SEC_90D = 90 * 86_400;

/** Reviews in the trailing 90 days (the sales-velocity signal, spec §3.2). */
function reviewsLast90d(reviews: EtsyReview[], now = Date.now()): number {
  const cutoff = Math.floor(now / 1000) - SEC_90D;
  return reviews.filter((r) => r.created_timestamp >= cutoff).length;
}

function avgRating(reviews: EtsyReview[]): number {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return Math.round((sum / reviews.length) * 100) / 100;
}

function gradeFromScores(scores: ListingAuditScores): string {
  const avg =
    (scores.title.score +
      scores.tags.score +
      scores.images.score +
      scores.video.score +
      scores.description.score) /
    5;
  if (avg >= 90) return 'A';
  if (avg >= 80) return 'B';
  if (avg >= 70) return 'C';
  if (avg >= 60) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = new Hono<AppEnv>();

// --- listing-analyzer (cost 3) ----------------------------------------------
const listingBody = z.object({ listing: z.string().min(1, 'listing is required') });

router.post('/listing-analyzer', requireAuth, requireCredits('listing-analyzer'), async (c) => {
  const body = await readBody(c, listingBody);
  if (!body.ok) return body.res;

  const listingId = parseListingId(body.data.listing);
  if (listingId === null) {
    return c.json({ error: 'VALIDATION', message: 'Enter a valid Etsy listing URL or ID.' }, 400);
  }

  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);
  const key = cacheKeys.listing(listingId);

  try {
    const cached = await cache.get<ListingAnalyzerResponse>(key);
    if (cached?.fresh) return c.json({ ...cached.payload, cached: true });

    const est = await getEstimation();
    // Etsy v3 `includes` enum does NOT accept "Tags" (tags are a default field on the listing);
    // sending it returns 400 → 502. Valid values used here: Shop, Images, Videos.
    const listing = await client.getListing(listingId, { includes: ['Shop', 'Images', 'Videos'] });
    const images = listing.images?.length ? listing.images : await client.getListingImages(listingId);
    const reviewsPage = await client.getReviewsByListing(listingId, { limit: 100 });
    const reviews = reviewsPage.results ?? [];

    const audit = est.listingAudit({ ...listing, images });
    const price = priceValue(listing.price);
    const reviewProvider = await loadReviewRateProvider(getDb(c));
    const sales = est.salesEstimate({
      reviewsLast90d: reviewsLast90d(reviews),
      avgPrice: price,
      categoryId: listing.taxonomy_id ?? null,
    }, reviewProvider);

    const payload: ListingAnalyzerResponse = {
      cached: false,
      title: listing.title,
      shop: listing.shop_id ? `Shop ${listing.shop_id}` : '—',
      price: formatMoney(price, listing.price?.currency_code),
      date: formatDate(listing.created_timestamp),
      url: listing.url,
      imageUrl: images[0]?.url_570xN ?? images[0]?.url_fullxfull ?? null,
      rating: avgRating(reviews),
      numRatings: reviewsPage.count ?? reviews.length,
      scores: audit,
      stats: {
        estimatedSales: sales.monthlySales,
        estimatedRevenue: sales.monthlyRevenue,
        faves: listing.num_favorers ?? 0,
      },
      estimated: { sales: true, revenue: true, scores: true },
    };

    await cache.put(key, payload, TTL.listing);
    return c.json(payload);
  } catch (err) {
    return degradeOrError<ListingAnalyzerResponse>(c, cache, key, err);
  }
});

// --- shop-analyzer (cost 3) -------------------------------------------------
const shopBody = z.object({ shop: z.string().min(1, 'shop is required') });
const MAX_SHOP_LISTINGS = 100;

router.post('/shop-analyzer', requireAuth, requireCredits('shop-analyzer'), async (c) => {
  const body = await readBody(c, shopBody);
  if (!body.ok) return body.res;

  const shopName = parseShopName(body.data.shop);
  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);

  try {
    const est = await getEstimation();
    const reviewProvider = await loadReviewRateProvider(getDb(c));

    // Resolve name → shop_id (cached separately to avoid repeat findShops).
    const nameKey = cacheKeys.shopName(shopName);
    let shopId: number | null = null;
    const cachedId = await cache.get<{ shopId: number }>(nameKey);
    if (cachedId?.fresh) shopId = cachedId.payload.shopId;
    if (shopId === null) {
      const found = await client.findShops({ shopName, limit: 1 });
      if (!found.length) {
        return c.json({ error: 'NOT_FOUND', message: 'That Etsy shop was not found.' }, 404);
      }
      shopId = found[0].shop_id;
      await cache.put(nameKey, { shopId }, TTL.shop);
    }

    const payloadKey = cacheKeys.shop(shopId);
    const cached = await cache.get<ShopAnalyzerResponse>(payloadKey);
    if (cached?.fresh) return c.json({ ...cached.payload, cached: true });

    const shop: EtsyShop = await client.getShop(shopId);
    const listingsPage = await client.getActiveListingsByShop(shopId, { limit: MAX_SHOP_LISTINGS });
    const listings = (listingsPage.results ?? []).slice(0, MAX_SHOP_LISTINGS);
    const reviewsPage = await client.getReviewsByShop(shopId, { limit: 100 });
    const reviews = reviewsPage.results ?? [];

    // Shop-listings endpoint omits images; fetch thumbnails for the displayed rows in ONE
    // batch call (best-effort — never fail the analysis if images can't be fetched).
    const imageById = new Map<number, string>();
    const displayIds = listings.slice(0, 20).map((l) => l.listing_id).filter((id): id is number => !!id);
    if (displayIds.length) {
      try {
        const withImages = await client.getListingsByListingIds(displayIds, { includes: ['Images'] });
        for (const wl of withImages) {
          const u = wl.images?.[0]?.url_570xN ?? wl.images?.[0]?.url_fullxfull;
          if (wl.listing_id && u) imageById.set(wl.listing_id, u);
        }
      } catch {
        /* thumbnails are best-effort */
      }
    }

    const currency = shop.currency_code ?? 'USD';
    const prices = listings.map((l) => priceValue(l.price)).filter((p) => p > 0);
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    const shopSales = est.salesEstimate({
      reviewsLast90d: reviewsLast90d(reviews),
      avgPrice,
      categoryId: listings[0]?.taxonomy_id ?? null,
    }, reviewProvider);
    const totalReviews = shop.review_count ?? reviewsPage.count ?? reviews.length;
    const activeListings = shop.listing_active_count ?? listings.length;
    // Real lifetime sales from Etsy (`transaction_sold_count`); fall back to the estimate
    // only when the field is absent. monthlySales stays estimated (no live velocity in API).
    const totalSales = shop.transaction_sold_count ?? shopSales.monthlySales * 12;

    const listingRows = listings.slice(0, 20).map((l, i) => {
      const audit = est.listingAudit(l);
      const lp = priceValue(l.price);
      const lSales = est.salesEstimate({
        reviewsLast90d: Math.round(reviewsLast90d(reviews) / Math.max(1, listings.length)),
        avgPrice: lp,
        categoryId: l.taxonomy_id ?? null,
      }, reviewProvider);
      return {
        id: l.listing_id || i + 1,
        title: l.title,
        imageUrl: (l.listing_id ? imageById.get(l.listing_id) : null) ?? null,
        price: formatMoney(lp, currency),
        grade: gradeFromScores(audit),
        scores: {
          title: audit.title.score,
          tags: audit.tags.score,
          images: audit.images.score,
          video: audit.video.score,
          description: audit.description.score,
        },
        sales: lSales.monthlySales,
        revenue: lSales.monthlyRevenue,
        faves: l.num_favorers ?? 0,
      };
    });

    // Aggregate most-used tags across the sampled listings.
    const tagCounts = new Map<string, number>();
    for (const l of listings) for (const t of l.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const totalFaves = listings.reduce((a, l) => a + (l.num_favorers ?? 0), 0) || (shop.num_favorers ?? 0);
    const reviewRate = shopSales.monthlySales > 0
      ? `${Math.min(100, Math.round((reviewsLast90d(reviews) / 3 / shopSales.monthlySales) * 100))}%`
      : '—';

    const dist = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1' | '2' | '3' | '4' | '5', number>;
    for (const r of reviews) {
      const k = String(Math.min(5, Math.max(1, Math.round(r.rating)))) as '1' | '2' | '3' | '4' | '5';
      dist[k]++;
    }

    const payload: ShopAnalyzerResponse = {
      cached: false,
      name: shop.shop_name,
      title: shop.title ?? '',
      icon: shop.icon_url_fullxfull ?? null,
      rating: shop.review_average ?? avgRating(reviews),
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
      },
      tags,
      listings: listingRows,
      reviews: {
        distribution: dist,
        recent: reviews.slice(0, 10).map((r) => ({
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

    await cache.put(payloadKey, payload, TTL.shop);
    return c.json(payload);
  } catch (err) {
    const m = mapEtsyError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- rank-check (cost 2) ----------------------------------------------------
const rankBody = z.object({
  listing: z.string().min(1, 'listing is required'),
  keyword: z.string().min(1, 'keyword is required'),
});

router.post('/rank-check', requireAuth, requireCredits('rank-check'), async (c) => {
  const body = await readBody(c, rankBody);
  if (!body.ok) return body.res;

  const listingId = parseListingId(body.data.listing);
  if (listingId === null) {
    return c.json({ error: 'VALIDATION', message: 'Enter a valid Etsy listing URL or ID.' }, 400);
  }
  const keyword = body.data.keyword.trim();

  const env = getEnv(c);
  const user = getUser(c);
  const { client, cache } = getEtsyContext(env);
  const analyses = createAnalysesStore(env.DB);
  const subject = `${listingId}:${normalize(keyword)}`;
  const key = cacheKeys.rank(listingId, keyword);

  try {
    const est = await getEstimation();
    const page = await client.findActiveListings({
      keywords: keyword,
      sortOn: 'score',
      sortOrder: 'desc',
      limit: 100,
    });
    const ordered = (page.results ?? []).map((l) => l.listing_id);
    const { position } = est.rankEstimate({ orderedListingIds: ordered, targetListingId: listingId });

    // Persist this point BEFORE reading history so the chart includes the current check.
    await analyses.insert({
      userId: user.id,
      tool: 'rank-check',
      subject,
      payload: { position, keyword, at: Date.now() },
      metric: position,
    });

    const rows = await analyses.history(user.id, 'rank-check', subject, 30);
    const rankHistory: RankHistoryPoint[] = rows
      .filter((r) => r.metric !== null)
      .map((r) => ({ date: formatDate(r.created_at).replace(/, \d{4}$/, ''), rank: r.metric as number }));

    const ranked = rows.map((r) => r.metric).filter((m): m is number => m !== null);
    const bestRank = ranked.length ? Math.min(...ranked) : null;
    const bestRow = rows.find((r) => r.metric === bestRank);
    const delta =
      rankHistory.length >= 2 && position !== null && rankHistory[rankHistory.length - 2].rank !== null
        ? rankHistory[rankHistory.length - 2].rank - position
        : null;

    const payload: RankCheckResponse = {
      cached: false,
      currentRank: position,
      bestRank,
      bestRankDate: bestRow ? formatDate(bestRow.created_at) : null,
      keyword,
      competingListings: page.count ?? ordered.length,
      delta,
      rankHistory,
      estimated: { position: true },
    };

    // Short cache only for the competing-listings count / current page (history is per-user).
    await cache.put(key, { competingListings: payload.competingListings }, TTL.rank);
    return c.json(payload);
  } catch (err) {
    const m = mapEtsyError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- niche-finder (cost 2) --------------------------------------------------
const nicheBody = z.object({ query: z.string().min(1, 'query is required') });

router.post('/niche-finder', requireAuth, requireCredits('niche-finder'), async (c) => {
  const body = await readBody(c, nicheBody);
  if (!body.ok) return body.res;

  const query = body.data.query.trim();
  const env = getEnv(c);
  const { client, cache, history } = getEtsyContext(env);
  const key = cacheKeys.niche(query);

  try {
    const cached = await cache.get<NicheFinderResponse>(key);
    if (cached?.fresh) return c.json({ ...cached.payload, cached: true });

    const est = await getEstimation();

    // Candidate niches from taxonomy children of a matched node, else the query itself.
    const taxonomy = await client.getSellerTaxonomyNodes();
    const candidates = deriveNicheCandidates(taxonomy, query);

    const niches = [] as NicheFinderResponse['niches'];
    for (const cand of candidates.slice(0, 8)) {
      const page = await client.findActiveListings({ keywords: cand.keyword, sortOn: 'score', limit: 25 });
      const sample = page.results ?? [];
      const velocity = sample.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
      const faves = velocity;
      const demand = est.demandScore({
        resultCount: page.count ?? sample.length,
        aggregateReviewVelocity: Math.round(velocity / 1000),
        favoritesSignal: faves,
      });
      const competition = est.competitionLevel(page.count ?? sample.length);
      const prices = sample.map((l) => priceValue(l.price)).filter((p) => p > 0);
      const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

      // Record a snapshot + compute delta vs a prior period (cold start → '—').
      const prior = await history.prior(cand.keyword, 6 * 86_400);
      const trend = est.trendDelta(demand.score, prior ? prior.demandScore : null);
      await history.insert({
        keyword: cand.keyword,
        categoryId: cand.categoryId,
        demandScore: demand.score,
        resultCount: page.count ?? sample.length,
        competition,
      });

      niches.push({
        niche: cand.name,
        competition,
        demand: demand.label,
        avgPrice: formatMoney(avgPrice),
        listings: page.count ?? sample.length,
        growth: trend.change,
        estimated: { demand: true, growth: true },
      });
    }

    const payload: NicheFinderResponse = { cached: false, query, niches };
    await cache.put(key, payload, TTL.niche);
    return c.json(payload);
  } catch (err) {
    const m = mapEtsyError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- best-sellers (cost 1, Q11; cron-built cache) ---------------------------
const bestSellersBody = z.object({
  category: z.string().optional(),
  view: z.enum(['shops', 'listings']).default('shops'),
});

router.post('/best-sellers', requireAuth, requireCredits('best-sellers'), async (c) => {
  const body = await readBody(c, bestSellersBody);
  if (!body.ok) return body.res;

  const env = getEnv(c);
  const { cache } = getEtsyContext(env);
  const categoryId = body.data.category ? normalize(body.data.category) : 'popular';
  const key = cacheKeys.bestsellers(categoryId);

  // best-sellers is served from cron-built cache (spec §4.5). On-demand uncached category →
  // fallback to popular (BA rec option (a)), never an expensive on-demand build.
  const cached = await cache.get<BestSellersResponse>(key);
  if (cached) {
    return c.json({ ...cached.payload, cached: cached.fresh, stale: !cached.fresh });
  }
  if (categoryId !== 'popular') {
    const fallback = await cache.get<BestSellersResponse>(cacheKeys.bestsellers('popular'));
    if (fallback) {
      return c.json({ ...fallback.payload, cached: fallback.fresh, fallback: true, category: body.data.category ?? null });
    }
  }

  // Cron has not populated this yet (expected before first weekly run). Honest empty state.
  const payload: BestSellersResponse = {
    cached: false,
    category: body.data.category ?? null,
    view: body.data.view,
    shops: [],
    fallback: true,
    estimated: { sales: true, ranking: true },
  };
  return c.json(payload);
});

// --- etsy-trends (cost 1, Q11; cron-built cache) ----------------------------
const trendsBody = z.object({ filter: z.string().optional() });

router.post('/etsy-trends', requireAuth, requireCredits('etsy-trends'), async (c) => {
  const body = await readBody(c, trendsBody);
  if (!body.ok) return body.res;

  const env = getEnv(c);
  const { cache } = getEtsyContext(env);
  const key = cacheKeys.trends('all');

  const cached = await cache.get<EtsyTrendsResponse>(key);
  if (cached) {
    const filtered = applyTrendFilter(cached.payload, body.data.filter);
    return c.json({ ...filtered, cached: cached.fresh, stale: !cached.fresh });
  }

  // Cron not run yet → empty, building-history state (BR-P3-10: no fabricated volumes).
  const payload: EtsyTrendsResponse = {
    cached: false,
    filter: body.data.filter ?? null,
    trends: [],
    buildingHistory: true,
  };
  return c.json(payload);
});

// --- buyer-check (cost 2; REDEFINED → shop reputation, spec §4.7) -----------
const buyerBody = z.object({ shop: z.string().min(1, 'shop is required') });

router.post('/buyer-check', requireAuth, requireCredits('buyer-check'), async (c) => {
  const body = await readBody(c, buyerBody);
  if (!body.ok) return body.res;

  const shopName = parseShopName(body.data.shop);
  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);

  try {
    // Resolve name → shop_id.
    const nameKey = cacheKeys.shopName(shopName);
    let shopId: number | null = null;
    const cachedId = await cache.get<{ shopId: number }>(nameKey);
    if (cachedId?.fresh) shopId = cachedId.payload.shopId;
    if (shopId === null) {
      const found = await client.findShops({ shopName, limit: 1 });
      if (!found.length) {
        return c.json({ error: 'NOT_FOUND', message: 'That Etsy shop was not found.' }, 404);
      }
      shopId = found[0].shop_id;
      await cache.put(nameKey, { shopId }, TTL.shop);
    }

    const key = cacheKeys.reviewsShop(shopId);
    const cached = await cache.get<BuyerCheckResponse>(key);
    if (cached?.fresh) return c.json({ ...cached.payload, cached: true });

    const shop = await client.getShop(shopId);
    const reviewsPage = await client.getReviewsByShop(shopId, { limit: 100 });
    const reviews = reviewsPage.results ?? [];
    const total = shop.review_count ?? reviewsPage.count ?? reviews.length;
    const rating = shop.review_average ?? avgRating(reviews);
    const positive = reviews.length
      ? Math.round((reviews.filter((r) => r.rating >= 4).length / reviews.length) * 100)
      : 0;
    const ageYears = shop.created_timestamp
      ? Math.max(0, Math.floor((Date.now() / 1000 - shop.created_timestamp) / (365 * 86_400)))
      : 0;

    // Reputation risk (estimated): rating <4.0 or high negative ratio → higher risk.
    const negRatio = reviews.length ? reviews.filter((r) => r.rating <= 2).length / reviews.length : 0;
    let riskLevel: BuyerCheckResponse['riskLevel'] = 'low';
    if (rating < 4.0 || negRatio > 0.2) riskLevel = 'high';
    else if (rating < 4.5 || negRatio > 0.1) riskLevel = 'medium';

    const payload: BuyerCheckResponse = {
      cached: false,
      shop: shop.shop_name,
      shopOpened: formatDate(shop.created_timestamp),
      totalReviews: total,
      avgRating: rating,
      positivePct: positive,
      accountAgeYears: ageYears,
      riskLevel,
      reviews: reviews.slice(0, 10).map((r) => ({
        product: r.listing_id ? `Listing ${r.listing_id}` : shop.shop_name,
        rating: r.rating,
        text: r.review ?? '',
        date: formatDate(r.created_timestamp),
      })),
      estimated: { riskLevel: true },
    };

    await cache.put(key, payload, TTL.reviews);
    return c.json(payload);
  } catch (err) {
    const m = mapEtsyError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

export default router;

// ---------------------------------------------------------------------------
// Local helpers (kept after the router for readability)
// ---------------------------------------------------------------------------

/** On error, serve a stale cache entry if one exists (graceful degradation); else map error. */
async function degradeOrError<T extends { cached: boolean; stale?: boolean }>(
  c: Context<AppEnv>,
  cache: ReturnType<typeof getEtsyContext>['cache'],
  key: string,
  err: unknown
): Promise<Response> {
  // Only degrade for capacity/transport errors — a 404/validation should surface as-is.
  if (err instanceof QuotaExceededError || (err instanceof EtsyError && !(err instanceof EtsyNotFoundError))) {
    const stale = await cache.get<T>(key);
    if (stale) return c.json({ ...stale.payload, cached: false, stale: true });
  }
  const m = mapEtsyError(err);
  return c.json({ error: m.error, message: m.message }, m.status);
}

interface NicheCandidate {
  name: string;
  keyword: string;
  categoryId: number | null;
}

/** Taxonomy-derived niche candidates (spec §4.4) — children of a matched node, else the query. */
function deriveNicheCandidates(
  taxonomy: Awaited<ReturnType<EtsyClient['getSellerTaxonomyNodes']>>,
  query: string
): NicheCandidate[] {
  const q = normalize(query);
  const match = (node: { name: string }) => normalize(node.name).includes(q) || q.includes(normalize(node.name));

  for (const node of taxonomy) {
    if (match(node) && node.children?.length) {
      return node.children.map((ch) => ({ name: ch.name, keyword: ch.name, categoryId: ch.id }));
    }
    for (const ch of node.children ?? []) {
      if (match(ch)) {
        return [{ name: ch.name, keyword: ch.name, categoryId: ch.id }];
      }
    }
  }
  // No taxonomy match → use the query plus a few related terms as a thin fallback.
  return [
    { name: query, keyword: query, categoryId: null },
    { name: `personalized ${query}`, keyword: `personalized ${query}`, categoryId: null },
    { name: `custom ${query}`, keyword: `custom ${query}`, categoryId: null },
  ];
}

/** Client-side-style filter (also done in FE) so the API response can pre-filter if asked. */
function applyTrendFilter(payload: EtsyTrendsResponse, filter?: string): EtsyTrendsResponse {
  if (!filter) return { ...payload, filter: null };
  const f = filter.toLowerCase();
  return {
    ...payload,
    filter,
    trends: payload.trends.filter(
      (t) => t.keyword.toLowerCase().includes(f) || t.category.toLowerCase().includes(f)
    ),
  };
}

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
import type { Env } from '../../env';
import { getEnv, getUser, getDb, getHistoryDb } from '../context';
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
import { cacheKeys, TTL, normalize, createKeywordHistory } from '../../services/etsy/cache';
import { dedupeReviews } from '../../services/etsy/reviews';
import { forecastTrend } from '../../services/etsy/forecast';
import { createAnalysesStore } from '../../services/etsy/analysesStore';
import { getEstimation } from '../../services/etsy/estimationContract';
import { loadTaxonomyResolver } from '../../services/etsy/taxonomyResolver';
import { llmListingAudit } from '../../services/prompts/listingAudit';
import { createLlmService, type LlmService } from '../../services/llmService';
import type {
  EtsyClient,
  EtsyListing,
  EtsyReview,
  EtsyShop,
  EtsyTaxonomyProperty,
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

/**
 * Reviews in the trailing 90 days (the sales-velocity signal, spec §3.2).
 *
 * When the observed review history spans <90 days (a young listing/shop, or a capped sample whose
 * oldest review is recent), the raw 90-day count understates velocity, so we PROJECT the observed
 * per-day rate out to 90 days and take the larger of the two. With ≥90 days of span we use the
 * true in-window count.
 */
function reviewsLast90d(reviews: EtsyReview[], now = Date.now()): number {
  if (!reviews.length) return 0;
  const ts = reviews
    .map((r) => r.created_timestamp)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (!ts.length) return 0;

  const nowSec = Math.floor(now / 1000);
  const cutoff = nowSec - SEC_90D;
  const within90 = ts.filter((t) => t >= cutoff).length;

  const newest = ts[0];
  const oldest = ts[ts.length - 1];
  const spanDays = (newest - oldest) / 86_400;
  if (spanDays >= 90) return within90;

  const projected = (ts.length / Math.max(1, spanDays)) * 90;
  return Math.round(Math.max(within90, projected));
}

/** Build an LlmService from env (OpenAI-compatible gateway), defaults mirror the deployed config. */
function llmFromEnv(env: Env): LlmService {
  return createLlmService({
    baseUrl: env.LLM_BASE_URL ?? 'https://vtoken.viemind.ai/v1',
    apiKey: env.LLM_API_KEY ?? '',
    model: env.LLM_MODEL ?? '',
  });
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
// listing-analyzer enrichment (sales-optimization signals from the richer
// listing object: real lifetime views, handling speed, attribute completeness,
// and variation pricing). All shapes below are ADDITIVE to ListingAnalyzerResponse.
// ---------------------------------------------------------------------------

/** Real lifetime views + an ESTIMATED conversion rate (est. monthly sales ÷ lifetime views). */
export interface ViewsInsight {
  /** REAL cumulative lifetime views (not time-windowed). */
  views: number;
  /** Estimated monthly conversion = est. monthly sales ÷ lifetime views, as a %. Null when unknowable. */
  conversionRatePct: number | null;
  /** Honest note when conversion can't be computed (no views and/or no sales signal). */
  note: string | null;
}

export type ShippingVerdict = 'fast' | 'average' | 'slow' | 'unknown';

export interface ShippingInsight {
  processingMin: number | null;
  processingMax: number | null;
  verdict: ShippingVerdict;
  /** Human label, e.g. "1–3 business days". */
  label: string;
  note: string;
}

export interface AttributeCompleteness {
  /** Catalog attribute names the listing actually fills. */
  filledAttributes: string[];
  /** Catalog attribute names NOT covered by the listing — the actionable SEO gaps. */
  missingAttributes: string[];
  /** Required catalog attributes still missing (highest-priority subset of missingAttributes). */
  missingRequired: string[];
  /** 0–100 completeness over the catalog's attributes. */
  completenessPct: number;
}

export interface VariationInsight {
  variationCount: number;
  minPrice: string;
  maxPrice: string;
  /** maxPrice − minPrice, formatted. */
  priceSpread: string;
}

/** Build the views + estimated-conversion insight. Guards divide-by-zero / no-signal honestly. */
export function buildViewsInsight(views: number, monthlySales: number): ViewsInsight {
  if (!Number.isFinite(views) || views <= 0) {
    return { views: Math.max(0, Math.round(views || 0)), conversionRatePct: null, note: 'No lifetime view data available for this listing.' };
  }
  if (!Number.isFinite(monthlySales) || monthlySales <= 0) {
    return { views, conversionRatePct: null, note: 'No sales signal (no recent reviews), so we can’t estimate a conversion rate yet.' };
  }
  // monthly sales over LIFETIME views — a rough order-of-magnitude estimate, not a true rate.
  const pct = (monthlySales / views) * 100;
  return { views, conversionRatePct: Math.round(pct * 100) / 100, note: null };
}

/** Map processing (handling) days to a ranking-relevant verdict. Etsy ranks faster handling higher. */
export function buildShippingInsight(min?: number, max?: number): ShippingInsight | null {
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);
  if (!hasMin && !hasMax) return null;
  const lo = hasMin ? (min as number) : (max as number);
  const hi = hasMax ? (max as number) : (min as number);
  const upper = Math.max(lo, hi);
  let verdict: ShippingVerdict;
  let note: string;
  if (upper <= 3) {
    verdict = 'fast';
    note = 'Fast handling. Etsy tends to favor listings that ship quickly.';
  } else if (upper <= 7) {
    verdict = 'average';
    note = 'Average handling. Tightening this toward 1–3 days can help ranking and conversion.';
  } else {
    verdict = 'slow';
    note = 'Slow handling. Long processing times can hurt both ranking and buyer trust.';
  }
  const label = lo === hi ? `${lo} business day${lo === 1 ? '' : 's'}` : `${lo}–${hi} business days`;
  return { processingMin: hasMin ? (min as number) : null, processingMax: hasMax ? (max as number) : null, verdict, label, note };
}

/** Normalize an attribute name for set comparison (case/space-insensitive). */
function normAttr(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Compare the category's attribute catalog against what the listing actually fills.
 *
 * "Filled" = any of: an inventory property_values entry with a non-empty value, OR a populated
 * core attribute (materials / style / who_made / when_made) that maps to a catalog property by name.
 * Returns the gap (catalog names not covered) so the FE can surface concrete, actionable SEO wins.
 */
export function buildAttributeCompleteness(
  catalog: EtsyTaxonomyProperty[],
  listing: EtsyListing
): AttributeCompleteness | null {
  if (!catalog.length) return null;

  // Collect the NAMES of attributes this listing fills.
  const filledNames = new Set<string>();
  for (const product of listing.inventory?.products ?? []) {
    for (const pv of product.property_values ?? []) {
      const hasValue = (pv.values?.some((v) => v && v.trim().length > 0)) ?? false;
      if (pv.property_name && hasValue) filledNames.add(normAttr(pv.property_name));
    }
  }
  // Core attributes that map onto common catalog property names.
  if (listing.materials?.length) filledNames.add(normAttr('Material'));
  if (listing.style?.length) filledNames.add(normAttr('Style'));
  if (listing.who_made) filledNames.add(normAttr('Who made it'));
  if (listing.when_made) filledNames.add(normAttr('When made'));

  // Etsy's taxonomy catalog repeats some display names (e.g. "Material" twice, three "Custom
  // Property" slots). Dedupe by normalized display name so the gap list shows each attribute once —
  // both for a cleaner UI and to keep the FE's keyed {#each} from receiving duplicate keys.
  const filled: string[] = [];
  const missing: string[] = [];
  const missingRequired: string[] = [];
  const seen = new Set<string>();
  for (const prop of catalog) {
    const display = prop.display_name || prop.name;
    const dedupeKey = normAttr(display);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const covered = filledNames.has(normAttr(prop.name)) || filledNames.has(normAttr(display));
    if (covered) {
      filled.push(display);
    } else {
      missing.push(display);
      if (prop.is_required) missingRequired.push(display);
    }
  }
  const totalUnique = filled.length + missing.length;
  const completenessPct = totalUnique ? Math.round((filled.length / totalUnique) * 100) : 0;
  return { filledAttributes: filled, missingAttributes: missing, missingRequired, completenessPct };
}

/** Variation count + min/max/spread of enabled offering prices. */
export function buildVariationInsight(listing: EtsyListing, currency: string): VariationInsight | null {
  if (!listing.has_variations) return null;
  const products = listing.inventory?.products?.filter((p) => !p.is_deleted) ?? [];
  if (!products.length) return null;
  const prices: number[] = [];
  for (const p of products) {
    for (const o of p.offerings ?? []) {
      if (o.is_deleted || o.is_enabled === false) continue;
      const v = priceValue(o.price);
      if (v > 0) prices.push(v);
    }
  }
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    variationCount: products.length,
    minPrice: formatMoney(min, currency),
    maxPrice: formatMoney(max, currency),
    priceSpread: formatMoney(max - min, currency),
  };
}

/** The additive enrichment block merged into the listing-analyzer response. */
export interface ListingEnrichment {
  views: ViewsInsight;
  shipping: ShippingInsight | null;
  attributes: AttributeCompleteness | null;
  variations: VariationInsight | null;
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
    // sending it returns 400 → 502. Valid values used here: Shop, Images, Videos, Inventory.
    // Inventory powers attribute-completeness + variation-price analysis below.
    const listing = await client.getListing(listingId, { includes: ['Shop', 'Images', 'Videos', 'Inventory'] });
    const images = listing.images?.length ? listing.images : await client.getListingImages(listingId);
    const reviewsPage = await client.getReviewsByListing(listingId, { limit: 100 });
    const reviews = reviewsPage.results ?? [];
    const price = priceValue(listing.price);
    const reviewProvider = await loadReviewRateProvider(getDb(c));
    const { toTopLevel } = await loadTaxonomyResolver(client, cache);

    // LLM content-aware audit (best-effort) reading the listing's REAL fields; fall back to the
    // rule-based audit when the LLM is unavailable/invalid so the analysis never fails.
    const llmAudit = await llmListingAudit(llmFromEnv(env), {
      title: listing.title ?? '',
      tags: listing.tags ?? [],
      description: listing.description ?? '',
      imageCount: images.length,
      hasVideo: Array.isArray(listing.videos) && listing.videos.length > 0,
      price,
      currency: listing.price?.currency_code,
      category: listing.taxonomy_id != null ? String(listing.taxonomy_id) : null,
    });
    const audit = llmAudit ?? est.listingAudit({ ...listing, images });

    const sales = est.salesEstimate({
      reviewsLast90d: reviewsLast90d(reviews),
      avgPrice: price,
      // Category-specific review-rate keys off the TOP-LEVEL taxonomy, not the leaf.
      categoryId: toTopLevel(listing.taxonomy_id),
    }, reviewProvider);

    // --- Sales-optimization enrichment (additive) ---------------------------
    const currency = listing.price?.currency_code ?? 'USD';
    const viewsInsight = buildViewsInsight(listing.views ?? 0, sales.monthlySales);
    const shippingInsight = buildShippingInsight(listing.processing_min, listing.processing_max);
    const variationInsight = buildVariationInsight(listing, currency);

    // Attribute completeness needs the category's attribute catalog; best-effort (skip on error).
    let attributeCompleteness: AttributeCompleteness | null = null;
    if (listing.taxonomy_id != null) {
      try {
        const props = await client.getTaxonomyProperties(listing.taxonomy_id);
        attributeCompleteness = buildAttributeCompleteness(props, listing);
      } catch {
        /* attribute analysis is best-effort — never fail the whole analysis */
      }
    }

    const payload: ListingAnalyzerResponse & { enrichment: ListingEnrichment } = {
      cached: false,
      title: listing.title,
      // Prefer the real shop name (from includes=Shop); fall back to the id placeholder only when
      // it's genuinely missing. The FE downgrades a bare "Shop {id}" / "—" to "Your listing".
      shop: listing.shop?.shop_name?.trim() || (listing.shop_id ? `Shop ${listing.shop_id}` : '—'),
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
      enrichment: {
        views: viewsInsight,
        shipping: shippingInsight,
        attributes: attributeCompleteness,
        variations: variationInsight,
      },
    };

    // Listing content: pin hard-TTL = soft so we never display data past Etsy's 6h cap.
    await cache.put(key, payload, TTL.listing, { hardTtl: TTL.listing });
    await recordRun(env, getUser(c).id, 'listing-analyzer', String(listingId), {
      title: payload.title,
      grade: gradeFromScores(audit),
    });
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
    const { toTopLevel, nameOf } = await loadTaxonomyResolver(client, cache);

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
    // For DISPLAY (distribution + recent list) collapse Etsy's per-transaction duplication (one
    // review on a multi-item order repeats per item). `reviews` stays raw for the sales/reviewRate
    // math, where each transaction ≈ a sale and the duplication is the signal.
    const displayReviews = dedupeReviews(reviews);

    // Shop-listings endpoint omits media; fetch images + videos for the displayed rows in ONE
    // batch call (best-effort — never fail the analysis if media can't be fetched). The fetched
    // listing (with images/videos) feeds the per-row audit so the video score is accurate.
    const imageById = new Map<number, string>();
    const mediaById = new Map<number, EtsyListing>();
    const displayIds = listings.slice(0, 20).map((l) => l.listing_id).filter((id): id is number => !!id);
    if (displayIds.length) {
      try {
        const withMedia = await client.getListingsByListingIds(displayIds, { includes: ['Images', 'Videos'] });
        for (const wl of withMedia) {
          if (!wl.listing_id) continue;
          mediaById.set(wl.listing_id, wl);
          const u = wl.images?.[0]?.url_570xN ?? wl.images?.[0]?.url_fullxfull;
          if (u) imageById.set(wl.listing_id, u);
        }
      } catch {
        /* media is best-effort */
      }
    }

    const currency = shop.currency_code ?? 'USD';
    const prices = listings.map((l) => priceValue(l.price)).filter((p) => p > 0);
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    const shopSales = est.salesEstimate({
      reviewsLast90d: reviewsLast90d(reviews),
      avgPrice,
      categoryId: toTopLevel(listings[0]?.taxonomy_id),
    }, reviewProvider);
    const totalReviews = shop.review_count ?? reviewsPage.count ?? reviews.length;
    const activeListings = shop.listing_active_count ?? listings.length;
    // Real lifetime sales from Etsy (`transaction_sold_count`); fall back to the estimate
    // only when the field is absent. monthlySales stays estimated (no live velocity in API).
    const totalSales = shop.transaction_sold_count ?? shopSales.monthlySales * 12;

    // Distribute the shop's estimated monthly sales across the sampled rows by FAVES SHARE (a
    // per-listing demand proxy), so popular listings get more of the estimate than dead stock.
    const sampled = listings.slice(0, 20);
    const sampledFaves = sampled.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
    const listingRows = sampled.map((l, i) => {
      const media = l.listing_id ? mediaById.get(l.listing_id) : undefined;
      const forAudit = media ? { ...l, images: media.images, videos: media.videos } : l;
      const audit = est.listingAudit(forAudit);
      const lp = priceValue(l.price);
      const faves = l.num_favorers ?? 0;
      const share = sampledFaves > 0 ? faves / sampledFaves : 1 / sampled.length;
      const estSales = Math.round(shopSales.monthlySales * share);
      const estRevenue = estSales * lp;
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
        sales: estSales,
        revenue: formatMoney(estRevenue, currency),
        faves,
      };
    });

    // Aggregate most-used tags across the sampled listings.
    const tagCounts = new Map<string, number>();
    for (const l of listings) for (const t of l.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([name, count]) => ({ name, count }));

    // Aggregate the shop's category mix (by taxonomy name) across all sampled listings.
    const catCounts = new Map<string, number>();
    for (const l of listings) {
      const name = nameOf(l.taxonomy_id);
      if (name) catCounts.set(name, (catCounts.get(name) ?? 0) + 1);
    }
    const categories = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([name, count]) => ({ name, count }));

    const totalFaves = listings.reduce((a, l) => a + (l.num_favorers ?? 0), 0) || (shop.num_favorers ?? 0);
    const reviewRate = shopSales.monthlySales > 0
      ? `${Math.min(100, Math.round((reviewsLast90d(reviews) / 3 / shopSales.monthlySales) * 100))}%`
      : '—';

    const dist = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1' | '2' | '3' | '4' | '5', number>;
    for (const r of displayReviews) {
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
        // True when totalSales is Etsy's REAL lifetime figure (transaction_sold_count), not the
        // estimate — lets the FE drop the "Est." badge on Total Sales when it's genuine.
        salesReal: shop.transaction_sold_count != null,
      },
      tags,
      categories,
      listings: listingRows,
      reviews: {
        distribution: dist,
        recent: displayReviews.slice(0, 10).map((r) => ({
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

    // Cache the ordered SERP ids (the SHARED shape the rank-track cron reuses → 0 Etsy calls
    // within 24h) plus the competing-listings count. Rank is derived data, not verbatim content.
    await cache.put(key, { ordered, competingListings: payload.competingListings }, TTL.rank);
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
    if (cached?.fresh) {
      // Back-compat: old cached payloads predate the `opportunity` field — patch on the way out.
      const niches = (cached.payload.niches ?? []).map((n) => ({
        ...n,
        opportunity: (n as unknown as Record<string, unknown>).opportunity ?? nicheOpLabel(n.demand, n.competition),
      }));
      return c.json({ ...cached.payload, niches, cached: true });
    }

    const est = await getEstimation();

    // Candidate niches from taxonomy children of a matched node, else the query itself.
    const taxonomy = await client.getSellerTaxonomyNodes();
    const candidates = deriveNicheCandidates(taxonomy, query);

    // Parallel fetch — all 12 candidates run concurrently; rate-limiting is handled by the client.
    const rawRows = await Promise.all(
      candidates.slice(0, 12).map(async (cand) => {
        const page = await client.findActiveListings({ keywords: cand.keyword, sortOn: 'score', limit: 25 });
        const sample = page.results ?? [];
        const resultCount = page.count ?? sample.length;
        // Use separate signals: faves from num_favorers, views as the traffic signal (if present).
        const faves = sample.reduce((a, l) => a + (l.num_favorers ?? 0), 0);
        const views = sample.reduce((a, l) => a + (l.views ?? 0), 0);
        const demand = est.demandScore({
          resultCount,
          aggregateReviewVelocity: 0, // not available in cross-shop search results
          favoritesSignal: faves,
          ...(views > 0 ? { aggregateViews: views } : {}),
        });
        const competition = est.competitionLevel(resultCount);
        const prices = sample.map((l) => priceValue(l.price)).filter((p) => p > 0);
        const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

        const prior = await history.prior(cand.keyword, 6 * 86_400);
        const trend = est.trendDelta(demand.score, prior ? prior.demandScore : null);
        await history.insert({
          keyword: cand.keyword,
          categoryId: cand.categoryId,
          demandScore: demand.score,
          resultCount,
          competition,
        });

        return {
          niche: cand.name,
          competition,
          demand: demand.label,
          demandScore: demand.score,
          avgPrice: formatMoney(avgPrice),
          listings: resultCount,
          growth: trend.change,
          estimated: { demand: true, growth: true } as const,
        };
      })
    );

    // Sort by opportunity (demand desc, competition asc) then strip internal demandScore.
    const niches: NicheFinderResponse['niches'] = rawRows
      .sort((a, b) => nicheOpScore(b.demand, b.competition) - nicheOpScore(a.demand, a.competition))
      .map(({ demandScore: _ds, ...row }) => ({
        ...row,
        opportunity: nicheOpLabel(row.demand, row.competition),
      }));

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
  // `sample` = no live Etsy key on this deployment, so any cron-built numbers are from fixtures.
  const sample = !hasEtsyKey(env);
  const { cache } = getEtsyContext(env);
  const categoryId = body.data.category ? normalize(body.data.category) : 'popular';
  const key = cacheKeys.bestsellers(categoryId);

  // best-sellers is served from cron-built cache (spec §4.5). On-demand uncached category →
  // fallback to popular (BA rec option (a)), never an expensive on-demand build.
  const cached = await cache.get<BestSellersResponse>(key);
  if (cached) {
    return c.json({ ...cached.payload, cached: cached.fresh, stale: !cached.fresh, sample });
  }
  if (categoryId !== 'popular') {
    const fallback = await cache.get<BestSellersResponse>(cacheKeys.bestsellers('popular'));
    if (fallback) {
      return c.json({ ...fallback.payload, cached: fallback.fresh, fallback: true, category: body.data.category ?? null, sample });
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
  return c.json({ ...payload, sample });
});

// --- etsy-trends (cost 1, Q11; cron-built cache) ----------------------------
const trendsBody = z.object({ filter: z.string().optional() });

router.post('/etsy-trends', requireAuth, requireCredits('etsy-trends'), async (c) => {
  const body = await readBody(c, trendsBody);
  if (!body.ok) return body.res;

  const env = getEnv(c);
  const sample = !hasEtsyKey(env);
  const { cache } = getEtsyContext(env);
  const key = cacheKeys.trends('all');

  const cached = await cache.get<EtsyTrendsResponse>(key);
  if (cached) {
    const filtered = applyTrendFilter(cached.payload, body.data.filter);
    const enriched = await enrichWithForecasts(filtered, getHistoryDb(c));
    return c.json({ ...enriched, cached: cached.fresh, stale: !cached.fresh, sample });
  }

  // Cron not run yet → empty, building-history state (BR-P3-10: no fabricated volumes).
  const payload: EtsyTrendsResponse = {
    cached: false,
    filter: body.data.filter ?? null,
    trends: [],
    buildingHistory: true,
  };
  return c.json({ ...payload, sample });
});

// --- whitespace-finder (cost 1; cron-built cache) ---------------------------
// A pure re-ranking VIEW over the cron-built trends cache: surfaces the best business-idea
// opportunities = high demand vs low supply/entry-velocity (the `whitespace` score, 0-100,
// computed by the weekly cron). No live Etsy fetch, no estimation — cache read only.
const whitespaceBody = z.object({
  filter: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

router.post('/whitespace-finder', requireAuth, requireCredits('whitespace-finder'), async (c) => {
  const body = await readBody(c, whitespaceBody);
  if (!body.ok) return body.res;

  const env = getEnv(c);
  const sample = !hasEtsyKey(env);
  const { cache } = getEtsyContext(env);
  const cached = await cache.get<EtsyTrendsResponse>(cacheKeys.trends('all'));

  if (!cached) {
    // Cron has not built the trends snapshot yet (or, before the column existed, no whitespace).
    return c.json({ cached: false, opportunities: [], buildingHistory: true, sample });
  }

  const filtered = applyTrendFilter(cached.payload, body.data.filter);
  const opportunities = filtered.trends
    .filter((r) => r.whitespace != null)
    .sort((a, b) => (b.whitespace ?? 0) - (a.whitespace ?? 0))
    .slice(0, body.data.limit ?? 25);

  return c.json({
    cached: cached.fresh,
    stale: !cached.fresh,
    filter: body.data.filter ?? null,
    opportunities,
    // True when the cache exists but no row carries a whitespace score yet (pre-cron-upgrade data).
    buildingHistory: opportunities.length === 0,
    sample,
  });
});

// --- selling-now (cost 1; cron-built cache) ---------------------------------
// A VIEW over the cron-built best-sellers cache ranked by REAL sales velocity (Δ
// transaction_sold_count per week from shop_pulse). Shows what is ACTUALLY accelerating in
// sales right now — measured, not estimated. Cache read only.
const sellingNowBody = z.object({
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

router.post('/selling-now', requireAuth, requireCredits('selling-now'), async (c) => {
  const body = await readBody(c, sellingNowBody);
  if (!body.ok) return body.res;

  const env = getEnv(c);
  const sample = !hasEtsyKey(env);
  const { cache } = getEtsyContext(env);
  const categoryId = body.data.category ? normalize(body.data.category) : 'popular';
  const cached =
    (await cache.get<BestSellersResponse>(cacheKeys.bestsellers(categoryId))) ??
    (await cache.get<BestSellersResponse>(cacheKeys.bestsellers('popular')));

  if (!cached) {
    return c.json({ cached: false, sellers: [], buildingVelocity: true, sample });
  }

  const limit = body.data.limit ?? 25;
  // Prefer shops with REAL measured velocity (2+ weekly snapshots → confidence ≠ 'building').
  const measured = cached.payload.shops
    .filter((s) => s.soldPerWeek != null && s.soldVelocityConfidence !== 'building')
    .sort((a, b) => (b.soldPerWeek ?? 0) - (a.soldPerWeek ?? 0))
    .slice(0, limit);

  if (measured.length > 0) {
    return c.json({
      cached: cached.fresh,
      stale: !cached.fresh,
      category: body.data.category ?? null,
      sellers: measured,
      buildingVelocity: false,
      sample,
    });
  }

  // No 2-snapshot velocity yet (needs a 2nd weekly cron run). Honest fallback: rank by the
  // estimated annual sales the cache already carries, flagged so the UI explains velocity is accruing.
  const fallback = [...cached.payload.shops]
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))
    .slice(0, limit);
  return c.json({
    cached: cached.fresh,
    stale: !cached.fresh,
    category: body.data.category ?? null,
    sellers: fallback,
    buildingVelocity: true, // real sales velocity needs ≥2 weekly snapshots; showing estimate meanwhile
    sample,
  });
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
    const rawReviews = reviewsPage.results ?? [];
    const totalReviewCount = shop.review_count ?? reviewsPage.count ?? rawReviews.length;
    // Paginate up to 4 additional pages (500 reviews total) when the shop has enough reviews.
    if (rawReviews.length === 100 && totalReviewCount > 100) {
      for (let page = 1; page <= 4; page++) {
        const extra = await client.getReviewsByShop(shopId, { limit: 100, offset: page * 100 });
        const batch = extra.results ?? [];
        rawReviews.push(...batch);
        if (batch.length < 100) break; // no more pages
      }
    }
    // Keep raw for stats (each transaction ≈ a sale); dedupe for display (multi-item orders repeat).
    const displayReviews = dedupeReviews(rawReviews);
    const total = totalReviewCount;
    const rating = shop.review_average ?? avgRating(rawReviews);
    const positive = displayReviews.length
      ? Math.round((displayReviews.filter((r) => r.rating >= 4).length / displayReviews.length) * 100)
      : 0;
    const ageYears = shop.created_timestamp
      ? Math.max(0, Math.floor((Date.now() / 1000 - shop.created_timestamp) / (365 * 86_400)))
      : 0;

    // Reputation risk (estimated): rating <4.0 or high negative ratio → higher risk.
    const negRatio = displayReviews.length ? displayReviews.filter((r) => r.rating <= 2).length / displayReviews.length : 0;
    let riskLevel: BuyerCheckResponse['riskLevel'] = 'low';
    if (rating < 4.0 || negRatio > 0.2) riskLevel = 'high';
    else if (rating < 4.5 || negRatio > 0.1) riskLevel = 'medium';

    // Rating trend — compare newest-N avg to overall (Etsy returns reviews newest-first).
    const recentN = Math.min(10, displayReviews.length);
    const recentSample = displayReviews.slice(0, recentN);
    const recentAvg = recentN > 0
      ? Math.round((recentSample.reduce((s, r) => s + r.rating, 0) / recentN) * 10) / 10
      : rating;
    const ratingDelta = Math.round((recentAvg - rating) * 10) / 10;
    const ratingTrend = {
      recentAvg,
      delta: ratingDelta,
      direction: (ratingDelta >= 0.3 ? 'improving' : ratingDelta <= -0.3 ? 'declining' : 'stable') as 'improving' | 'declining' | 'stable',
      sampleSize: recentN,
    };

    // Complaint signal scan — keyword presence + recent-30d count.
    const nowSec = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = nowSec - 30 * 86400;
    const COMPLAINT_PATTERNS = [
      { key: 'shipping',      label: 'Shipping delays',    keywords: ['delay', 'slow ship', 'took forever', 'never arriv', 'package lost', 'still waiting', 'took weeks', 'took a month', 'shipping issue', 'late arrival', 'late shipping', 'spotty'] },
      { key: 'quality',       label: 'Quality issues',     keywords: ['damaged', 'broken', 'poor quality', 'fell apart', 'cracked', 'scratched', 'defective', 'peeling', 'fading', 'falling off', 'not worth', 'cheaply made'] },
      { key: 'accuracy',      label: 'Not as described',   keywords: ['not as described', 'not as pictured', 'wrong color', 'wrong size', 'wrong item', 'different from', 'mislead', 'not what i expected', 'inaccurate', 'false advertising'] },
      { key: 'communication', label: 'Communication',      keywords: ['no response', 'unresponsive', 'no reply', 'ghosted', 'never respond', 'hard to reach', 'ignored my'] },
    ] as const;
    const complaints = COMPLAINT_PATTERNS.map(({ key, label, keywords }) => {
      const matching = displayReviews.filter((r) => {
        const text = (r.review ?? '').toLowerCase();
        return keywords.some((kw) => text.includes(kw));
      });
      const count = matching.length;
      const recentCount = matching.filter((r) => (r.created_timestamp ?? 0) > thirtyDaysAgo).length;
      return { key, label, count, pct: displayReviews.length ? Math.round((count / displayReviews.length) * 100) : 0, recentCount };
    }).filter((c) => c.count > 0).sort((a, b) => b.pct - a.pct);

    // Authenticity signals — review text patterns.
    const noTextCount = displayReviews.filter((r) => !(r.review ?? '').trim()).length;
    const shortTextCount = displayReviews.filter((r) => { const t = (r.review ?? '').trim(); return t.length > 0 && t.length < 20; }).length;
    const noTextPct = displayReviews.length ? Math.round((noTextCount / displayReviews.length) * 100) : 0;
    const shortTextPct = displayReviews.length ? Math.round((shortTextCount / displayReviews.length) * 100) : 0;
    let suspiciousBurst = false;
    let burstCount = 0;
    const fiveStarRevs = displayReviews.filter((r) => r.rating === 5);
    for (let i = 0; i < fiveStarRevs.length; i++) {
      const anchor = fiveStarRevs[i].created_timestamp ?? 0;
      if (!anchor) continue;
      const windowEnd = anchor - 7 * 86400;
      const inWindow = fiveStarRevs.filter((r) => { const ts = r.created_timestamp ?? 0; return ts > 0 && ts <= anchor && ts >= windowEnd; });
      if (inWindow.length >= 5) {
        const avgLen = inWindow.reduce((s, r) => s + (r.review ?? '').trim().length, 0) / inWindow.length;
        if (avgLen < 30) { suspiciousBurst = true; burstCount = Math.max(burstCount, inWindow.length); }
      }
    }
    const authenticity = { noTextPct, shortTextPct, suspiciousBurst, ...(suspiciousBurst ? { burstCount } : {}) };

    const payload: BuyerCheckResponse = {
      cached: false,
      shop: shop.shop_name,
      shopOpened: formatDate(shop.created_timestamp),
      totalReviews: total,
      avgRating: rating,
      positivePct: positive,
      accountAgeYears: ageYears,
      riskLevel,
      reviews: displayReviews.map((r) => ({
        product: r.listing_id ? `Listing ${r.listing_id}` : shop.shop_name,
        listingId: r.listing_id ?? undefined,
        rating: r.rating,
        text: r.review ?? '',
        date: formatDate(r.created_timestamp),
      })),
      reviewsSampled: displayReviews.length,
      rawFetched: rawReviews.length,
      complaints,
      ratingTrend,
      authenticity,
      estimated: { riskLevel: true },
    };

    await cache.put(key, payload, TTL.reviews);
    return c.json(payload);
  } catch (err) {
    const m = mapEtsyError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- listing-compare (cost 3) — batch fetch + estimation across 2-4 listings --
const compareBody = z.object({
  listings: z.array(z.string().min(1)).min(2).max(4),
});

router.post('/listing-compare', requireAuth, requireCredits('listing-compare'), async (c) => {
  const body = await readBody(c, compareBody);
  if (!body.ok) return body.res;

  // Parse + de-duplicate (preserving order). Any invalid input fails the whole request.
  const ids: number[] = [];
  for (const raw of body.data.listings) {
    const id = parseListingId(raw);
    if (id === null) {
      return c.json({ error: 'VALIDATION', message: `Not a valid Etsy listing: "${raw}"` }, 400);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length < 2) {
    return c.json({ error: 'VALIDATION', message: 'Enter at least 2 different listings.' }, 400);
  }

  const env = getEnv(c);
  const { client } = getEtsyContext(env);

  try {
    const est = await getEstimation();
    // Videos must be in `includes` or the listing's `videos` field comes back null → the
    // "Has video" comparison row would always show "No". Images power the thumbnail/count.
    const fetched = await client.getListingsByListingIds(ids, { includes: ['Images', 'Videos'] });
    const byId = new Map(fetched.map((l) => [l.listing_id, l] as const));

    const rows = ids
      .map((id) => byId.get(id))
      .filter((l): l is EtsyListing => Boolean(l))
      .map((listing) => {
        const images = listing.images ?? [];
        const audit = est.listingAudit({ ...listing, images });
        const overall = Math.round(
          (audit.title.score +
            audit.tags.score +
            audit.images.score +
            audit.video.score +
            audit.description.score) /
            5
        );
        const price = priceValue(listing.price);
        return {
          listingId: listing.listing_id,
          title: listing.title,
          url: listing.url,
          imageUrl: images[0]?.url_570xN ?? images[0]?.url_fullxfull ?? null,
          price: formatMoney(price, listing.price?.currency_code),
          priceValue: price,
          faves: listing.num_favorers ?? 0,
          tags: listing.tags ?? [],
          tagCount: listing.tags?.length ?? 0,
          titleLength: listing.title?.length ?? 0,
          imageCount: images.length,
          hasVideo: Array.isArray(listing.videos) && listing.videos.length > 0,
          seoScore: overall,
        };
      });

    if (rows.length < 2) {
      return c.json({ error: 'NOT_FOUND', message: 'Could not load enough of those listings to compare.' }, 404);
    }

    return c.json({ listings: rows, estimated: { seoScore: true } });
  } catch (err) {
    const m = mapEtsyError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- tag-gap (cost 3) — top-listings tag analysis vs your own --------------
const tagGapBody = z.object({
  keyword: z.string().min(1, 'keyword is required').max(120),
  myTags: z.array(z.string().min(1).max(40)).max(13).optional(),
});

router.post('/tag-gap', requireAuth, requireCredits('tag-gap'), async (c) => {
  const body = await readBody(c, tagGapBody);
  if (!body.ok) return body.res;

  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);
  const kw = body.data.keyword.trim();
  const key = cacheKeys.keyword(`taggap:${normalize(kw)}`);

  try {
    const cached = await cache.get<{ counts: [string, number][]; sampled: number }>(key);
    let tagCounts: Map<string, number>;
    let sampled: number;

    if (cached?.fresh) {
      tagCounts = new Map(cached.payload.counts);
      sampled = cached.payload.sampled;
    } else {
      const page = await client.findActiveListings({ keywords: kw, limit: 25 });
      const ids = (page.results ?? [])
        .map((l) => l.listing_id)
        .filter((id): id is number => Boolean(id))
        .slice(0, 25);
      const listings = ids.length ? await client.getListingsByListingIds(ids) : [];
      tagCounts = new Map<string, number>();
      for (const l of listings) {
        for (const t of l.tags ?? []) {
          const tag = t.trim().toLowerCase();
          if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
      sampled = listings.length;
      await cache.put(key, { counts: [...tagCounts.entries()], sampled }, TTL.keyword);
    }

    const mine = new Set((body.data.myTags ?? []).map((t) => t.trim().toLowerCase()));
    const all = [...tagCounts.entries()]
      .map(([tag, count]) => ({
        tag,
        count,
        inMine: mine.has(tag),
        sharePct: sampled ? Math.round((count / sampled) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const gaps = all.filter((t) => !t.inMine && t.count >= 2);

    await recordRun(env, getUser(c).id, 'tag-gap', kw, {
      gaps: gaps.slice(0, 10).map((g) => g.tag),
      sampled,
    });

    return c.json({
      keyword: kw,
      sampled,
      tags: all.slice(0, 40),
      gaps: gaps.slice(0, 20),
      hasMine: mine.size > 0,
    });
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

/**
 * Best-effort "saved run" write — appends a snapshot to the `analyses` table so it shows up in
 * the user's `/api/me/history` feed. Never throws: a failed history write must not fail the tool.
 */
async function recordRun(
  env: Env,
  userId: string,
  tool: string,
  subject: string,
  payload: unknown
): Promise<void> {
  try {
    await createAnalysesStore(env.DB).insert({ userId, tool, subject, payload });
  } catch {
    /* history is best-effort */
  }
}

interface NicheCandidate {
  name: string;
  keyword: string;
  categoryId: number | null;
}

function nicheOpScore(demand: string, competition: string): number {
  const d = demand === 'high' ? 3 : demand === 'medium' ? 2 : 1;
  const c = competition === 'low' ? 3 : competition === 'medium' ? 2 : 1;
  return d * 3 + c; // 4–12; demand weighted 3× so high-demand niches always rank above low-demand
}

function nicheOpLabel(demand: string, competition: string): import('$lib/server/services/etsy/types').OpportunityLabel {
  if (demand === 'high' && competition === 'low') return 'sweet-spot';
  if (demand === 'high' || (demand === 'medium' && competition === 'low')) return 'promising';
  if (demand === 'low') return 'low-traffic';
  return 'competitive';
}

/** Taxonomy-derived niche candidates (spec §4.4) — children of a matched node, else the query. */
function deriveNicheCandidates(
  taxonomy: Awaited<ReturnType<EtsyClient['getSellerTaxonomyNodes']>>,
  query: string
): NicheCandidate[] {
  const q = normalize(query);
  // Word-level fuzzy match: any word in the query overlaps any word in the node name.
  const words = (s: string) => s.split(/\s+/).filter(Boolean);
  const match = (node: { name: string }) => {
    const n = normalize(node.name);
    if (n.includes(q) || q.includes(n)) return true;
    const qWords = words(q);
    const nWords = words(n);
    return qWords.some((w) => w.length > 2 && nWords.some((nw) => nw.includes(w) || w.includes(nw)));
  };

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
  // No taxonomy match → synthesise diverse angle candidates so users still get useful results.
  const modifiers = ['personalized', 'custom', 'handmade', 'vintage', 'minimalist', 'boho', 'gift', 'unique'];
  return [
    { name: query, keyword: query, categoryId: null },
    ...modifiers.map((m) => ({ name: `${m} ${query}`, keyword: `${m} ${query}`, categoryId: null })),
  ];
}

/** Client-side-style filter (also done in FE) so the API response can pre-filter if asked. */
/**
 * Enrich each trend row with a predictive next-week `forecast` (the competitive differentiator).
 * Reads each keyword's recorded demand series from D1 and runs the pure `forecastTrend`. Rows
 * with <3 history points degrade honestly to a 'building' forecast. Failures are swallowed so a
 * forecasting hiccup never breaks the (already-cached) trends table.
 */
async function enrichWithForecasts(
  payload: EtsyTrendsResponse,
  db: ReturnType<typeof getDb>
): Promise<EtsyTrendsResponse> {
  if (!payload.trends.length) return payload;
  const history = createKeywordHistory(db);
  const trends = await Promise.all(
    payload.trends.map(async (row) => {
      try {
        const series = await history.series(row.keyword);
        return { ...row, forecast: forecastTrend(series) };
      } catch {
        return row;
      }
    })
  );
  return { ...payload, trends };
}

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

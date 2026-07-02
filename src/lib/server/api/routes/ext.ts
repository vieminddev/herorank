/**
 * `/ext` routes — the VieRank browser extension API.
 *
 * Default-exported `Hono<AppEnv>`, mounted by Engineer C via `app.route('/ext', ext)`.
 *
 * Two auth models live here:
 *   - `/token` (GET/POST) are SESSION-authed (`requireAuth`) — the signed-in user mints/rotates
 *     the opaque `vrk_<hex>` extension token shown in VieRank settings.
 *   - `/listing/:id` and `/keyword` are BEARER-authed via `userFromBearer` (the extension sends
 *     `Authorization: Bearer vrk_…`), NOT a session cookie — so they also serve CORS preflight
 *     (`OPTIONS`) and attach `corsHeaders()` to every response.
 *
 * The data endpoints are GLOBAL-cached (KV, `ext:`-prefixed keys) and read through the shared
 * public Etsy client (`getEtsyContext`) + estimation engine — they expose a slim, extension-sized
 * payload (score, tag count, faves, reviews / keyword competition).
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getDb, getEnv, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { getEtsyContext } from '../../services/etsy/provider';
import { cacheKeys, TTL, normalize } from '../../services/etsy/cache';
import { getEstimation } from '../../services/etsy/estimationContract';
import { EtsyError, EtsyNotFoundError } from '../../services/etsy/client';
import { loadReviewRateProvider } from '../../services/calibration/reviewRateProvider';
import { loadTaxonomyResolver } from '../../services/etsy/taxonomyResolver';
import type { EtsyReview } from '../../services/etsy/types';

const router = new Hono<AppEnv>();

// Small pure helpers mirrored from etsy-tools.ts so the extension's sales estimate uses the SAME
// model as the Listing Optimizer (consistency + honesty). Kept local to avoid refactoring the
// large tools file; these are stable.
function priceValue(p?: { amount: number; divisor: number }): number {
  if (!p || !p.divisor) return 0;
  return p.amount / p.divisor;
}
function formatExtMoney(v: number, currency?: string): string {
  const sym = !currency || currency === 'USD' ? '$' : currency + ' ';
  return `${sym}${v.toFixed(2)}`;
}
const SEC_90D = 90 * 86_400;
/** Reviews in the trailing 90 days, projected up when the observed span is shorter (sales signal). */
function reviewsLast90d(reviews: EtsyReview[], now = Date.now()): number {
  if (!reviews.length) return 0;
  const ts = reviews.map((r) => r.created_timestamp).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
  if (!ts.length) return 0;
  const cutoff = Math.floor(now / 1000) - SEC_90D;
  const within90 = ts.filter((t) => t >= cutoff).length;
  const spanDays = (ts[0] - ts[ts.length - 1]) / 86_400;
  if (spanDays >= 90) return within90;
  const projected = (ts.length / Math.max(1, spanDays)) * 90;
  return Math.round(Math.max(within90, projected));
}

/**
 * Honest conversion ESTIMATE: estimated monthly sales ÷ lifetime views, as a percentage string
 * (e.g. "2.3%"). Returns null when there's no usable signal — views is 0/absent, or there's no
 * sales signal. It mixes a monthly sales estimate with a LIFETIME view count, so it's a rough
 * indicator only; callers must keep it labeled "Est." (honesty USP).
 */
export function estConversionPct(monthlySales: number, views: number): string | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  if (!Number.isFinite(monthlySales) || monthlySales <= 0) return null;
  const pct = (monthlySales / views) * 100;
  return `${pct.toFixed(1)}%`;
}

/** Permissive CORS headers for the extension's cross-origin calls (read-only). */
function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
}

/**
 * Resolve the user id behind a `Bearer vrk_…` extension token, or null. Looks the raw token up in
 * `extension_tokens` — this is the auth seam for the public extension endpoints (no session).
 */
async function userFromBearer(c: Context<AppEnv>): Promise<string | null> {
  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const row = await getDb(c)
    .prepare('SELECT user_id FROM extension_tokens WHERE token = ?')
    .bind(token)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Extract a numeric listing id from a string (first run of 4+ digits), or null. */
function parseListingId(input: string): number | null {
  const m = input.match(/(\d{4,})/);
  return m ? Number(m[1]) : null;
}

/** Extract a shop name from a shop URL (…/shop/{name}) or use the bare string. */
function parseShopName(input: string): string {
  const m = input.match(/shop\/([^/?#]+)/i);
  return (m ? m[1] : input).trim();
}

function avgRating(reviews: EtsyReview[]): number {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return Math.round((sum / reviews.length) * 100) / 100;
}

// --- CORS preflight ---------------------------------------------------------
router.options('/listing/:id', () => new Response(null, { status: 204, headers: corsHeaders() }));
router.options('/keyword', () => new Response(null, { status: 204, headers: corsHeaders() }));
router.options('/shop/:name', () => new Response(null, { status: 204, headers: corsHeaders() }));

// ---------------------------------------------------------------------------
// GET /token — return (creating if needed) the caller's extension token
// ---------------------------------------------------------------------------
router.get('/token', requireAuth, async (c) => {
  const db = getDb(c);
  const userId = getUser(c).id;
  let row = await db
    .prepare('SELECT token FROM extension_tokens WHERE user_id = ?')
    .bind(userId)
    .first<{ token: string }>();
  if (!row) {
    const token = `vrk_${crypto.randomUUID().replace(/-/g, '')}`;
    await db
      .prepare('INSERT INTO extension_tokens (user_id, token, created_at) VALUES (?, ?, ?)')
      .bind(userId, token, Math.floor(Date.now() / 1000))
      .run();
    row = { token };
  }
  return c.json({ token: row.token });
});

// ---------------------------------------------------------------------------
// POST /token — rotate the caller's extension token
// ---------------------------------------------------------------------------
router.post('/token', requireAuth, async (c) => {
  const db = getDb(c);
  const userId = getUser(c).id;
  const token = `vrk_${crypto.randomUUID().replace(/-/g, '')}`;
  await db
    .prepare(
      'INSERT INTO extension_tokens (user_id, token, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at'
    )
    .bind(userId, token, Math.floor(Date.now() / 1000))
    .run();
  return c.json({ token });
});

// ---------------------------------------------------------------------------
// GET /listing/:id — slim listing snapshot for the extension (bearer-authed)
// ---------------------------------------------------------------------------
router.get('/listing/:id', async (c) => {
  const userId = await userFromBearer(c);
  if (!userId) {
    return c.json(
      { error: 'UNAUTHENTICATED', message: 'Connect the extension in VieRank settings.' },
      401,
      corsHeaders()
    );
  }
  const listingId = parseListingId(c.req.param('id'));
  if (!listingId) return c.json({ error: 'VALIDATION', message: 'Bad listing id' }, 400, corsHeaders());

  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);
  const key = cacheKeys.listing(listingId);

  try {
    const cached = await cache.get<{ ext: unknown }>(`ext:${key}`);
    if (cached?.fresh) return c.json(cached.payload.ext, 200, corsHeaders());

    const est = await getEstimation();
    // Videos must be included or the audit's video sub-score is always 0 (drags the composite).
    const listing = await client.getListing(listingId, { includes: ['Images', 'Videos'] });
    const images = listing.images?.length ? listing.images : [];
    const audit = est.listingAudit({ ...listing, images });
    const score = Math.round(
      (audit.title.score +
        audit.tags.score +
        audit.images.score +
        audit.video.score +
        audit.description.score) /
        5
    );
    // Pull up to 100 reviews (need timestamps for the 90-day sales signal) — same model as the
    // Listing Optimizer, so the extension's estimate matches the full tool.
    const reviewsPage = await client
      .getReviewsByListing(listingId, { limit: 100 })
      .catch(() => ({ count: 0, results: [] as EtsyReview[] }));
    const reviews = reviewsPage.results ?? [];
    const price = priceValue(listing.price);
    const reviewProvider = await loadReviewRateProvider(getDb(c));
    const { toTopLevel } = await loadTaxonomyResolver(client, cache);
    const sales = est.salesEstimate(
      {
        reviewsLast90d: reviewsLast90d(reviews),
        avgPrice: price,
        categoryId: toTopLevel(listing.taxonomy_id),
      },
      reviewProvider
    );
    const views = listing.views ?? 0;
    const ext = {
      listingId,
      title: listing.title,
      score,
      tagCount: listing.tags?.length ?? 0,
      faves: listing.num_favorers ?? 0,
      reviews: reviewsPage.count ?? reviews.length,
      price: price ? formatExtMoney(price, listing.price?.currency_code) : null,
      estSales: sales.monthlySales,
      estRevenue: sales.monthlyRevenue,
      // Lifetime cumulative view count (REAL, from the listing) + an honest conversion ESTIMATE
      // (monthly sales ÷ lifetime views). estConversion is null when there's no usable signal.
      views,
      estConversion: estConversionPct(sales.monthlySales, views),
      estimated: { score: true, sales: true, revenue: true, conversion: true },
    };
    await cache.put(`ext:${key}`, { ext }, TTL.listing, { hardTtl: TTL.listing });
    return c.json(ext, 200, corsHeaders());
  } catch (err) {
    // A listing id that doesn't exist on Etsy surfaces as EtsyNotFoundError → 404 (not a 502).
    const status = err instanceof EtsyNotFoundError ? 404 : err instanceof EtsyError ? 502 : 500;
    const msg = status === 404 ? 'That listing was not found.' : 'Could not load that listing.';
    return c.json({ error: status === 404 ? 'NOT_FOUND' : 'ETSY_UNAVAILABLE', message: msg }, status, corsHeaders());
  }
});

// ---------------------------------------------------------------------------
// GET /keyword — keyword competition for the extension (bearer-authed)
// ---------------------------------------------------------------------------
router.get('/keyword', async (c) => {
  const userId = await userFromBearer(c);
  if (!userId) {
    return c.json(
      { error: 'UNAUTHENTICATED', message: 'Connect the extension in VieRank settings.' },
      401,
      corsHeaders()
    );
  }
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ error: 'VALIDATION', message: 'q is required' }, 400, corsHeaders());

  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);
  const key = cacheKeys.keyword(`ext:${normalize(q)}`);

  try {
    const cached = await cache.get<{ count: number }>(key);
    let count: number;
    if (cached?.fresh) count = cached.payload.count;
    else {
      const page = await client.findActiveListings({ keywords: q, limit: 1 });
      count = page.count ?? 0;
      await cache.put(key, { count }, TTL.keyword);
    }
    const est = await getEstimation();
    return c.json({ keyword: q, listings: count, competition: est.competitionLevel(count) }, 200, corsHeaders());
  } catch {
    return c.json({ error: 'ETSY_UNAVAILABLE', message: 'Could not load competition.' }, 502, corsHeaders());
  }
});

// ---------------------------------------------------------------------------
// GET /shop/:name — slim shop stats for the extension (bearer-authed)
//
// A minimal mirror of buyer-check/shop-analyzer: resolve name → shop_id, then read shop fields
// (rating, review count, active-listing count) + a cheap review sample for the avg-rating
// fallback. Deliberately does NOT fetch all listings — the extension only needs headline stats.
// ---------------------------------------------------------------------------
router.get('/shop/:name', async (c) => {
  const userId = await userFromBearer(c);
  if (!userId) {
    return c.json(
      { error: 'UNAUTHENTICATED', message: 'Connect the extension in VieRank settings.' },
      401,
      corsHeaders()
    );
  }
  const shopName = parseShopName(c.req.param('name'));
  if (!shopName) return c.json({ error: 'VALIDATION', message: 'Bad shop name' }, 400, corsHeaders());

  const env = getEnv(c);
  const { client, cache } = getEtsyContext(env);
  const cacheKey = `ext:shop:${normalize(shopName)}`;

  try {
    const cached = await cache.get<{ ext: unknown }>(cacheKey);
    if (cached?.fresh) return c.json(cached.payload.ext, 200, corsHeaders());

    // Resolve name → shop_id (reusing the shared shopname cache to avoid repeat findShops).
    const nameKey = cacheKeys.shopName(shopName);
    let shopId: number | null = null;
    const cachedId = await cache.get<{ shopId: number }>(nameKey);
    if (cachedId?.fresh) shopId = cachedId.payload.shopId;
    if (shopId === null) {
      const found = await client.findShops({ shopName, limit: 1 });
      if (!found.length) {
        const notFound = {
          shopName,
          found: false,
          listings: 0,
          rating: 0,
          reviews: 0,
          sample: 0,
          estimated: { rating: false },
        };
        return c.json(notFound, 200, corsHeaders());
      }
      shopId = found[0].shop_id;
      await cache.put(nameKey, { shopId }, TTL.shop);
    }

    const shop = await client.getShop(shopId);
    // Cheap review sample: only used as a rating fallback when the shop field is absent.
    const reviewsPage = await client
      .getReviewsByShop(shopId, { limit: 100 })
      .catch(() => ({ count: 0, results: [] as EtsyReview[] }));
    const reviews = reviewsPage.results ?? [];

    const ext = {
      shopName: shop.shop_name,
      found: true,
      listings: shop.listing_active_count ?? 0,
      rating: shop.review_average ?? avgRating(reviews),
      reviews: shop.review_count ?? reviewsPage.count ?? reviews.length,
      sample: reviews.length,
      estimated: { rating: shop.review_average == null },
    };
    await cache.put(cacheKey, { ext }, TTL.shop);
    return c.json(ext, 200, corsHeaders());
  } catch (err) {
    const status = err instanceof EtsyNotFoundError ? 404 : err instanceof EtsyError ? 502 : 500;
    const msg = status === 404 ? 'That shop was not found.' : 'Could not load that shop.';
    return c.json({ error: status === 404 ? 'NOT_FOUND' : 'ETSY_UNAVAILABLE', message: msg }, status, corsHeaders());
  }
});

export default router;

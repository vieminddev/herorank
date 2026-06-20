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
import { EtsyError } from '../../services/etsy/client';

const router = new Hono<AppEnv>();

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

// --- CORS preflight ---------------------------------------------------------
router.options('/listing/:id', () => new Response(null, { status: 204, headers: corsHeaders() }));
router.options('/keyword', () => new Response(null, { status: 204, headers: corsHeaders() }));

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
    const listing = await client.getListing(listingId, { includes: ['Images'] });
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
    const reviews = await client
      .getReviewsByListing(listingId, { limit: 1 })
      .catch(() => ({ count: 0, results: [] }));
    const ext = {
      listingId,
      title: listing.title,
      score,
      tagCount: listing.tags?.length ?? 0,
      faves: listing.num_favorers ?? 0,
      reviews: reviews.count ?? 0,
      estimated: { score: true },
    };
    await cache.put(`ext:${key}`, { ext }, TTL.listing);
    return c.json(ext, 200, corsHeaders());
  } catch (err) {
    const status = err instanceof EtsyError ? 502 : 500;
    return c.json({ error: 'ETSY_UNAVAILABLE', message: 'Could not load that listing.' }, status, corsHeaders());
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

export default router;

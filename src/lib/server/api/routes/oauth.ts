/**
 * OAuth connect routes (Engineer H) — `/api/connect/etsy/*` (BA spec §3.1, contract A).
 *
 * Default-exported `Hono<AppEnv>`. MOUNT POINT: this router is mounted at the `/api/connect`
 * prefix (one ROUTERS entry in `app.ts`, owned by A/C — see 02_contract_H.md §mount). Relative
 * paths here (`/etsy/start`, `/etsy/callback`, `/etsy/refresh`, `/etsy`) become `/api/connect/*`.
 * This file does NOT mount itself and does NOT touch tools.ts.
 *
 * Flow (Authorization Code + PKCE, read-only scopes):
 *   GET    /etsy/start     requireAuth → gen state + PKCE → store in oauth_states (D1) → 302 authorize
 *   GET    /etsy/callback  requireAuth → verify state (CSRF) → exchange code → encrypt+store → 302 settings
 *   POST   /etsy/refresh   requireAuth → refresh access token for the caller's primary (or :shopId) shop
 *   POST   /etsy/primary   requireAuth → set the caller's primary shop { shopId }
 *   DELETE /etsy/:shopId   requireAuth → disconnect ONE shop (promotes another if it was primary)
 *   GET    /etsy           requireAuth → connection status: { connected, shops[] } (NEVER tokens)
 *
 * Multi-shop (migration 0015): a user can connect MANY Etsy shops. `/etsy/start` reuses the same
 * flow to connect the first OR an additional shop (the repo ADDS shops; the first becomes primary).
 *
 * Mock path (BR-P4-OAUTH-05): with no ETSY_OAUTH_CLIENT_ID, `getEtsyOAuth` returns the mock and
 * `buildAuthorizeUrl` produces a local `/api/connect/etsy/callback?code=mock_code&state=…` URL,
 * so the entire flow completes in dev/test with no real Etsy call.
 *
 * Token security (BR-P4-OAUTH-03): tokens are encrypted via `createTokenCipher(env.OAUTH_TOKEN_KEY)`
 * before they touch D1; nothing here logs tokens.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { getEnv, getUser } from '../context';
import { getEtsyOAuth, isMockOAuth } from '../../services/oauth/provider';
import { createTokenCipher, TokenCryptoError } from '../../services/oauth/crypto';
import { createConnectedShopRepo, type ConnectedShop } from '../../services/oauth/connectedShopRepo';
import { generatePkce, randomUrlToken, EtsyOAuthError } from '../../services/oauth/etsyOAuth';
import {
  ETSY_OAUTH_SCOPE_STRING,
  ETSY_OAUTH_SCOPE_STRING_WRITE,
  isWriteEnabled,
} from '../../services/etsy/etsyWriteClient';
import { createSubscriptionRepo } from '../../repositories/subscriptionRepo';
import type { PlanSlug } from '../../services/types';

const router = new Hono<AppEnv>();

/** Where the FE settings page lives (302 target after callback). */
const SETTINGS_CONNECTIONS = '/settings/connections';

/**
 * Max simultaneously-connected Etsy shops per plan (matches the pricing page tiers). Enforced at
 * the callback: re-connecting a shop you ALREADY linked is always allowed (e.g. to add the write
 * scope); only a genuinely NEW shop beyond your plan's cap is rejected.
 */
const SHOP_LIMITS: Record<PlanSlug, number> = {
  free: 1,
  side: 3,
  business: 10,
  enterprise: 25,
};
function shopLimitFor(plan: string): number {
  return (SHOP_LIMITS as Record<string, number>)[plan] ?? SHOP_LIMITS.free;
}

// ---------------------------------------------------------------------------
// GET /etsy/start — begin the OAuth dance
// ---------------------------------------------------------------------------
router.get('/etsy/start', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const oauth = getEtsyOAuth(env);
  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);

  const repo = createConnectedShopRepo(getDb(env), cipher);

  const state = randomUrlToken(24);
  const { codeVerifier, codeChallenge } = await generatePkce();
  await repo.putState({ state, userId: user.id, codeVerifier });

  // Per-connection scope choice: read-only by default; add the write scope ONLY when the user
  // opted in (?write=1) AND the app is approved for write (ETSY_WRITE_ENABLED). Requesting an
  // unapproved scope would make Etsy reject the authorize request, so the flag gates it.
  const wantsWrite = c.req.query('write') === '1';
  const scope =
    wantsWrite && isWriteEnabled(env) ? ETSY_OAUTH_SCOPE_STRING_WRITE : ETSY_OAUTH_SCOPE_STRING;

  const authorizeUrl = oauth.buildAuthorizeUrl({ state, codeChallenge, scope });
  return c.redirect(authorizeUrl, 302);
});

// ---------------------------------------------------------------------------
// GET /etsy/callback — exchange code, persist encrypted tokens
// ---------------------------------------------------------------------------
router.get('/etsy/callback', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const code = c.req.query('code');
  const state = c.req.query('state');
  const oauthError = c.req.query('error');

  if (oauthError) {
    return c.redirect(`${SETTINGS_CONNECTIONS}?error=${encodeURIComponent(oauthError)}`, 302);
  }
  if (!code || !state) {
    return c.json({ error: 'VALIDATION', message: 'Missing code/state' }, 400);
  }

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);
  const repo = createConnectedShopRepo(getDb(env), cipher);

  // CSRF: state must exist, belong to THIS user, and not be expired (BR-P4-OAUTH-01).
  const stateRow = await repo.takeState(state);
  if (!stateRow || stateRow.user_id !== user.id) {
    return c.json({ error: 'VALIDATION', message: 'Invalid or expired state' }, 400);
  }

  try {
    const oauth = getEtsyOAuth(env);
    const tokens = await oauth.exchangeCode({ code, codeVerifier: stateRow.code_verifier });
    const shop = await oauth.getMyShop(tokens.accessToken);

    // Plan-based connected-shop cap. Re-linking a shop already connected is always allowed
    // (updates tokens/scope); a NEW shop beyond the plan's limit is rejected.
    const existing = await repo.listForUser(user.id);
    const alreadyLinked = existing.some((s) => s.etsyShopId === shop.shopId);
    if (!alreadyLinked) {
      const plan = (await createSubscriptionRepo(getDb(env)).getByUserId(user.id))?.plan ?? 'free';
      if (existing.length >= shopLimitFor(plan)) {
        return c.redirect(`${SETTINGS_CONNECTIONS}?error=shop_limit`, 302);
      }
    }

    await repo.upsertShop({
      userId: user.id,
      etsyShopId: shop.shopId,
      shopName: shop.shopName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    });

    return c.redirect(`${SETTINGS_CONNECTIONS}?connected=1`, 302);
  } catch (err) {
    const reason = err instanceof EtsyOAuthError ? 'exchange_failed' : 'connect_failed';
    return c.redirect(`${SETTINGS_CONNECTIONS}?error=${reason}`, 302);
  }
});

// ---------------------------------------------------------------------------
// POST /etsy/refresh — proactively refresh a shop's access token
// (defaults to the caller's PRIMARY shop; accepts optional { shopId } to target one)
// ---------------------------------------------------------------------------
router.post('/etsy/refresh', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);
  const repo = createConnectedShopRepo(getDb(env), cipher);

  // Optional body { shopId }; default to the primary shop when omitted.
  const shopId = await readShopId(c);
  const shop = await repo.getShop(user.id, shopId ?? undefined);
  if (!shop) return c.json({ error: 'NOT_FOUND', message: 'No connected shop' }, 404);

  try {
    const oauth = getEtsyOAuth(env);
    const tokens = await oauth.refresh(shop.refreshToken);
    await repo.updateTokens({
      userId: user.id,
      etsyShopId: shop.etsyShopId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    });
    return c.json({ ok: true, expiresAt: tokens.expiresAt });
  } catch {
    return c.json({ error: 'ETSY_UNAVAILABLE', message: 'Token refresh failed' }, 502);
  }
});

// ---------------------------------------------------------------------------
// POST /etsy/primary — make { shopId } the caller's primary (default) shop
// ---------------------------------------------------------------------------
router.post('/etsy/primary', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);
  const repo = createConnectedShopRepo(getDb(env), cipher);

  const shopId = await readShopId(c);
  if (shopId === null) {
    return c.json({ error: 'VALIDATION', message: 'Missing or invalid shopId' }, 400);
  }
  // Only let a user promote a shop they actually own.
  const shop = await repo.getShop(user.id, shopId);
  if (!shop) return c.json({ error: 'NOT_FOUND', message: 'Shop not connected' }, 404);

  await repo.setPrimary(user.id, shopId);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /etsy/:shopId — disconnect ONE shop (promotes another if it was primary)
// ---------------------------------------------------------------------------
router.delete('/etsy/:shopId', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const shopId = Number(c.req.param('shopId'));
  if (!Number.isInteger(shopId)) {
    return c.json({ error: 'VALIDATION', message: 'Invalid shopId' }, 400);
  }

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);
  const repo = createConnectedShopRepo(getDb(env), cipher);

  await repo.deleteShop(user.id, shopId);
  const remaining = (await repo.listForUser(user.id)).length;
  return c.json({ ok: true, remaining });
});

// ---------------------------------------------------------------------------
// GET /etsy — connection status (for the settings page). NEVER exposes tokens.
// ---------------------------------------------------------------------------
router.get('/etsy', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ connected: false, mock: isMockOAuth(env), shops: [] });
  const repo = createConnectedShopRepo(getDb(env), cipher);

  const shops = await repo.listForUser(user.id);
  return c.json({
    connected: shops.length > 0,
    mock: isMockOAuth(env),
    shops: shops.map(toPublicShop),
  });
});

export default router;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Public (token-free) view of a connected shop returned by GET /etsy. */
export interface ConnectedShopPublic {
  etsyShopId: number;
  shopName: string | null;
  isPrimary: boolean;
  scopes: string;
  connectedAt: number;
  lastCalibratedAt: number | null;
}

/** Project a decrypted shop to its public shape — NEVER includes access/refresh tokens. */
function toPublicShop(shop: ConnectedShop): ConnectedShopPublic {
  return {
    etsyShopId: shop.etsyShopId,
    shopName: shop.shopName,
    isPrimary: shop.isPrimary,
    scopes: shop.scopes,
    connectedAt: shop.connectedAt,
    lastCalibratedAt: shop.lastCalibratedAt,
  };
}

/** Read a numeric `shopId` from the JSON body; null when absent/invalid (body optional). */
async function readShopId(c: Context<AppEnv>): Promise<number | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null; // no/invalid body — caller decides if that's an error
  }
  const shopId = (raw as { shopId?: unknown })?.shopId;
  return typeof shopId === 'number' && Number.isInteger(shopId) ? shopId : null;
}

/** Build a cipher; return null (→ caller emits a clean 500) when the key is missing. */
async function safeCipher(secret: string | undefined) {
  try {
    return await createTokenCipher(secret);
  } catch (err) {
    if (err instanceof TokenCryptoError) return null;
    throw err;
  }
}

/** D1 handle from env (request-less helper; same DB the withDb middleware uses). */
function getDb(env: { DB: import('@cloudflare/workers-types').D1Database }) {
  return env.DB;
}

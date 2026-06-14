/**
 * OAuth connect routes (Engineer H) — `/api/connect/etsy/*` (BA spec §3.1, contract A).
 *
 * Default-exported `Hono<AppEnv>`. MOUNT POINT: this router is mounted at the `/api/connect`
 * prefix (one ROUTERS entry in `app.ts`, owned by A/C — see 02_contract_H.md §mount). Relative
 * paths here (`/etsy/start`, `/etsy/callback`, `/etsy/refresh`, `/etsy`) become `/api/connect/*`.
 * This file does NOT mount itself and does NOT touch tools.ts.
 *
 * Flow (Authorization Code + PKCE, read-only scopes):
 *   GET    /etsy/start    requireAuth → gen state + PKCE → store in oauth_states (D1) → 302 authorize
 *   GET    /etsy/callback requireAuth → verify state (CSRF) → exchange code → encrypt+store → 302 settings
 *   POST   /etsy/refresh  requireAuth → refresh access token for the caller's shop
 *   DELETE /etsy          requireAuth → disconnect (delete connected_shops row)
 *
 * Mock path (BR-P4-OAUTH-05): with no ETSY_OAUTH_CLIENT_ID, `getEtsyOAuth` returns the mock and
 * `buildAuthorizeUrl` produces a local `/api/connect/etsy/callback?code=mock_code&state=…` URL,
 * so the entire flow completes in dev/test with no real Etsy call.
 *
 * Token security (BR-P4-OAUTH-03): tokens are encrypted via `createTokenCipher(env.OAUTH_TOKEN_KEY)`
 * before they touch D1; nothing here logs tokens.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { getEnv, getUser } from '../context';
import { getEtsyOAuth, isMockOAuth } from '../../services/oauth/provider';
import { createTokenCipher, TokenCryptoError } from '../../services/oauth/crypto';
import { createConnectedShopRepo } from '../../services/oauth/connectedShopRepo';
import { generatePkce, randomUrlToken, EtsyOAuthError } from '../../services/oauth/etsyOAuth';

const router = new Hono<AppEnv>();

/** Where the FE settings page lives (302 target after callback). */
const SETTINGS_CONNECTIONS = '/settings/connections';

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

  const authorizeUrl = oauth.buildAuthorizeUrl({ state, codeChallenge });
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
// POST /etsy/refresh — proactively refresh the caller's access token
// ---------------------------------------------------------------------------
router.post('/etsy/refresh', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);
  const repo = createConnectedShopRepo(getDb(env), cipher);

  const shop = await repo.getShop(user.id);
  if (!shop) return c.json({ error: 'NOT_FOUND', message: 'No connected shop' }, 404);

  try {
    const oauth = getEtsyOAuth(env);
    const tokens = await oauth.refresh(shop.refreshToken);
    await repo.updateTokens({
      userId: user.id,
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
// DELETE /etsy — disconnect
// ---------------------------------------------------------------------------
router.delete('/etsy', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ error: 'INTERNAL', message: 'OAuth not configured' }, 500);
  const repo = createConnectedShopRepo(getDb(env), cipher);

  await repo.deleteShop(user.id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /etsy — connection status (for the settings page)
// ---------------------------------------------------------------------------
router.get('/etsy', requireAuth, async (c) => {
  const env = getEnv(c);
  const user = getUser(c);

  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return c.json({ connected: false, mock: isMockOAuth(env) });
  const repo = createConnectedShopRepo(getDb(env), cipher);

  const shop = await repo.getShop(user.id);
  return c.json({
    connected: !!shop,
    mock: isMockOAuth(env),
    shop: shop
      ? { shopName: shop.shopName, lastCalibratedAt: shop.lastCalibratedAt, connectedAt: shop.connectedAt }
      : null,
  });
});

export default router;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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

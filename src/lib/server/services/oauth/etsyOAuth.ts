/**
 * Etsy OAuth 2.0 (Authorization Code + PKCE) + own-shop reads (Engineer H).
 *
 * Etsy v3 uses OAuth 2.0 Authorization Code grant with PKCE (research §5). This module is a
 * thin, dependency-injected wrapper over the documented endpoints:
 *   - authorize:  https://www.etsy.com/oauth/connect           (browser redirect)
 *   - token:      https://api.etsy.com/v3/public/oauth/token   (code→token, refresh)
 *   - own-shop reads (transactions_r / shops_r / listings_r) under api.etsy.com/v3/...
 *
 * Design rules (mandated by the task brief):
 *   - `fetch` only, NO SDK. `fetchImpl` is INJECTED so tests (and the mock provider) drive the
 *     whole flow without a real Etsy key — pass a stub that returns canned token/transaction
 *     JSON. Production passes the global `fetch`.
 *   - READ-ONLY scopes only: `transactions_r shops_r listings_r` (BR-P4-OAUTH-02). No write scope.
 *   - PKCE: a high-entropy `code_verifier` + its S256 `code_challenge`; `state` for CSRF. These
 *     are produced via Web Crypto (`crypto.subtle`) so they match the Workers runtime exactly.
 *   - Tokens are returned RAW here; encryption-at-rest is the caller's job (see `crypto.ts` +
 *     `connectedShopRepo.ts`). This module never persists or logs tokens.
 */

// READ-ONLY scopes for calibration (own-shop only). NEVER add a *_w scope here.
export const ETSY_OAUTH_SCOPES = ['transactions_r', 'shops_r', 'listings_r'] as const;
export const ETSY_OAUTH_SCOPE_STRING = ETSY_OAUTH_SCOPES.join(' ');

export const ETSY_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
export const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
export const ETSY_API_BASE = 'https://api.etsy.com/v3/application';

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface EtsyOAuthConfig {
  clientId: string;
  redirectUri: string;
  /**
   * App shared secret. Since 2026-02-09 Etsy requires the `x-api-key` header to carry
   * `keystring:shared_secret` (not just the keystring) — without it every v3 API call 403s
   * with "Shared secret is required in x-api-key header." Optional so tests/mock can omit it.
   */
  sharedSecret?: string;
  /** Injected fetch (real `fetch` in prod, a stub in tests / mock provider). */
  fetchImpl?: FetchImpl;
  /** Override authorize/token/api hosts (tests point these at a local stub). */
  authorizeUrl?: string;
  tokenUrl?: string;
  apiBase?: string;
  /**
   * Space-separated scope string to request at authorize time. Defaults to the READ-ONLY
   * `ETSY_OAUTH_SCOPE_STRING`. The provider passes `oauthScopeString(env)` (which appends
   * `listings_w` once `ETSY_WRITE_ENABLED` is on) so the listing-editor write feature gets the
   * write scope without touching this client's read-only default.
   */
  scope?: string;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string; // S256(codeVerifier), base64url
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute epoch SECONDS at which the access token expires (now + expires_in). */
  expiresAt: number;
  /** Space-separated granted scopes (echoed back from Etsy or our requested set). */
  scopes: string;
}

/** Minimal own-shop transaction shape (transactions_r). Only fields calibration needs. */
export interface EtsyTransaction {
  transaction_id: number;
  listing_id: number;
  /** epoch seconds the transaction was paid/created. */
  created_timestamp: number;
}

export interface EtsyOAuthClient {
  /** Build the browser authorize URL (state + S256 challenge embedded; optional scope override). */
  buildAuthorizeUrl(input: { state: string; codeChallenge: string; scope?: string }): string;
  /** Exchange an authorization code (+ the matching verifier) for tokens. */
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<OAuthTokens>;
  /** Refresh an access token from a refresh token. */
  refresh(refreshToken: string): Promise<OAuthTokens>;
  /** Resolve the connected user's own shop (shops_r) via the `getMe`/shop endpoint. */
  getMyShop(accessToken: string): Promise<{ shopId: number; shopName: string }>;
  /** Paginate own-shop transactions in [sinceEpochSec, now] (transactions_r). */
  getShopTransactions(input: {
    accessToken: string;
    shopId: number;
    sinceEpochSec: number;
  }): Promise<EtsyTransaction[]>;
}

// ---------------------------------------------------------------------------
// PKCE + state (Web Crypto — Workers-correct)
// ---------------------------------------------------------------------------

/** URL-safe random token (default 32 bytes → 43-char base64url). Used for state + verifier. */
export function randomUrlToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

/** Generate a PKCE verifier + its S256 challenge (RFC 7636). */
export async function generatePkce(): Promise<PkcePair> {
  const codeVerifier = randomUrlToken(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64Url(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export function createEtsyOAuthClient(cfg: EtsyOAuthConfig): EtsyOAuthClient {
  const doFetch: FetchImpl = cfg.fetchImpl ?? ((i, init) => fetch(i, init));
  const authorizeUrl = cfg.authorizeUrl ?? ETSY_AUTHORIZE_URL;
  const tokenUrl = cfg.tokenUrl ?? ETSY_TOKEN_URL;
  const apiBase = cfg.apiBase ?? ETSY_API_BASE;
  // Etsy requires the keystring on every v3 call, and since 2026-02-09 it must be paired with
  // the shared secret as `keystring:secret` (keystring alone now 403s).
  const apiKeyHeader = cfg.sharedSecret ? `${cfg.clientId}:${cfg.sharedSecret}` : cfg.clientId;
  // Read-only baseline by default; the provider may pass a wider scope (e.g. + `listings_w`)
  // when `ETSY_WRITE_ENABLED` is on so the listing editor can PUT edits.
  const requestedScope = cfg.scope ?? ETSY_OAUTH_SCOPE_STRING;

  function buildAuthorizeUrl({
    state,
    codeChallenge,
    scope,
  }: {
    state: string;
    codeChallenge: string;
    /** Override the configured scope for this single authorize call (rarely needed). */
    scope?: string;
  }): string {
    const u = new URL(authorizeUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', cfg.clientId);
    u.searchParams.set('redirect_uri', cfg.redirectUri);
    u.searchParams.set('scope', scope ?? requestedScope);
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  async function postToken(body: Record<string, string>): Promise<OAuthTokens> {
    const res = await doFetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      throw new EtsyOAuthError(`token endpoint ${res.status}`, res.status);
    }
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!json.access_token || !json.refresh_token) {
      throw new EtsyOAuthError('token response missing access_token/refresh_token', 502);
    }
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: nowSec() + expiresIn,
      scopes: requestedScope,
    };
  }

  return {
    buildAuthorizeUrl,

    async exchangeCode({ code, codeVerifier }) {
      return postToken({
        grant_type: 'authorization_code',
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        code,
        code_verifier: codeVerifier,
      });
    },

    async refresh(refreshToken) {
      return postToken({
        grant_type: 'refresh_token',
        client_id: cfg.clientId,
        refresh_token: refreshToken,
      });
    },

    async getMyShop(accessToken) {
      // Etsy v3 has no `me` alias on the nested /shops resource (returns 403). Use the
      // documented getShopByOwnerUserId endpoint: GET /users/{user_id}/shops. Etsy access
      // tokens are prefixed with the owner's user id ("{user_id}.{secret}"), so we read it
      // from the token rather than making an extra getMe call. Tests stub this via fetchImpl.
      const userId = accessToken.split('.')[0];
      const res = await authedGet(`${apiBase}/users/${userId}/shops`, accessToken);
      const json = (await res.json()) as
        | { shop_id?: number; shop_name?: string }
        | { results?: Array<{ shop_id: number; shop_name: string }> };
      const shop =
        'results' in json && json.results?.length
          ? json.results[0]
          : (json as { shop_id?: number; shop_name?: string });
      if (!shop || typeof shop.shop_id !== 'number') {
        throw new EtsyOAuthError('could not resolve connected shop', 502);
      }
      return { shopId: shop.shop_id, shopName: shop.shop_name ?? `shop-${shop.shop_id}` };
    },

    async getShopTransactions({ accessToken, shopId, sinceEpochSec }) {
      const out: EtsyTransaction[] = [];
      const pageSize = 100;
      let offset = 0;
      // Bounded paginate — stop on a short page or when we run past `sinceEpochSec`.
      for (let guard = 0; guard < 100; guard++) {
        const url = `${apiBase}/shops/${shopId}/transactions?limit=${pageSize}&offset=${offset}`;
        const res = await authedGet(url, accessToken);
        const json = (await res.json()) as { count?: number; results?: EtsyTransaction[] };
        const results = json.results ?? [];
        for (const t of results) {
          if (typeof t.created_timestamp === 'number' && t.created_timestamp >= sinceEpochSec) {
            out.push(t);
          }
        }
        if (results.length < pageSize) break;
        offset += pageSize;
      }
      return out;
    },
  };

  async function authedGet(url: string, accessToken: string): Promise<Response> {
    const res = await doFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': apiKeyHeader,
      },
    });
    if (!res.ok) throw new EtsyOAuthError(`etsy api ${res.status} for ${stripUrl(url)}`, res.status);
    return res;
  }
}

export class EtsyOAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'EtsyOAuthError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** base64url (no padding) of raw bytes. */
function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Drop query string from a URL for safe logging (never log tokens / api-keys). */
function stripUrl(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

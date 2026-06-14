/**
 * OAuth + calibration tests (Engineer H) — fully hermetic, NO real Etsy key / OAuth (BR-P4-OAUTH-05).
 *
 * Covers:
 *   - PKCE: code_challenge = S256(code_verifier), base64url, distinct verifiers.
 *   - crypto: encrypt→decrypt round-trip, ciphertext ≠ plaintext, wrong key fails (BR-P4-OAUTH-03).
 *   - token exchange/refresh via injected fetchImpl (mock token endpoint) — real client code path.
 *   - connectedShopRepo: encrypted-at-rest, 1-shop/user enforce (upsert), state CSRF + expiry.
 *   - calibrationJob: mock transactions+reviews → calibration_factors review_rate = Σreviews/Σtx.
 *   - reviewRateProvider: reads factors, MIN_SAMPLE gate, falls back to null below threshold.
 *
 * Relative imports (not $lib) keep the suite independent of the SvelteKit alias resolver.
 */
import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
  generatePkce,
  randomUrlToken,
  createEtsyOAuthClient,
  ETSY_OAUTH_SCOPE_STRING,
  type FetchImpl,
} from '../src/lib/server/services/oauth/etsyOAuth';
import {
  createTokenCipher,
  encryptToken,
  decryptToken,
  TokenCryptoError,
} from '../src/lib/server/services/oauth/crypto';
import { createConnectedShopRepo } from '../src/lib/server/services/oauth/connectedShopRepo';
import { createMockOAuthClient, mockListingTaxonomy } from '../src/lib/server/services/oauth/mockOAuth';
import { calibrationJob } from '../src/lib/server/services/calibration/calibrationJob';
import {
  reviewRateProviderFromFactors,
  loadReviewRateProvider,
  MIN_SAMPLE,
  type CalibrationFactor,
} from '../src/lib/server/services/calibration/reviewRateProvider';
import type { Env } from '../src/lib/server/env';
import type { EtsyClient, EtsyReviewPage } from '../src/lib/server/services/etsy/types';

const ENC_KEY = 'test-oauth-token-key-0123456789';

// ---------------------------------------------------------------------------
// In-memory D1 fake — handles oauth_states, connected_shops, calibration_factors
// ---------------------------------------------------------------------------
function makeD1() {
  const states = new Map<string, { state: string; user_id: string; code_verifier: string; created_at: number }>();
  const shops = new Map<string, Record<string, unknown>>(); // user_id → row
  const factors = new Map<number, { category_id: number; review_rate: number; sample_size: number; updated_at: number }>();
  const nowSec = () => Math.floor(Date.now() / 1000);

  function prepare(sql: string) {
    let args: unknown[] = [];
    const api = {
      bind(...a: unknown[]) {
        args = a;
        return api;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('FROM oauth_states')) {
          return (states.get(args[0] as string) ?? null) as unknown as T | null;
        }
        if (sql.includes('FROM connected_shops')) {
          return (shops.get(args[0] as string) ?? null) as unknown as T | null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith('INSERT INTO oauth_states')) {
          const [state, user_id, code_verifier] = args as [string, string, string];
          states.set(state, { state, user_id, code_verifier, created_at: nowSec() });
        } else if (sql.startsWith('DELETE FROM oauth_states WHERE state')) {
          states.delete(args[0] as string);
        } else if (sql.startsWith('DELETE FROM oauth_states WHERE created_at')) {
          const cutoff = args[0] as number;
          for (const [k, v] of states) if (v.created_at < cutoff) states.delete(k);
        } else if (sql.startsWith('INSERT INTO connected_shops')) {
          const [user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at, scopes] =
            args as [string, number, string | null, string, string, number, string];
          shops.set(user_id, {
            user_id,
            etsy_shop_id,
            shop_name,
            access_token_enc,
            refresh_token_enc,
            token_expires_at,
            scopes,
            connected_at: nowSec(),
            last_calibrated_at: null,
          });
        } else if (sql.startsWith('UPDATE connected_shops SET last_calibrated_at')) {
          const [at, user_id] = args as [number, string];
          const row = shops.get(user_id);
          if (row) row.last_calibrated_at = at;
        } else if (sql.startsWith('UPDATE connected_shops SET access_token_enc')) {
          const [access_token_enc, refresh_token_enc, token_expires_at, user_id] = args as [string, string, number, string];
          const row = shops.get(user_id);
          if (row) Object.assign(row, { access_token_enc, refresh_token_enc, token_expires_at });
        } else if (sql.startsWith('DELETE FROM connected_shops')) {
          shops.delete(args[0] as string);
        } else if (sql.startsWith('INSERT INTO calibration_factors')) {
          const [category_id, review_rate, sample_size] = args as [number, number, number];
          factors.set(category_id, { category_id, review_rate, sample_size, updated_at: nowSec() });
        }
        return { success: true };
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes('FROM connected_shops')) {
          return { results: [...shops.values()] as unknown as T[] };
        }
        if (sql.includes('FROM calibration_factors')) {
          return { results: [...factors.values()] as unknown as T[] };
        }
        return { results: [] };
      },
    };
    return api;
  }

  const db = { prepare } as unknown as D1Database;
  return { db, states, shops, factors };
}

function baseEnv(over: Partial<Env> = {}): Env {
  return { OAUTH_TOKEN_KEY: ENC_KEY, ...over } as unknown as Env;
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------
describe('PKCE', () => {
  it('derives an S256 base64url challenge from the verifier', async () => {
    const { codeVerifier, codeChallenge } = await generatePkce();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    // base64url alphabet only, no padding
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    // recompute S256 and compare
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const expected = b64url(new Uint8Array(digest));
    expect(codeChallenge).toBe(expected);
  });

  it('produces distinct verifiers each call', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it('randomUrlToken is url-safe and non-repeating', () => {
    const a = randomUrlToken();
    const b = randomUrlToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// crypto
// ---------------------------------------------------------------------------
describe('token crypto (AES-GCM)', () => {
  it('round-trips encrypt → decrypt', async () => {
    const ct = await encryptToken(ENC_KEY, 'super.secret.token');
    expect(ct).not.toContain('super.secret.token');
    expect(await decryptToken(ENC_KEY, ct)).toBe('super.secret.token');
  });

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    const a = await encryptToken(ENC_KEY, 'tok');
    const b = await encryptToken(ENC_KEY, 'tok');
    expect(a).not.toBe(b);
    expect(await decryptToken(ENC_KEY, a)).toBe('tok');
    expect(await decryptToken(ENC_KEY, b)).toBe('tok');
  });

  it('fails to decrypt with the wrong key', async () => {
    const ct = await encryptToken(ENC_KEY, 'tok');
    await expect(decryptToken('a-different-key', ct)).rejects.toBeInstanceOf(TokenCryptoError);
  });

  it('throws when the key is missing', async () => {
    await expect(createTokenCipher(undefined)).rejects.toBeInstanceOf(TokenCryptoError);
  });
});

// ---------------------------------------------------------------------------
// real OAuth client via injected fetch (mock token endpoint)
// ---------------------------------------------------------------------------
describe('EtsyOAuthClient (real code, injected fetch)', () => {
  function tokenFetch(): FetchImpl {
    return async (url) => {
      if (url.endsWith('/oauth/token')) {
        return jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 });
      }
      if (url.includes('/users/me/shops')) {
        return jsonResponse({ results: [{ shop_id: 777, shop_name: 'StubShop' }] });
      }
      if (url.includes('/transactions')) {
        return jsonResponse({ count: 0, results: [] });
      }
      return jsonResponse({}, 404);
    };
  }

  it('builds an authorize URL with read-only scopes + S256 challenge', () => {
    const client = createEtsyOAuthClient({ clientId: 'cid', redirectUri: 'https://app/cb', fetchImpl: tokenFetch() });
    const url = new URL(client.buildAuthorizeUrl({ state: 'ST', codeChallenge: 'CH' }));
    expect(url.searchParams.get('scope')).toBe(ETSY_OAUTH_SCOPE_STRING);
    expect(url.searchParams.get('scope')).not.toContain('_w'); // no write scope
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('ST');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('exchanges a code for tokens', async () => {
    const client = createEtsyOAuthClient({ clientId: 'cid', redirectUri: 'https://app/cb', fetchImpl: tokenFetch() });
    const t = await client.exchangeCode({ code: 'CODE', codeVerifier: 'VER' });
    expect(t.accessToken).toBe('AT');
    expect(t.refreshToken).toBe('RT');
    expect(t.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('refreshes a token + resolves the shop', async () => {
    const client = createEtsyOAuthClient({ clientId: 'cid', redirectUri: 'https://app/cb', fetchImpl: tokenFetch() });
    const t = await client.refresh('RT');
    expect(t.accessToken).toBe('AT');
    const shop = await client.getMyShop(t.accessToken);
    expect(shop).toEqual({ shopId: 777, shopName: 'StubShop' });
  });
});

// ---------------------------------------------------------------------------
// connectedShopRepo — encrypted at rest + 1 shop/user + state CSRF
// ---------------------------------------------------------------------------
describe('connectedShopRepo', () => {
  it('stores tokens encrypted and decrypts on read', async () => {
    const { db, shops } = makeD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));
    await repo.upsertShop({
      userId: 'u1', etsyShopId: 1, shopName: 'S', accessToken: 'plain-access',
      refreshToken: 'plain-refresh', tokenExpiresAt: 9999999999, scopes: ETSY_OAUTH_SCOPE_STRING,
    });
    const raw = shops.get('u1')!;
    expect(raw.access_token_enc).not.toContain('plain-access'); // encrypted at rest
    const got = await repo.getShop('u1');
    expect(got?.accessToken).toBe('plain-access');
    expect(got?.refreshToken).toBe('plain-refresh');
  });

  it('enforces 1 shop per user (upsert overwrites)', async () => {
    const { db, shops } = makeD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));
    const common = { userId: 'u1', shopName: 'S', accessToken: 'a', refreshToken: 'r', tokenExpiresAt: 1, scopes: 's' };
    await repo.upsertShop({ ...common, etsyShopId: 1 });
    await repo.upsertShop({ ...common, etsyShopId: 2 });
    expect(shops.size).toBe(1);
    expect((await repo.getShop('u1'))?.etsyShopId).toBe(2);
  });

  it('takeState validates + consumes; rejects unknown/expired', async () => {
    const { db, states } = makeD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));
    await repo.putState({ state: 'ST', userId: 'u1', codeVerifier: 'VER' });
    const ok = await repo.takeState('ST');
    expect(ok?.user_id).toBe('u1');
    expect(states.has('ST')).toBe(false); // one-shot consume
    expect(await repo.takeState('ST')).toBeNull(); // replay rejected
    expect(await repo.takeState('nope')).toBeNull();
  });

  it('rejects an expired state', async () => {
    const { db, states } = makeD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));
    states.set('OLD', { state: 'OLD', user_id: 'u1', code_verifier: 'V', created_at: Math.floor(Date.now() / 1000) - 4000 });
    expect(await repo.takeState('OLD')).toBeNull();
  });

  it('deletes on disconnect', async () => {
    const { db, shops } = makeD1();
    const repo = createConnectedShopRepo(db, await createTokenCipher(ENC_KEY));
    await repo.upsertShop({ userId: 'u1', etsyShopId: 1, shopName: 'S', accessToken: 'a', refreshToken: 'r', tokenExpiresAt: 1, scopes: 's' });
    await repo.deleteShop('u1');
    expect(shops.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calibrationJob — mock transactions + reviews → calibration_factors
// ---------------------------------------------------------------------------
describe('calibrationJob', () => {
  /** A mock EtsyClient that returns reviews for the fixture listings (111, 222). */
  function reviewClient(reviewsPerListing: Record<number, number>): EtsyClient {
    const nowSec = Math.floor(Date.now() / 1000);
    const results = Object.entries(reviewsPerListing).flatMap(([lid, n]) =>
      Array.from({ length: n }, () => ({ listing_id: Number(lid), rating: 5, created_timestamp: nowSec - 86_400 }))
    );
    const page: EtsyReviewPage = { count: results.length, results };
    return { async getReviewsByShop() { return page; } } as unknown as EtsyClient;
  }

  it('writes review_rate = Σreviews / Σtransactions per category (mock path)', async () => {
    const { db, factors, shops } = makeD1();
    const cipher = await createTokenCipher(ENC_KEY);
    const repo = createConnectedShopRepo(db, cipher);
    // Connect the fixture mock shop (shopId 900001, listings 111+222 → category 1).
    await repo.upsertShop({
      userId: 'u1', etsyShopId: 900001, shopName: 'MockJewelryStudio',
      accessToken: 'a', refreshToken: 'r', tokenExpiresAt: Math.floor(Date.now() / 1000) + 99999, scopes: ETSY_OAUTH_SCOPE_STRING,
    });

    // Mock fixture has 40 transactions (20 on 111, 20 on 222), all category 1.
    // Supply 8 reviews → review_rate = 8 / 40 = 0.2.
    const result = await calibrationJob(baseEnv(), undefined, {
      oauthClient: createMockOAuthClient(),
      etsyClient: reviewClient({ 111: 4, 222: 4 }),
      listingTaxonomy: mockListingTaxonomy(),
      repo,
      db,
    });

    expect(result.shopsProcessed).toBe(1);
    expect(result.categoriesWritten).toBe(1);
    const cat1 = factors.get(1)!;
    expect(cat1.sample_size).toBe(40);
    expect(cat1.review_rate).toBeCloseTo(0.2, 5);
    // shop marked calibrated
    expect(shops.get('u1')!.last_calibrated_at).not.toBeNull();
  });

  it('refreshes a near-expiry token before reading', async () => {
    const { db } = makeD1();
    const cipher = await createTokenCipher(ENC_KEY);
    const repo = createConnectedShopRepo(db, cipher);
    await repo.upsertShop({
      userId: 'u1', etsyShopId: 900001, shopName: 'X',
      accessToken: 'old', refreshToken: 'r', tokenExpiresAt: Math.floor(Date.now() / 1000) + 10, scopes: 's',
    });
    let refreshed = false;
    const mock = createMockOAuthClient();
    const spyClient = { ...mock, async refresh(rt: string) { refreshed = true; return mock.refresh(rt); } };
    await calibrationJob(baseEnv(), undefined, {
      oauthClient: spyClient as never,
      etsyClient: reviewClient({ 111: 1 }),
      listingTaxonomy: mockListingTaxonomy(),
      repo,
      refreshSkewSec: 300,
      db,
    });
    expect(refreshed).toBe(true);
  });

  it('produces no rows when there are no connected shops', async () => {
    const { db, factors } = makeD1();
    const result = await calibrationJob(baseEnv(), undefined, {
      oauthClient: createMockOAuthClient(),
      etsyClient: reviewClient({}),
      listingTaxonomy: mockListingTaxonomy(),
      repo: createConnectedShopRepo(db, await createTokenCipher(ENC_KEY)),
      db,
    });
    expect(result.shopsProcessed).toBe(0);
    expect(factors.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reviewRateProvider — MIN_SAMPLE gate + fallback
// ---------------------------------------------------------------------------
describe('reviewRateProvider', () => {
  const factors: CalibrationFactor[] = [
    { categoryId: 1, reviewRate: 0.22, sampleSize: MIN_SAMPLE, updatedAt: 0 },
    { categoryId: 2, reviewRate: 0.3, sampleSize: MIN_SAMPLE - 1, updatedAt: 0 }, // below gate
  ];

  it('returns a measured rate at/above MIN_SAMPLE', () => {
    const provider = reviewRateProviderFromFactors(factors);
    expect(provider(1)).toBeCloseTo(0.22, 5);
  });

  it('falls back (null) below MIN_SAMPLE and for unknown categories', () => {
    const provider = reviewRateProviderFromFactors(factors);
    expect(provider(2)).toBeNull(); // under-sampled
    expect(provider(999)).toBeNull(); // unknown
    expect(provider(null)).toBeNull();
    expect(provider(undefined)).toBeNull();
  });

  it('loads factors from D1 and builds a provider', async () => {
    const { db, factors: store } = makeD1();
    store.set(1, { category_id: 1, review_rate: 0.18, sample_size: 100, updated_at: 0 });
    const provider = await loadReviewRateProvider(db);
    expect(provider(1)).toBeCloseTo(0.18, 5);
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

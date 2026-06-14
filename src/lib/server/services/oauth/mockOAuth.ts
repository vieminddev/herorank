/**
 * Mock Etsy OAuth provider (Engineer H) — the dev/test path TODAY (no real key, BR-P4-OAUTH-05).
 *
 * Mirrors Phase 3's `getEtsyClient` real-vs-mock seam: when `env.ETSY_OAUTH_CLIENT_ID` is absent,
 * `getEtsyOAuth(env)` returns this mock so the WHOLE flow (connect → callback → calibration job)
 * runs end-to-end with zero Etsy access and never crashes.
 *
 * The mock satisfies the SAME `EtsyOAuthClient` interface as the real client, so routes + the
 * calibration job are identical on both paths:
 *   - buildAuthorizeUrl → a local stub URL that bounces straight to the callback with a fake code.
 *   - exchangeCode / refresh → canned tokens.
 *   - getMyShop → the fixture shop.
 *   - getShopTransactions → fixture transactions (materialized into the trailing-90d window so the
 *     calibration job produces a non-zero review-rate).
 */
import type { EtsyOAuthClient, OAuthTokens, EtsyTransaction } from './etsyOAuth';
import { ETSY_OAUTH_SCOPE_STRING } from './etsyOAuth';
import txFixture from './__fixtures__/ownShopTransactions.json';

type RawTx = { transaction_id: number; listing_id: number; _days_ago: number };

interface TxFixture {
  shopId: number;
  shopName: string;
  /** listing_id → top-level taxonomy node id (so the calibration job can map without a key). */
  listingTaxonomy: Record<string, number>;
  transactions: RawTx[];
}

const FIXTURE = txFixture as unknown as TxFixture;

export interface MockOAuthOverrides {
  shopId?: number;
  shopName?: string;
  transactions?: RawTx[];
  /** When set, the next exchangeCode/refresh returns this instead of the canned token. */
  tokens?: Partial<OAuthTokens>;
}

/** The callback path the mock authorize URL bounces to (consumed by the oauth route in dev). */
export const MOCK_CALLBACK_CODE = 'mock_code';

export function createMockOAuthClient(overrides: MockOAuthOverrides = {}): EtsyOAuthClient {
  const shopId = overrides.shopId ?? FIXTURE.shopId;
  const shopName = overrides.shopName ?? FIXTURE.shopName;
  const rawTx = overrides.transactions ?? FIXTURE.transactions;

  function cannedTokens(): OAuthTokens {
    return {
      accessToken: overrides.tokens?.accessToken ?? 'mock_access_token',
      refreshToken: overrides.tokens?.refreshToken ?? 'mock_refresh_token',
      expiresAt: overrides.tokens?.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
      scopes: overrides.tokens?.scopes ?? ETSY_OAUTH_SCOPE_STRING,
    };
  }

  return {
    buildAuthorizeUrl({ state }) {
      // Bounce locally to the callback — no real Etsy. The route's mock branch detects this.
      const u = new URL('/api/connect/etsy/callback', 'http://localhost');
      u.searchParams.set('code', MOCK_CALLBACK_CODE);
      u.searchParams.set('state', state);
      return u.pathname + u.search;
    },
    async exchangeCode() {
      return cannedTokens();
    },
    async refresh() {
      return cannedTokens();
    },
    async getMyShop() {
      return { shopId, shopName };
    },
    async getShopTransactions({ sinceEpochSec }): Promise<EtsyTransaction[]> {
      const nowSec = Math.floor(Date.now() / 1000);
      return rawTx
        .map((t) => ({
          transaction_id: t.transaction_id,
          listing_id: t.listing_id,
          created_timestamp: nowSec - t._days_ago * 86_400,
        }))
        .filter((t) => t.created_timestamp >= sinceEpochSec);
    },
  };
}

/** Listing→taxonomy map for the fixture shop (the mock EtsyClient has no per-listing taxonomy). */
export function mockListingTaxonomy(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(FIXTURE.listingTaxonomy)) out[Number(k)] = v;
  return out;
}

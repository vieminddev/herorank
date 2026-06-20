/**
 * Connected-shops + oauth_states repository (Engineer H) — D1 access for the OAuth flow.
 *
 * Tables live in `migrations/0004_jobs_oauth.sql` (Engineer F owns the file; H supplies the DDL).
 * This repo encapsulates EVERY D1 statement the OAuth routes + calibration job need, using
 * parameterized queries (raw D1 `prepare/bind`, the same pattern as `creditsRepo`/`analysesStore`).
 *
 * Token security (BR-P4-OAUTH-03): tokens are stored ENCRYPTED. This repo takes a `TokenCipher`
 * (from `crypto.ts`) and encrypts on write / decrypts on read — callers never touch ciphertext.
 *
 * 1 shop/user (v1, PM decision): `connected_shops.user_id` is the PRIMARY KEY, so upsert
 * (INSERT … ON CONFLICT(user_id) DO UPDATE) enforces exactly one connected shop per user.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { TokenCipher } from './crypto';

// --- oauth_states (CSRF + PKCE verifier, short-lived) -----------------------

export interface OAuthStateRow {
  state: string;
  user_id: string;
  code_verifier: string;
  created_at: number;
}

/** Default state TTL: 10 minutes (BA spec §3.2). */
export const OAUTH_STATE_TTL_SEC = 600;

// --- connected_shops (decrypted view for callers) ---------------------------

export interface ConnectedShop {
  userId: string;
  etsyShopId: number;
  shopName: string | null;
  accessToken: string; // decrypted
  refreshToken: string; // decrypted
  tokenExpiresAt: number; // epoch seconds
  scopes: string;
  connectedAt: number;
  lastCalibratedAt: number | null;
}

export interface ConnectedShopUpsert {
  userId: string;
  etsyShopId: number;
  shopName: string | null;
  accessToken: string; // plaintext in → encrypted on write
  refreshToken: string; // plaintext in → encrypted on write
  tokenExpiresAt: number;
  scopes: string;
}

export interface ConnectedShopRepo {
  // oauth_states
  putState(input: { state: string; userId: string; codeVerifier: string }): Promise<void>;
  /** Look up + consume a state row. Returns null if missing/expired. Deletes on read (one-shot). */
  takeState(state: string): Promise<OAuthStateRow | null>;
  pruneStates(olderThanSec?: number): Promise<void>;

  // connected_shops
  upsertShop(input: ConnectedShopUpsert): Promise<void>;
  /** Decrypted shop for a user, or null if not connected. */
  getShop(userId: string): Promise<ConnectedShop | null>;
  /** All decrypted shops for a user (Etsy-write flow `connected`; supports ?shopId selection). */
  listForUser(userId: string): Promise<ConnectedShop[]>;
  /** Decrypted shop by its Etsy shop id (Etsy-write flow `resolveShop`), or null. */
  getShopByEtsyId(etsyShopId: number): Promise<ConnectedShop | null>;
  /** All connected shops (decrypted) — used by the calibration job. */
  listShops(): Promise<ConnectedShop[]>;
  deleteShop(userId: string): Promise<void>;
  markCalibrated(userId: string, at: number): Promise<void>;
  /** Persist refreshed tokens (encrypts) after a proactive refresh. */
  updateTokens(input: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
  }): Promise<void>;
}

export function createConnectedShopRepo(db: D1Database, cipher: TokenCipher): ConnectedShopRepo {
  async function decryptRow(row: RawShopRow): Promise<ConnectedShop> {
    return {
      userId: row.user_id,
      etsyShopId: row.etsy_shop_id,
      shopName: row.shop_name,
      accessToken: await cipher.decrypt(row.access_token_enc),
      refreshToken: await cipher.decrypt(row.refresh_token_enc),
      tokenExpiresAt: row.token_expires_at,
      scopes: row.scopes,
      connectedAt: row.connected_at,
      lastCalibratedAt: row.last_calibrated_at,
    };
  }

  return {
    async putState({ state, userId, codeVerifier }) {
      await db
        .prepare(
          'INSERT INTO oauth_states (state, user_id, code_verifier) VALUES (?, ?, ?)'
        )
        .bind(state, userId, codeVerifier)
        .run();
    },

    async takeState(state) {
      const row = await db
        .prepare('SELECT state, user_id, code_verifier, created_at FROM oauth_states WHERE state = ?')
        .bind(state)
        .first<OAuthStateRow>();
      if (!row) return null;
      // Always consume (one-shot) — delete regardless of expiry so a replay can't reuse it.
      await db.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
      const ageSec = Math.floor(Date.now() / 1000) - row.created_at;
      if (ageSec > OAUTH_STATE_TTL_SEC) return null; // expired
      return row;
    },

    async pruneStates(olderThanSec = OAUTH_STATE_TTL_SEC) {
      const cutoff = Math.floor(Date.now() / 1000) - olderThanSec;
      await db.prepare('DELETE FROM oauth_states WHERE created_at < ?').bind(cutoff).run();
    },

    async upsertShop(input) {
      const accessEnc = await cipher.encrypt(input.accessToken);
      const refreshEnc = await cipher.encrypt(input.refreshToken);
      await db
        .prepare(
          'INSERT INTO connected_shops ' +
            '(user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at, scopes) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT(user_id) DO UPDATE SET ' +
            'etsy_shop_id = excluded.etsy_shop_id, ' +
            'shop_name = excluded.shop_name, ' +
            'access_token_enc = excluded.access_token_enc, ' +
            'refresh_token_enc = excluded.refresh_token_enc, ' +
            'token_expires_at = excluded.token_expires_at, ' +
            'scopes = excluded.scopes'
        )
        .bind(
          input.userId,
          input.etsyShopId,
          input.shopName,
          accessEnc,
          refreshEnc,
          input.tokenExpiresAt,
          input.scopes
        )
        .run();
    },

    async getShop(userId) {
      const row = await db
        .prepare(SHOP_SELECT + ' WHERE user_id = ?')
        .bind(userId)
        .first<RawShopRow>();
      return row ? decryptRow(row) : null;
    },

    async listForUser(userId) {
      const res = await db
        .prepare(SHOP_SELECT + ' WHERE user_id = ?')
        .bind(userId)
        .all<RawShopRow>();
      const rows = res.results ?? [];
      return Promise.all(rows.map(decryptRow));
    },

    async getShopByEtsyId(etsyShopId) {
      const row = await db
        .prepare(SHOP_SELECT + ' WHERE etsy_shop_id = ?')
        .bind(etsyShopId)
        .first<RawShopRow>();
      return row ? decryptRow(row) : null;
    },

    async listShops() {
      const res = await db.prepare(SHOP_SELECT).all<RawShopRow>();
      const rows = res.results ?? [];
      return Promise.all(rows.map(decryptRow));
    },

    async deleteShop(userId) {
      await db.prepare('DELETE FROM connected_shops WHERE user_id = ?').bind(userId).run();
    },

    async markCalibrated(userId, at) {
      await db
        .prepare('UPDATE connected_shops SET last_calibrated_at = ? WHERE user_id = ?')
        .bind(at, userId)
        .run();
    },

    async updateTokens({ userId, accessToken, refreshToken, tokenExpiresAt }) {
      const accessEnc = await cipher.encrypt(accessToken);
      const refreshEnc = await cipher.encrypt(refreshToken);
      await db
        .prepare(
          'UPDATE connected_shops SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ? ' +
            'WHERE user_id = ?'
        )
        .bind(accessEnc, refreshEnc, tokenExpiresAt, userId)
        .run();
    },
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface RawShopRow {
  user_id: string;
  etsy_shop_id: number;
  shop_name: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: number;
  scopes: string;
  connected_at: number;
  last_calibrated_at: number | null;
}

const SHOP_SELECT =
  'SELECT user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, ' +
  'token_expires_at, scopes, connected_at, last_calibrated_at FROM connected_shops';

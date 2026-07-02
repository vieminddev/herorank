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
 * Multi-shop (migration 0015): a user can connect MANY Etsy shops. The table is keyed on
 * (user_id, etsy_shop_id) with an `is_primary` flag (the default shop a tool uses when none is
 * selected). `upsertShop` adds/updates a shop; the first shop a user connects becomes primary.
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
  isPrimary: boolean;
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
  /** Add/refresh a shop. The user's FIRST shop becomes primary; reconnecting a shop keeps its flag. */
  upsertShop(input: ConnectedShopUpsert): Promise<void>;
  /** A specific shop (when `etsyShopId` given) or the user's PRIMARY shop, or null if none connected. */
  getShop(userId: string, etsyShopId?: number): Promise<ConnectedShop | null>;
  /** The user's primary (default) shop, or null. */
  getPrimary(userId: string): Promise<ConnectedShop | null>;
  /** All decrypted shops for a user (primary first). */
  listForUser(userId: string): Promise<ConnectedShop[]>;
  /** Decrypted shop by its Etsy shop id (Etsy-write flow `resolveShop`), or null. */
  getShopByEtsyId(etsyShopId: number): Promise<ConnectedShop | null>;
  /** All connected shops (decrypted) — used by the calibration job. */
  listShops(): Promise<ConnectedShop[]>;
  /** Make `etsyShopId` the user's primary (clears the previous primary). */
  setPrimary(userId: string, etsyShopId: number): Promise<void>;
  /** Disconnect ONE shop; if it was primary, promote the most recent remaining shop. */
  deleteShop(userId: string, etsyShopId: number): Promise<void>;
  /** Disconnect ALL of a user's shops (GDPR delete). */
  deleteAllForUser(userId: string): Promise<void>;
  markCalibrated(userId: string, etsyShopId: number, at: number): Promise<void>;
  /** Persist refreshed tokens (encrypts) after a proactive refresh, for one shop. */
  updateTokens(input: {
    userId: string;
    etsyShopId: number;
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
      isPrimary: row.is_primary === 1,
    };
  }

  // Primary first; fall back to the most recently connected shop if none is flagged primary.
  async function primaryFor(userId: string): Promise<ConnectedShop | null> {
    const row = await db
      .prepare(SHOP_SELECT + ' WHERE user_id = ? ORDER BY is_primary DESC, connected_at DESC LIMIT 1')
      .bind(userId)
      .first<RawShopRow>();
    return row ? decryptRow(row) : null;
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
      // The user's first shop is primary; additional shops default to non-primary. Reconnecting an
      // existing shop keeps its current is_primary (ON CONFLICT doesn't touch the flag).
      const existing = await db
        .prepare('SELECT COUNT(*) AS n FROM connected_shops WHERE user_id = ? AND is_primary = 1')
        .bind(input.userId)
        .first<{ n: number }>();
      const isPrimary = (existing?.n ?? 0) === 0 ? 1 : 0;
      await db
        .prepare(
          'INSERT INTO connected_shops ' +
            '(user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at, scopes, is_primary) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT(user_id, etsy_shop_id) DO UPDATE SET ' +
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
          input.scopes,
          isPrimary
        )
        .run();
    },

    async getShop(userId, etsyShopId) {
      if (etsyShopId !== undefined) {
        const row = await db
          .prepare(SHOP_SELECT + ' WHERE user_id = ? AND etsy_shop_id = ?')
          .bind(userId, etsyShopId)
          .first<RawShopRow>();
        return row ? decryptRow(row) : null;
      }
      return primaryFor(userId);
    },

    async getPrimary(userId) {
      return primaryFor(userId);
    },

    async listForUser(userId) {
      const res = await db
        .prepare(SHOP_SELECT + ' WHERE user_id = ? ORDER BY is_primary DESC, connected_at DESC')
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

    async setPrimary(userId, etsyShopId) {
      // Two steps so the partial-unique (one primary/user) index is never transiently violated.
      await db.prepare('UPDATE connected_shops SET is_primary = 0 WHERE user_id = ?').bind(userId).run();
      await db
        .prepare('UPDATE connected_shops SET is_primary = 1 WHERE user_id = ? AND etsy_shop_id = ?')
        .bind(userId, etsyShopId)
        .run();
    },

    async deleteShop(userId, etsyShopId) {
      const target = await db
        .prepare('SELECT is_primary FROM connected_shops WHERE user_id = ? AND etsy_shop_id = ?')
        .bind(userId, etsyShopId)
        .first<{ is_primary: number }>();
      await db
        .prepare('DELETE FROM connected_shops WHERE user_id = ? AND etsy_shop_id = ?')
        .bind(userId, etsyShopId)
        .run();
      // If the deleted shop was primary, promote the most recently connected remaining shop.
      if (target?.is_primary === 1) {
        const next = await db
          .prepare('SELECT etsy_shop_id FROM connected_shops WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1')
          .bind(userId)
          .first<{ etsy_shop_id: number }>();
        if (next) {
          await db
            .prepare('UPDATE connected_shops SET is_primary = 1 WHERE user_id = ? AND etsy_shop_id = ?')
            .bind(userId, next.etsy_shop_id)
            .run();
        }
      }
    },

    async deleteAllForUser(userId) {
      await db.prepare('DELETE FROM connected_shops WHERE user_id = ?').bind(userId).run();
    },

    async markCalibrated(userId, etsyShopId, at) {
      await db
        .prepare('UPDATE connected_shops SET last_calibrated_at = ? WHERE user_id = ? AND etsy_shop_id = ?')
        .bind(at, userId, etsyShopId)
        .run();
    },

    async updateTokens({ userId, etsyShopId, accessToken, refreshToken, tokenExpiresAt }) {
      const accessEnc = await cipher.encrypt(accessToken);
      const refreshEnc = await cipher.encrypt(refreshToken);
      await db
        .prepare(
          'UPDATE connected_shops SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ? ' +
            'WHERE user_id = ? AND etsy_shop_id = ?'
        )
        .bind(accessEnc, refreshEnc, tokenExpiresAt, userId, etsyShopId)
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
  is_primary: number;
}

const SHOP_SELECT =
  'SELECT user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, ' +
  'token_expires_at, scopes, connected_at, last_calibrated_at, is_primary FROM connected_shops';

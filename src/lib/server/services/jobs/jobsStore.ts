/**
 * Phase 4 jobs data access (Engineer F owns) — D1 stores for the new 0004 tables.
 *
 * Three small stores, each a thin DI-friendly wrapper over the D1 binding (parameterized
 * queries only, no string interpolation of user input):
 *   - createTrackedListingsStore — `tracked_listings` (per-user, plan-gated count)
 *   - createRankHistoryStore     — `rank_history` (GLOBAL, keyed by listing+keyword)
 *   - (analyses status helpers)  — the queue reuses Phase 3's `analyses` table (0003), so the
 *                                   queued-job lifecycle (queued→running→done/failed) lives in
 *                                   `analysesJobStore.ts`, not here.
 *
 * Built request-less from `env.DB` in cron/queue contexts AND from `getDb(c)` in routes — the
 * same D1Database either way (Contract A §3).
 */
import type { D1Database } from '@cloudflare/workers-types';
import { normalize } from '../etsy/cache';

// ---------------------------------------------------------------------------
// tracked_listings (per-user)
// ---------------------------------------------------------------------------

export interface TrackedListingRow {
  id: number;
  user_id: string;
  listing_id: number;
  keyword: string;
  last_rank: number | null;
  last_checked_at: number | null;
  created_at: number;
}

export interface TrackedListingsStore {
  /** Count this user's tracked rows (for the per-plan limit gate, BR-P4-TRACK-01). */
  countForUser(userId: string): Promise<number>;
  /**
   * Insert a track. Idempotent on (user_id, listing_id, keyword) — ON CONFLICT DO NOTHING.
   * Returns `{ inserted }` so the route can distinguish "created" from "already tracked".
   */
  add(userId: string, listingId: number, keyword: string): Promise<{ inserted: boolean }>;
  /** Delete a track by id, scoped to the owner. Returns true if a row was removed. */
  remove(userId: string, id: number): Promise<boolean>;
  /** This user's tracked listings (for the FE list). */
  listForUser(userId: string): Promise<TrackedListingRow[]>;
  /**
   * Tracked rows due for a re-check: last_checked_at is null OR older than `staleBeforeSec`.
   * Ordered oldest-first (nulls first) so the sweep is fair; capped to `limit` (batch).
   */
  due(staleBeforeSec: number, limit: number, now?: number): Promise<TrackedListingRow[]>;
  /** Stamp a successful check (idempotency guard + cache of latest rank). */
  markChecked(id: number, rank: number | null, now?: number): Promise<void>;
}

export function createTrackedListingsStore(db: D1Database): TrackedListingsStore {
  return {
    async countForUser(userId) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM tracked_listings WHERE user_id = ?')
        .bind(userId)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async add(userId, listingId, keyword) {
      const res = await db
        .prepare(
          'INSERT INTO tracked_listings (user_id, listing_id, keyword) VALUES (?, ?, ?) ' +
            'ON CONFLICT(user_id, listing_id, keyword) DO NOTHING'
        )
        .bind(userId, listingId, normalize(keyword))
        .run();
      return { inserted: (res.meta?.changes ?? 0) > 0 };
    },

    async remove(userId, id) {
      const res = await db
        .prepare('DELETE FROM tracked_listings WHERE id = ? AND user_id = ?')
        .bind(id, userId)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async listForUser(userId) {
      const res = await db
        .prepare(
          'SELECT id, user_id, listing_id, keyword, last_rank, last_checked_at, created_at ' +
            'FROM tracked_listings WHERE user_id = ? ORDER BY created_at DESC'
        )
        .bind(userId)
        .all<TrackedListingRow>();
      return res.results ?? [];
    },

    async due(staleBeforeSec, limit, now = Date.now()) {
      const cutoff = Math.floor(now / 1000) - staleBeforeSec;
      const res = await db
        .prepare(
          'SELECT id, user_id, listing_id, keyword, last_rank, last_checked_at, created_at ' +
            'FROM tracked_listings WHERE last_checked_at IS NULL OR last_checked_at < ? ' +
            'ORDER BY last_checked_at ASC LIMIT ?'
        )
        .bind(cutoff, limit)
        .all<TrackedListingRow>();
      return res.results ?? [];
    },

    async markChecked(id, rank, now = Date.now()) {
      await db
        .prepare('UPDATE tracked_listings SET last_rank = ?, last_checked_at = ? WHERE id = ?')
        .bind(rank, Math.floor(now / 1000), id)
        .run();
    },
  };
}

// ---------------------------------------------------------------------------
// rank_history (GLOBAL, keyed by listing_id + keyword)
// ---------------------------------------------------------------------------

export interface RankHistoryRow {
  position: number | null;
  captured_at: number; // epoch seconds
}

export interface RankHistoryStore {
  /** Append a global rank point for (listing, keyword). position null = outside top 100. */
  insert(listingId: number, keyword: string, position: number | null, now?: number): Promise<void>;
  /** Oldest→newest history for a (listing, keyword), capped to `limit`. */
  history(listingId: number, keyword: string, limit?: number): Promise<RankHistoryRow[]>;
}

export function createRankHistoryStore(db: D1Database): RankHistoryStore {
  return {
    async insert(listingId, keyword, position, now = Date.now()) {
      await db
        .prepare(
          'INSERT INTO rank_history (listing_id, keyword, position, captured_at) VALUES (?, ?, ?, ?)'
        )
        .bind(listingId, normalize(keyword), position, Math.floor(now / 1000))
        .run();
    },

    async history(listingId, keyword, limit = 30) {
      const res = await db
        .prepare(
          'SELECT position, captured_at FROM rank_history ' +
            'WHERE listing_id = ? AND keyword = ? ORDER BY captured_at ASC LIMIT ?'
        )
        .bind(listingId, normalize(keyword), limit)
        .all<RankHistoryRow>();
      return res.results ?? [];
    },
  };
}

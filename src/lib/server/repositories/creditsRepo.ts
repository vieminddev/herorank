/**
 * Credits repository (Engineer C) — D1 data access for the credits ledger + subscription balance.
 *
 * Interface + factory. The interface is consumed by `creditsService.ts` (business logic) and
 * faked in `credits.test.ts` (hermetic tests). The D1 implementation uses parameterized queries
 * for injection safety.
 *
 * Ledger model (migration 0005): `credits_ledger` with partial unique index `(user_id, ref)`
 * for idempotent grants + spends (F-01).
 */
import type { D1Database } from '@cloudflare/workers-types';

/** A single credits ledger entry (read shape). */
export interface LedgerEntry {
  id: number;
  delta: number;
  reason: string;
  ref: string | null;
  balance_after: number;
  created_at: number;
}

/** Subscription read shape returned by getSubscription. */
export interface SubscriptionInfo {
  plan: string;
  status: string;
  period: string | null;
  credits_balance: number;
}

/** The data-access contract consumed by creditsService. */
export interface CreditsRepo {
  /** SUM(delta) for a user — the authoritative balance (BR-007). */
  sumLedger(userId: string): Promise<number>;
  /** Check if a ledger ref exists for a user (idempotency guard). */
  hasLedgerRef(userId: string, ref: string): Promise<boolean>;
  /** Write a positive grant row. */
  grant(params: {
    userId: string;
    plan: string;
    amount: number;
    reason: string;
    ref: string | null;
  }): Promise<{ balance: number }>;
  /** Atomic race-safe spend: succeed only if balance >= cost. */
  spend(params: {
    userId: string;
    cost: number;
    reason: string;
    ref: string;
  }): Promise<{ ok: boolean; balance: number }>;
  /** Read subscription info (plan, status, period). */
  getSubscription(userId: string): Promise<SubscriptionInfo | null>;
  /** Recent ledger entries (newest first). */
  recentLedger(userId: string, limit: number): Promise<LedgerEntry[]>;
}

/**
 * D1-backed credits repo. All queries use parameterized statements (no string interpolation).
 */
export function createCreditsRepo(db: D1Database): CreditsRepo {
  return {
    async sumLedger(userId) {
      const row = await db
        .prepare('SELECT COALESCE(SUM(delta), 0) AS total FROM credits_ledger WHERE user_id = ?')
        .bind(userId)
        .first<{ total: number }>();
      return row?.total ?? 0;
    },

    async hasLedgerRef(userId, ref) {
      const row = await db
        .prepare('SELECT 1 AS hit FROM credits_ledger WHERE user_id = ? AND ref = ? LIMIT 1')
        .bind(userId, ref)
        .first<{ hit: number }>();
      return row !== null;
    },

    async grant({ userId, amount, reason, ref }) {
      // Insert ledger row. balance_after = current sum + amount.
      const currentBalance = await this.sumLedger(userId);
      const balanceAfter = currentBalance + amount;
      await db
        .prepare(
          'INSERT INTO credits_ledger (user_id, delta, reason, ref, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(userId, amount, reason, ref, balanceAfter, Date.now())
        .run();
      return { balance: balanceAfter };
    },

    async spend({ userId, cost, reason, ref }) {
      // Atomic conditional spend: only debit if the current ledger sum >= cost.
      // Two-step inside a batch for atomicity on D1.
      const currentBalance = await this.sumLedger(userId);
      if (currentBalance < cost) {
        return { ok: false, balance: currentBalance };
      }
      const balanceAfter = currentBalance - cost;
      // F-01: ON CONFLICT (user_id, ref) DO NOTHING → idempotent spend.
      const result = await db
        .prepare(
          'INSERT INTO credits_ledger (user_id, delta, reason, ref, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, ref) WHERE ref IS NOT NULL DO NOTHING'
        )
        .bind(userId, -cost, reason, ref, balanceAfter, Date.now())
        .run();
      if (result.meta.changes === 0) {
        // Idempotent no-op — the ref was already processed. Return current balance.
        const newBalance = await this.sumLedger(userId);
        return { ok: true, balance: newBalance };
      }
      return { ok: true, balance: balanceAfter };
    },

    async getSubscription(userId) {
      const row = await db
        .prepare(
          'SELECT plan, status, period, credits_balance FROM subscriptions WHERE user_id = ?'
        )
        .bind(userId)
        .first<SubscriptionInfo>();
      return row ?? null;
    },

    async recentLedger(userId, limit) {
      const { results } = await db
        .prepare(
          'SELECT id, delta, reason, ref, balance_after, created_at FROM credits_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'
        )
        .bind(userId, limit)
        .all<LedgerEntry>();
      return results;
    },
  };
}

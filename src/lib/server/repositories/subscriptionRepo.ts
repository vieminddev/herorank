/**
 * Subscription repository (Engineer B) — D1 data access for the subscriptions table.
 *
 * Interface + D1 factory. Consumed by `billingService.ts` (webhook handler) and faked in
 * `billingWebhook.test.ts`. Parameterized queries throughout.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { PlanSlug } from '../services/types';

/** Full subscription row shape (read). */
export interface SubscriptionRow {
  user_id: string;
  plan: PlanSlug | 'free';
  status: string;
  period: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: number | null;
  credits_balance: number;
  created_at: number;
  updated_at: number;
}

/** Partial update shape for subscription fields. */
export interface SubscriptionUpdate {
  plan?: PlanSlug | 'free';
  status?: string;
  period?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: number | null;
}

/** The data-access contract consumed by billingService. */
export interface SubscriptionRepo {
  getByUserId(userId: string): Promise<SubscriptionRow | null>;
  getByCustomerId(customerId: string): Promise<SubscriptionRow | null>;
  getByStripeSubscriptionId(subscriptionId: string): Promise<SubscriptionRow | null>;
  ensureRow(userId: string): Promise<void>;
  setStripeCustomerId(userId: string, customerId: string): Promise<void>;
  update(userId: string, patch: SubscriptionUpdate): Promise<void>;
  /** Mark a Stripe event as processed. Returns false if already processed (idempotency). */
  markEventProcessed(eventId: string): Promise<boolean>;
}

/**
 * D1-backed subscription repo.
 */
export function createSubscriptionRepo(db: D1Database): SubscriptionRepo {
  return {
    async getByUserId(userId) {
      return db
        .prepare('SELECT * FROM subscriptions WHERE user_id = ?')
        .bind(userId)
        .first<SubscriptionRow>();
    },

    async getByCustomerId(customerId) {
      return db
        .prepare('SELECT * FROM subscriptions WHERE stripe_customer_id = ?')
        .bind(customerId)
        .first<SubscriptionRow>();
    },

    async getByStripeSubscriptionId(subscriptionId) {
      return db
        .prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?')
        .bind(subscriptionId)
        .first<SubscriptionRow>();
    },

    async ensureRow(userId) {
      await db
        .prepare(
          `INSERT INTO subscriptions (user_id, plan, status, credits_balance, created_at, updated_at)
           VALUES (?, 'free', 'active', 0, ?, ?)
           ON CONFLICT (user_id) DO NOTHING`
        )
        .bind(userId, Date.now(), Date.now())
        .run();
    },

    async setStripeCustomerId(userId, customerId) {
      await db
        .prepare('UPDATE subscriptions SET stripe_customer_id = ?, updated_at = ? WHERE user_id = ?')
        .bind(customerId, Date.now(), userId)
        .run();
    },

    async update(userId, patch) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (patch.plan !== undefined) { sets.push('plan = ?'); vals.push(patch.plan); }
      if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status); }
      if (patch.period !== undefined) { sets.push('period = ?'); vals.push(patch.period); }
      if (patch.stripe_customer_id !== undefined) { sets.push('stripe_customer_id = ?'); vals.push(patch.stripe_customer_id); }
      if (patch.stripe_subscription_id !== undefined) { sets.push('stripe_subscription_id = ?'); vals.push(patch.stripe_subscription_id); }
      if (patch.current_period_end !== undefined) { sets.push('current_period_end = ?'); vals.push(patch.current_period_end); }
      if (sets.length === 0) return;
      sets.push('updated_at = ?');
      vals.push(Date.now());
      vals.push(userId);
      await db
        .prepare(`UPDATE subscriptions SET ${sets.join(', ')} WHERE user_id = ?`)
        .bind(...vals)
        .run();
    },

    async markEventProcessed(eventId) {
      try {
        await db
          .prepare('INSERT INTO processed_stripe_events (event_id, processed_at) VALUES (?, ?)')
          .bind(eventId, Date.now())
          .run();
        return true;
      } catch {
        // UNIQUE constraint violation → already processed.
        return false;
      }
    },
  };
}

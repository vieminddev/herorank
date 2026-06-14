/**
 * Dashboard route-group guard + data loader (Engineer A, BR-013).
 *
 * - Not authenticated → redirect to /auth/login.
 * - Authenticated → return `{ user, subscription, credits }` for the layout/Header.
 *
 * Subscription + balance are read directly from D1 here (read-only) so the guard does not
 * depend on C's service layer. Balance is the cached `subscriptions.credits_balance`
 * (kept in sync with the ledger by C's atomic writes, BR-007). If a row is missing (e.g.
 * the signup grant hook hasn't completed), we fall back to the free defaults.
 */
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

interface SubscriptionRow {
  plan: string;
  status: string;
  period: string | null;
  credits_balance: number;
}

export const load: LayoutServerLoad = async ({ locals, platform }) => {
  const user = locals.user;
  if (!user) {
    throw redirect(302, '/auth/login');
  }

  let subscription = { plan: 'free', status: 'active', period: null as string | null };
  let balance = 0;

  const db = platform?.env?.DB;
  if (db) {
    const row = await db
      .prepare(
        'SELECT plan, status, period, credits_balance FROM subscriptions WHERE user_id = ?'
      )
      .bind(user.id)
      .first<SubscriptionRow>();
    if (row) {
      subscription = { plan: row.plan, status: row.status, period: row.period };
      balance = row.credits_balance ?? 0;
    }
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    subscription,
    credits: { balance },
  };
};

/**
 * Dashboard route-group guard + data loader (Engineer A, BR-013).
 *
 * - Not authenticated → redirect to /auth/login.
 * - Authenticated → return `{ user, subscription, credits }` for the layout/Header.
 *
 * Subscription is read directly from D1 here (read-only) so the guard does not depend on
 * C's service layer. Balance is the live SUM over `credits_ledger` (source of truth, BR-007)
 * rather than a cached column, so the Header always reflects the ledger exactly. If rows are
 * missing (e.g. the signup grant hook hasn't completed), we fall back to the free defaults.
 */
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

interface SubscriptionRow {
  plan: string;
  status: string;
  period: string | null;
}

interface LedgerTotalRow {
  total: number;
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
    const sub = await db
      .prepare('SELECT plan, status, period FROM subscriptions WHERE user_id = ?')
      .bind(user.id)
      .first<SubscriptionRow>();
    if (sub) {
      subscription = { plan: sub.plan, status: sub.status, period: sub.period };
    }

    const led = await db
      .prepare('SELECT COALESCE(SUM(delta), 0) AS total FROM credits_ledger WHERE user_id = ?')
      .bind(user.id)
      .first<LedgerTotalRow>();
    balance = led?.total ?? 0;
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    subscription,
    credits: { balance },
  };
};

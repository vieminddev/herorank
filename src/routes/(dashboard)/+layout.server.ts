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

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
  const user = locals.user;
  if (!user) {
    // Preserve where the visitor was headed so login can return them there (not always /dashboard).
    const target = url.pathname + url.search;
    throw redirect(302, `/auth/login?redirect=${encodeURIComponent(target)}`);
  }

  let subscription = { plan: 'free', status: 'active', period: null as string | null };
  let balance = 0;
  // Whether the caller has an OAuth-connected Etsy shop. Surfaced here so own-shop pages
  // (My Shop / Shop Audit / Review Requests) can render the connect state immediately
  // instead of firing a request that 404s and logs a console error.
  //
  // Multi-shop: a user can connect MORE THAN ONE Etsy shop. We expose the full list
  // (`connectedShops`) plus the primary/default (`connectedShop`) for app context, while keeping
  // the legacy `shopConnected` boolean that existing pages (dashboard / shop-audit /
  // review-requests / my-shop) read.
  let shopConnected = false;
  let connectedShops: Array<{ shopId: number; shopName: string | null; isPrimary: boolean }> = [];
  let connectedShop: { shopId: number; shopName: string | null; isPrimary: boolean } | null = null;

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

    // List every connected shop (primary first). Wrapped so a partially-migrated dev DB
    // (table/`is_primary` column missing) degrades to "no shops" instead of 500ing the layout.
    try {
      const { results } = await db
        .prepare(
          'SELECT etsy_shop_id, shop_name, is_primary FROM connected_shops ' +
            'WHERE user_id = ? ORDER BY is_primary DESC, connected_at ASC'
        )
        .bind(user.id)
        .all<{ etsy_shop_id: number; shop_name: string | null; is_primary: number }>();

      connectedShops = (results ?? []).map((row) => ({
        shopId: row.etsy_shop_id,
        shopName: row.shop_name,
        isPrimary: !!row.is_primary,
      }));
    } catch {
      connectedShops = [];
    }

    shopConnected = connectedShops.length > 0;
    connectedShop = connectedShops.find((s) => s.isPrimary) ?? connectedShops[0] ?? null;
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    subscription,
    credits: { balance },
    shopConnected,
    connectedShops,
    connectedShop,
  };
};

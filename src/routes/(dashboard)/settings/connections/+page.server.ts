/**
 * Settings → Connections loader (Phase 4, Engineer E — multi-shop).
 *
 * Reads the current user's connected Etsy shop(s) (read-only D1, mirrors the dashboard
 * +layout.server.ts pattern) so the page can render the connected/not-connected state on
 * first paint without a client round-trip. Multiple shops per user are supported — the page
 * lists every connected shop, marks the primary/default, and lets the user add, switch the
 * default, or disconnect individual shops.
 *
 * The `connected_shops` table is created by Phase 4's `0004_jobs_oauth.sql` and extended with
 * an `is_primary` flag by `0015_multi_shop.sql`. In a partially-migrated dev DB the table (or
 * the `is_primary` column) may not exist yet, so the query is wrapped — a missing table/column
 * degrades gracefully to "not connected" (empty list) rather than 500ing the settings page.
 *
 * Tokens are NEVER selected here (the encrypted columns stay in D1); only safe display fields
 * are returned to the client.
 *
 * The OAuth callback (Engineer H) redirects back here with `?connected=1` or `?error=...`;
 * those are read from the URL in the page component.
 */
import type { PageServerLoad } from './$types';

interface ConnectedShopRow {
  etsy_shop_id: number;
  shop_name: string | null;
  scopes: string;
  connected_at: number;
  last_calibrated_at: number | null;
  is_primary: number;
}

export interface ConnectionView {
  shopId: number;
  shopName: string | null;
  scopes: string;
  connectedAt: number;
  lastCalibratedAt: number | null;
  isPrimary: boolean;
}

/** Whether the Etsy write scope can be requested (gated by Etsy approval via ETSY_WRITE_ENABLED). */
function isWriteAvailable(env: { ETSY_WRITE_ENABLED?: string } | undefined): boolean {
  const v = env?.ETSY_WRITE_ENABLED?.toLowerCase();
  return v === "true" || v === "1";
}

export const load: PageServerLoad = async ({ locals, platform }) => {
  const user = locals.user;
  const writeAvailable = isWriteAvailable(platform?.env);
  // The (dashboard) group guard already redirects unauthenticated users; this is defensive.
  if (!user) {
    return { connections: [] as ConnectionView[], writeAvailable };
  }

  const db = platform?.env?.DB;
  if (!db) {
    return { connections: [] as ConnectionView[], writeAvailable };
  }

  try {
    const { results } = await db
      .prepare(
        'SELECT etsy_shop_id, shop_name, scopes, connected_at, last_calibrated_at, is_primary ' +
          'FROM connected_shops WHERE user_id = ? ORDER BY is_primary DESC, connected_at ASC'
      )
      .bind(user.id)
      .all<ConnectedShopRow>();

    const connections: ConnectionView[] = (results ?? []).map((row) => ({
      shopId: row.etsy_shop_id,
      shopName: row.shop_name,
      scopes: row.scopes,
      connectedAt: row.connected_at,
      lastCalibratedAt: row.last_calibrated_at,
      isPrimary: !!row.is_primary,
    }));

    return { connections, writeAvailable };
  } catch {
    // Table/column not migrated yet → treat as not connected.
    return { connections: [] as ConnectionView[], writeAvailable };
  }
};

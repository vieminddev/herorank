/**
 * Settings → Connections loader (Phase 4, Engineer E).
 *
 * Reads the current user's connected Etsy shop (read-only D1, mirrors the dashboard
 * +layout.server.ts pattern) so the page can render the connected/not-connected state on
 * first paint without a client round-trip.
 *
 * The `connected_shops` table is created by Phase 4's `0004_jobs_oauth.sql` (Engineer F /
 * H). It may not exist yet in a partially-migrated dev DB, so the query is wrapped — a
 * missing table degrades gracefully to "not connected" rather than 500ing the settings page.
 *
 * The OAuth callback (Engineer H) redirects back here with `?connected=1` or `?error=...`;
 * those are read from the URL in the page component.
 */
import type { PageServerLoad } from './$types';

interface ConnectedShopRow {
  etsy_shop_id: number;
  shop_name: string | null;
  connected_at: number;
  last_calibrated_at: number | null;
}

export const load: PageServerLoad = async ({ locals, platform }) => {
  const user = locals.user;
  // The (dashboard) group guard already redirects unauthenticated users; this is defensive.
  if (!user) {
    return { connection: null };
  }

  const db = platform?.env?.DB;
  if (!db) {
    return { connection: null };
  }

  try {
    const row = await db
      .prepare(
        'SELECT etsy_shop_id, shop_name, connected_at, last_calibrated_at FROM connected_shops WHERE user_id = ?'
      )
      .bind(user.id)
      .first<ConnectedShopRow>();

    if (!row) {
      return { connection: null };
    }

    return {
      connection: {
        shopId: row.etsy_shop_id,
        shopName: row.shop_name,
        connectedAt: row.connected_at,
        lastCalibratedAt: row.last_calibrated_at,
      },
    };
  } catch {
    // Table not migrated yet → treat as not connected.
    return { connection: null };
  }
};

/**
 * Account routes — `/api/account/*`. GDPR data portability + right-to-erasure for the
 * signed-in user.
 *
 * Default-exported `Hono<AppEnv>`, mounted in `app.ts` via `app.route('/account', account)`.
 * Every route is auth-gated (`requireAuth` on `*`). SQL is inlined against the existing D1
 * tables (verified against migrations/0001–0010).
 *
 * Endpoints:
 *   GET  /export  — the signed-in user's data as a JSON download. NEVER includes OAuth tokens
 *                   (connected_shops.access_token_enc / refresh_token_enc are excluded) and is
 *                   strictly owner-scoped (every query filters on user_id) — no other user's
 *                   rows are ever read.
 *   POST /delete  — erase the user's account and cascade their rows. Requires { confirm: "DELETE" }.
 *                   The client then signs out + redirects.
 *
 * Erasure note: most domain tables already declare `ON DELETE CASCADE` against "user"(id), so
 * deleting the better-auth user row alone would cascade them. We still delete each table
 * explicitly first so erasure is correct even on a partially-migrated DB or one where FK
 * enforcement (`PRAGMA foreign_keys`) is off, and so a per-table failure is contained.
 */
import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv } from '../types';
import { getDb, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';

const router = new Hono<AppEnv>();

router.use('*', requireAuth);

/** Run a query, returning [] if the table doesn't exist (partially-migrated dev DB). */
async function safeAll<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<T[]> {
  try {
    const { results } = await db.prepare(sql).bind(...binds).all<T>();
    return results ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// GET /export — the signed-in user's data as a JSON download (GDPR portability)
// ---------------------------------------------------------------------------
router.get('/export', async (c) => {
  const db = getDb(c);
  const user = getUser(c);

  // Profile (better-auth "user" row). No password/session secrets.
  const profile = await db
    .prepare('SELECT id, name, email, "emailVerified" AS emailVerified, image, "createdAt" AS createdAt, "updatedAt" AS updatedAt FROM "user" WHERE id = ?')
    .bind(user.id)
    .first();

  // Connected shops — WITHOUT the encrypted OAuth tokens (never leak access/refresh tokens).
  const connectedShops = await safeAll(
    db,
    'SELECT etsy_shop_id, shop_name, token_expires_at, scopes, connected_at, last_calibrated_at FROM connected_shops WHERE user_id = ?',
    user.id
  );

  const subscription = await safeAll(
    db,
    'SELECT plan, status, period, stripe_customer_id, stripe_subscription_id, current_period_end, credits_balance, created_at, updated_at FROM subscriptions WHERE user_id = ?',
    user.id
  );

  // Credits ledger — full rows plus a convenience summary (current balance + counts).
  const creditsLedger = await safeAll(
    db,
    'SELECT id, delta, reason, ref, balance_after, created_at FROM credits_ledger WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );
  const balanceRow = await db
    .prepare('SELECT COALESCE(SUM(delta), 0) AS balance, COUNT(*) AS entries FROM credits_ledger WHERE user_id = ?')
    .bind(user.id)
    .first<{ balance: number; entries: number }>()
    .catch(() => null);

  // Keyword lists + their items (items joined through the owned lists).
  const keywordLists = await safeAll(
    db,
    'SELECT id, name, created_at FROM keyword_lists WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );
  const keywordListItems = await safeAll(
    db,
    'SELECT i.id, i.list_id, i.keyword, i.demand_score, i.result_count, i.competition, i.added_at ' +
      'FROM keyword_list_items i JOIN keyword_lists l ON l.id = i.list_id ' +
      'WHERE l.user_id = ? ORDER BY i.list_id ASC, i.added_at ASC',
    user.id
  );

  const watchedShops = await safeAll(
    db,
    'SELECT id, shop_name, note, created_at FROM watched_shops WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );

  const analyses = await safeAll(
    db,
    'SELECT id, tool, subject, payload, metric, created_at FROM analyses WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );

  const trackedListings = await safeAll(
    db,
    'SELECT id, listing_id, keyword, last_rank, last_checked_at, created_at FROM tracked_listings WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );

  const notifications = await safeAll(
    db,
    'SELECT id, type, title, body, ref, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );

  const titleExperiments = await safeAll(
    db,
    'SELECT id, listing_id, keyword, label, note, changed_at FROM title_experiments WHERE user_id = ? ORDER BY changed_at ASC',
    user.id
  );

  const reviewOutreach = await safeAll(
    db,
    'SELECT receipt_id, status, created_at FROM review_outreach WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );

  const waitlist = await safeAll(
    db,
    'SELECT id, tool, email, created_at FROM waitlist WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    notice:
      'This is a copy of your VieRank account data. OAuth tokens and password hashes are never included.',
    profile,
    subscription,
    credits: {
      balance: balanceRow?.balance ?? 0,
      entries: balanceRow?.entries ?? creditsLedger.length,
      ledger: creditsLedger,
    },
    connectedShops,
    keywordLists,
    keywordListItems,
    watchedShops,
    analyses,
    trackedListings,
    notifications,
    titleExperiments,
    reviewOutreach,
    waitlist,
  };

  const filename = `vierank-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});

// ---------------------------------------------------------------------------
// POST /delete — erase the account + cascade the user's rows (GDPR erasure)
// ---------------------------------------------------------------------------
router.post('/delete', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }

  const confirm = (raw as { confirm?: unknown })?.confirm;
  if (confirm !== 'DELETE') {
    return c.json(
      { error: 'VALIDATION', message: 'Confirmation required: send { "confirm": "DELETE" }.' },
      400
    );
  }

  const db = getDb(c);
  const userId = getUser(c).id;

  // Owner-scoped deletes, child rows before parents. keyword_list_items has no user_id —
  // delete via the owned lists first, then the lists. Each statement is tolerant of a
  // missing table (partially-migrated dev DB) so erasure never half-fails on optional tables.
  const statements: { sql: string; binds: unknown[] }[] = [
    {
      sql: 'DELETE FROM keyword_list_items WHERE list_id IN (SELECT id FROM keyword_lists WHERE user_id = ?)',
      binds: [userId],
    },
    { sql: 'DELETE FROM keyword_lists WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM watched_shops WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM analyses WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM tracked_listings WHERE user_id = ?', binds: [userId] },
    // (rank_history is global, no user_id, and now lives in the vierank-history DB — nothing to erase here)
    { sql: 'DELETE FROM title_experiments WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM review_outreach WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM listing_backups WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM notifications WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM extension_tokens WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM waitlist WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM oauth_states WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM connected_shops WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM credits_ledger WHERE user_id = ?', binds: [userId] },
    { sql: 'DELETE FROM subscriptions WHERE user_id = ?', binds: [userId] },
    // better-auth tables (quoted "user" is a SQLite keyword).
    { sql: 'DELETE FROM "session" WHERE "userId" = ?', binds: [userId] },
    { sql: 'DELETE FROM "account" WHERE "userId" = ?', binds: [userId] },
    { sql: 'DELETE FROM "user" WHERE id = ?', binds: [userId] },
  ];

  for (const { sql, binds } of statements) {
    try {
      await db.prepare(sql).bind(...binds).run();
    } catch (err) {
      // A missing optional table must not block erasure of the rest. The "user" row delete
      // is the critical one; if that throws, surface a 500 so the client doesn't sign the
      // user out believing the account is gone when it isn't.
      if (sql.includes('FROM "user"')) {
        console.error('[account/delete] failed to delete user row:', err);
        return c.json({ error: 'INTERNAL', message: 'Could not delete account. Please try again.' }, 500);
      }
    }
  }

  return c.json({ ok: true });
});

export default router;

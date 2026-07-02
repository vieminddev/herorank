/**
 * Watchlist routes — `/api/watchlist/*`. The signed-in user's watched Etsy shops.
 *
 * Default-exported `Hono<AppEnv>`, mounted by Engineer C in `app.ts` via
 * `app.route('/watchlist', watchlist)`. Every route is auth-gated (`requireAuth` on `*`).
 *
 * SQL is inlined against the `watched_shops` table (small surface, no shared store).
 *
 * Endpoints:
 *   GET    /     — this user's watched shops, newest-first.
 *   POST   /     — watch a shop ({ shop, note? }). Idempotent on (user_id, shop_name).
 *   DELETE /:id  — unwatch by id (owner-scoped).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';

/** Extract a shop name from an Etsy `…/shop/{name}…` URL, or trim a bare shop name. */
function parseShopName(input: string): string {
  const m = input.match(/shop\/([^/?#]+)/i);
  return (m ? m[1] : input).trim();
}

const router = new Hono<AppEnv>();

router.use('*', requireAuth);

const addBody = z.object({
  shop: z.string().min(1).max(120),
  note: z.string().max(300).optional(),
});

// ---------------------------------------------------------------------------
// GET / — this user's watched shops, newest-first
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const { results } = await getDb(c)
    .prepare('SELECT id, shop_name, note, created_at FROM watched_shops WHERE user_id = ? ORDER BY created_at DESC')
    .bind(getUser(c).id)
    .all();
  return c.json({ shops: results });
});

// ---------------------------------------------------------------------------
// POST / — watch a shop (idempotent on (user_id, shop_name))
// ---------------------------------------------------------------------------
router.post('/', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }

  const parsed = addBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const shopName = parseShopName(parsed.data.shop);
  if (!shopName) {
    return c.json({ error: 'VALIDATION', message: 'Enter a valid Etsy shop.' }, 400);
  }

  // Idempotent on (user_id, shop_name); a re-POST with a note UPDATES the note so inline note
  // editing on the watchlist page actually persists (was DO NOTHING → edits were silently dropped).
  const res = await getDb(c)
    .prepare(
      'INSERT INTO watched_shops (user_id, shop_name, note, created_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, shop_name) DO UPDATE SET note = excluded.note'
    )
    .bind(getUser(c).id, shopName, parsed.data.note ?? null, Math.floor(Date.now() / 1000))
    .run();

  return c.json({ ok: true, shopName, added: res.meta.changes > 0 }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /:id — unwatch by id (owner-scoped)
// ---------------------------------------------------------------------------
router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  }

  const res = await getDb(c)
    .prepare('DELETE FROM watched_shops WHERE id = ? AND user_id = ?')
    .bind(id, getUser(c).id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'NOT_FOUND', message: 'Not found' }, 404);
  }
  return c.json({ ok: true });
});

export default router;

/**
 * Title-experiment routes (Engineer F) — `/api/tools/*`, powers the "title-experiment" tool.
 *
 * Default-exported `Hono<AppEnv>`, re-mounted by Engineer C inside `routes/tools.ts` via
 * `router.route('/', experiments)` (same pattern as etsy-tools / jobs). This file does NOT mount
 * itself.
 *
 * Lets a seller log when they changed a listing's title (an A/B "experiment") so the FE can chart
 * rank movement against the change date. NOT credit-charged — it is a journaling feature, not a
 * metered tool (so only `requireAuth`, no `requireCredits`).
 *
 * Endpoints:
 *   POST   /experiments        — log a change marker. Body: { listing, keyword, label, note?,
 *                                changedAt? }. `changedAt` defaults to now (epoch seconds). 201.
 *   GET    /experiments?listing=&keyword= — this user's markers for a (listing, keyword),
 *                                oldest→newest.
 *   DELETE /experiments/:id    — delete one marker (owner-scoped). 404 if not found.
 *
 * The keyword is stored normalized (lowercase, collapsed whitespace) so GET matches POST. The
 * listing id is extracted as the first 4+ digit run from the input (URL or bare id).
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { getDb, getUser } from '../context';
import { normalize } from '../../services/etsy/cache';
import { z } from 'zod';

const router = new Hono<AppEnv>();

const experimentBody = z.object({
  listing: z.string().min(1),
  keyword: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  note: z.string().max(500).optional(),
  changedAt: z.number().int().positive().optional(),
});

router.post('/experiments', requireAuth, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = experimentBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const listingId = Number(parsed.data.listing.match(/(\d{4,})/)?.[1]);
  if (!Number.isInteger(listingId)) {
    return c.json({ error: 'VALIDATION', message: 'Enter a valid listing.' }, 400);
  }
  const changedAt = parsed.data.changedAt ?? Math.floor(Date.now() / 1000);

  await getDb(c)
    .prepare(
      'INSERT INTO title_experiments (user_id, listing_id, keyword, label, note, changed_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(
      getUser(c).id,
      listingId,
      normalize(parsed.data.keyword),
      parsed.data.label.trim(),
      parsed.data.note ?? null,
      changedAt
    )
    .run();

  return c.json({ ok: true, listingId, keyword: normalize(parsed.data.keyword) }, 201);
});

router.get('/experiments', requireAuth, async (c) => {
  const listing = c.req.query('listing');
  const keyword = c.req.query('keyword');
  if (!listing || !keyword) {
    return c.json({ error: 'VALIDATION', message: 'listing and keyword are required.' }, 400);
  }
  const listingId = Number(String(listing).match(/(\d{4,})/)?.[1]);
  if (!Number.isInteger(listingId)) {
    return c.json({ error: 'VALIDATION', message: 'Bad listing.' }, 400);
  }

  const { results } = await getDb(c)
    .prepare(
      'SELECT id, label, note, changed_at FROM title_experiments ' +
        'WHERE user_id = ? AND listing_id = ? AND keyword = ? ORDER BY changed_at ASC'
    )
    .bind(getUser(c).id, listingId, normalize(keyword))
    .all();

  return c.json({ experiments: results });
});

router.delete('/experiments/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  }
  const res = await getDb(c)
    .prepare('DELETE FROM title_experiments WHERE id = ? AND user_id = ?')
    .bind(id, getUser(c).id)
    .run();
  if (!res.meta.changes) {
    return c.json({ error: 'NOT_FOUND', message: 'Experiment not found.' }, 404);
  }
  return c.json({ ok: true });
});

export default router;

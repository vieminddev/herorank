/**
 * Collections routes — `/collections/*` for user-owned keyword lists ("saved keywords").
 *
 * Default-exported `Hono<AppEnv>`, mounted by the app via `app.route('/collections', collections)`.
 * Every endpoint is auth-gated (`router.use('*', requireAuth)`) and owner-scoped by `user.id`.
 * No credits are charged — these are subscription-feature CRUD endpoints, not metered tools.
 *
 * Endpoints:
 *   GET    /                       — list this user's keyword lists (each with `item_count`).
 *   POST   /                       — create a list. Body `{ name }`. Returns 201 + the new list.
 *   GET    /:id                    — fetch one list with its items (404 if not owned/missing).
 *   PATCH  /:id                    — rename a list. Body `{ name }`. 404 if not owned/missing.
 *   DELETE /:id                    — delete a list. 404 if not owned/missing.
 *   POST   /:id/items              — add 1–50 keyword items. Body `{ items: [...] }`. Dedups on
 *                                    (list_id, keyword); returns `{ added }` (rows inserted).
 *                                    404 if the list is not owned/missing.
 *   DELETE /:id/items/:itemId      — remove one item from a list. 404 if not found.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { createKeywordListRepo } from '../../services/keywordLists/keywordListRepo';

async function readBody<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}

const nameSchema = z.object({ name: z.string().min(1).max(80) });

const itemsSchema = z.object({
  items: z
    .array(
      z.object({
        keyword: z.string().min(1).max(140),
        demandScore: z.number().int().nullable().optional(),
        resultCount: z.number().int().nullable().optional(),
        competition: z.enum(['low', 'medium', 'high']).nullable().optional(),
      })
    )
    .min(1)
    .max(50),
});

const router = new Hono<AppEnv>();

router.use('*', requireAuth);

// ---------------------------------------------------------------------------
// GET / — this user's keyword lists
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const repo = createKeywordListRepo(getDb(c));
  const lists = await repo.listLists(getUser(c).id);
  return c.json({ lists });
});

// ---------------------------------------------------------------------------
// POST / — create a list
// ---------------------------------------------------------------------------
router.post('/', async (c) => {
  const body = await readBody(c, nameSchema);
  if (!body.ok) return body.res;
  const repo = createKeywordListRepo(getDb(c));
  const list = await repo.createList(getUser(c).id, body.data.name.trim());
  return c.json({ list }, 201);
});

// ---------------------------------------------------------------------------
// GET /:id — one list with its items
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  const repo = createKeywordListRepo(getDb(c));
  const list = await repo.getList(getUser(c).id, id);
  if (!list) return c.json({ error: 'NOT_FOUND', message: 'List not found' }, 404);
  return c.json({ list });
});

// ---------------------------------------------------------------------------
// PATCH /:id — rename a list
// ---------------------------------------------------------------------------
router.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  const body = await readBody(c, nameSchema);
  if (!body.ok) return body.res;
  const repo = createKeywordListRepo(getDb(c));
  const ok = await repo.renameList(getUser(c).id, id, body.data.name.trim());
  if (!ok) return c.json({ error: 'NOT_FOUND', message: 'List not found' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete a list
// ---------------------------------------------------------------------------
router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  const repo = createKeywordListRepo(getDb(c));
  const ok = await repo.deleteList(getUser(c).id, id);
  if (!ok) return c.json({ error: 'NOT_FOUND', message: 'List not found' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /:id/items — add 1–50 keyword items (dedup on (list_id, keyword))
// ---------------------------------------------------------------------------
router.post('/:id/items', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  const body = await readBody(c, itemsSchema);
  if (!body.ok) return body.res;
  const repo = createKeywordListRepo(getDb(c));
  const added = await repo.addItems(getUser(c).id, id, body.data.items);
  if (added === null) return c.json({ error: 'NOT_FOUND', message: 'List not found' }, 404);
  return c.json({ added });
});

// ---------------------------------------------------------------------------
// DELETE /:id/items/:itemId — remove one item from a list
// ---------------------------------------------------------------------------
router.delete('/:id/items/:itemId', async (c) => {
  const id = Number(c.req.param('id'));
  const itemId = Number(c.req.param('itemId'));
  if (!Number.isInteger(id) || !Number.isInteger(itemId)) {
    return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  }
  const repo = createKeywordListRepo(getDb(c));
  const ok = await repo.removeItem(getUser(c).id, id, itemId);
  if (!ok) return c.json({ error: 'NOT_FOUND', message: 'Item not found' }, 404);
  return c.json({ ok: true });
});

export default router;

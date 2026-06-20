/**
 * Notifications routes — `/api/notifications/*`. In-app notification feed for the signed-in user.
 *
 * Default-exported `Hono<AppEnv>`, mounted by Engineer C in `app.ts` via
 * `app.route('/notifications', notifications)`. Every route is auth-gated (`requireAuth` on `*`).
 *
 * Endpoints:
 *   GET  /       — newest 30 notifications + unread count.
 *   POST /read   — mark one read (body `{ id: number }`) or all read (no/invalid body).
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getDb, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { createNotificationsStore } from '../../services/notifications/notificationsStore';

const router = new Hono<AppEnv>();

router.use('*', requireAuth);

// ---------------------------------------------------------------------------
// GET / — newest 30 notifications + unread count
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const store = createNotificationsStore(getDb(c));
  const userId = getUser(c).id;
  const [items, unread] = await Promise.all([store.listForUser(userId, 30), store.unreadCount(userId)]);
  return c.json({ notifications: items, unread });
});

// ---------------------------------------------------------------------------
// POST /read — mark one read ({ id }) or all read (missing/invalid body)
// ---------------------------------------------------------------------------
router.post('/read', async (c) => {
  const store = createNotificationsStore(getDb(c));
  const userId = getUser(c).id;

  let id: number | undefined;
  try {
    const body = await c.req.json<{ id?: unknown }>();
    if (typeof body?.id === 'number') id = body.id;
  } catch {
    // No/invalid JSON body → fall through to "mark all read".
  }

  if (id !== undefined) await store.markRead(userId, id);
  else await store.markAllRead(userId);

  return c.json({ ok: true });
});

export default router;

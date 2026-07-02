/**
 * Hono app (Engineer A) — mounts all route modules under `/api/*`.
 *
 * Middleware chain (applied in order):
 *   1. cors      — CORS headers for SPA FE
 *   2. logger    — structured request logging + x-request-id
 *   3. withDb    — expose D1 as c.var.db
 *   4. rateLimit — per-IP/user sliding window
 *
 * Route mounting:
 *   /api/me       — current user info (credits, subscription)
 *   /api/credits  — balance + ledger
 *   /api/billing  — checkout + webhook
 *   /api/tools    — echo + LLM tools + Etsy tools + jobs (rank track, deep analysis)
 *   /api/connect  — Etsy OAuth flow
 */
import { Hono } from 'hono';
import type { AppEnv } from './types';
import { cors } from './middleware/cors';
import { logger } from './middleware/logger';
import { withDb } from './middleware/withDb';
import { rateLimit } from './middleware/rateLimit';
import { getDb } from './context';
import { recordError } from '../services/observability/store';

import meRouter from './routes/me';
import creditsRouter from './routes/credits';
import billingRouter from './routes/billing';
import toolsRouter from './routes/tools';
import oauthRouter from './routes/oauth';
import collectionsRouter from './routes/collections';
import myShopRouter from './routes/myShop';
import extRouter from './routes/ext';
import notificationsRouter from './routes/notifications';
import watchlistRouter from './routes/watchlist';
import waitlistRouter from './routes/waitlist';
import internalRouter from './routes/internal';
import accountRouter from './routes/account';
import veo3WebhookRouter from './routes/webhook-veo3';

const app = new Hono<AppEnv>().basePath('/api');

// --- Global middleware ---
app.use('*', cors);
app.use('*', logger);
app.use('*', withDb);
app.use('*', rateLimit('general'));

// Capture RETURNED server errors (502/503 from Etsy/LLM, etc.) into D1 `error_log`. Thrown
// errors are caught by app.onError below instead, so this only handles status > 500 (no 500s
// here → no double-logging). Best-effort; never blocks the response.
app.use('*', async (c, next) => {
  await next();
  const status = c.res?.status ?? 0;
  if (status > 500) {
    let userId: string | undefined;
    try { userId = c.get('user')?.id; } catch { /* unauthenticated */ }
    await recordError(getDb(c), { where: c.req.path, method: c.req.method, status, message: `route returned ${status}`, userId });
  }
});

// --- Route mounting ---
app.route('/me', meRouter);
app.route('/credits', creditsRouter);
app.route('/billing', billingRouter);
app.route('/tools', toolsRouter);
app.route('/connect', oauthRouter);
app.route('/collections', collectionsRouter);
app.route('/my-shop', myShopRouter);
app.route('/ext', extRouter);
app.route('/notifications', notificationsRouter);
app.route('/watchlist', watchlistRouter);
app.route('/waitlist', waitlistRouter);
app.route('/internal', internalRouter);
app.route('/account', accountRouter);
app.route('/webhook', veo3WebhookRouter);

// --- Global error handler ---
app.onError(async (err, c) => {
  console.error('[api] unhandled error:', err);
  let userId: string | undefined;
  try { userId = c.get('user')?.id; } catch { /* unauthenticated */ }
  try {
    await recordError(getDb(c), {
      where: c.req.path,
      method: c.req.method,
      status: 500,
      message: err instanceof Error ? err.message : String(err),
      detail: err instanceof Error ? err.stack : undefined,
      userId,
    });
  } catch { /* never let logging mask the original error */ }
  return c.json({ error: 'INTERNAL', message: 'An unexpected error occurred' }, 500);
});

// --- 404 fallback ---
app.notFound((c) => {
  return c.json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404);
});

export default app;

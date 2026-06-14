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

import meRouter from './routes/me';
import creditsRouter from './routes/credits';
import billingRouter from './routes/billing';
import toolsRouter from './routes/tools';
import oauthRouter from './routes/oauth';

const app = new Hono<AppEnv>().basePath('/api');

// --- Global middleware ---
app.use('*', cors);
app.use('*', logger);
app.use('*', withDb);
app.use('*', rateLimit('general'));

// --- Route mounting ---
app.route('/me', meRouter);
app.route('/credits', creditsRouter);
app.route('/billing', billingRouter);
app.route('/tools', toolsRouter);
app.route('/connect', oauthRouter);

// --- Global error handler ---
app.onError((err, c) => {
  console.error('[api] unhandled error:', err);
  return c.json({ error: 'INTERNAL', message: 'An unexpected error occurred' }, 500);
});

// --- 404 fallback ---
app.notFound((c) => {
  return c.json({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404);
});

export default app;

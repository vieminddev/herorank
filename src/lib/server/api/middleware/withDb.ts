/**
 * withDb (Engineer A): expose the D1 binding as `c.var.db` for every API route.
 * Returns 500 (INTERNAL) with a clear message if the binding is missing (e.g. misconfig),
 * rather than letting handlers crash on `undefined`.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'INTERNAL', message: 'Database binding (DB) is not available' }, 500);
  }
  c.set('db', db);
  // Analytics time-series DB (vierank-history). Optional binding: under plain `vite dev` or before
  // the second DB is provisioned it may be absent, so fall back to the primary DB to keep routes
  // working (they just read/write series in the OLTP DB locally). Prod always has the dedicated one.
  c.set('historyDb', c.env?.HISTORY_DB ?? db);
  await next();
});

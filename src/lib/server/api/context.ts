/**
 * Context accessors (Engineer A) — typed wrappers around `c.get` / `c.env`.
 *
 * Routes import these instead of reaching into `c.get('db')` directly, which avoids
 * string-key typos and gives a single refactor point if the key name changes.
 */
import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv } from './types';
import type { Env } from '../env';

/** The D1 database binding (OLTP) from `withDb` middleware. */
export function getDb(c: Context<AppEnv>): D1Database {
  return c.get('db');
}

/**
 * The analytics time-series D1 binding (`vierank-history`) from `withDb` middleware.
 * All `metric_series` reads/writes (trends, sales velocity, rank history) go through this — never
 * the OLTP `getDb`. Falls back to the OLTP DB when the dedicated binding is absent (local dev).
 */
export function getHistoryDb(c: Context<AppEnv>): D1Database {
  return c.get('historyDb');
}

/**
 * The analytics time-series D1 binding from a raw env (cron / queue / request-less contexts).
 * Mirrors `getHistoryDb` for code paths that only have `env`, not a Hono context.
 */
export function historyDbFromEnv(env: Pick<Env, 'DB' | 'HISTORY_DB'>): D1Database {
  return env.HISTORY_DB ?? env.DB;
}

/** The full Cloudflare Workers environment (bindings + secrets + vars). */
export function getEnv(c: Context<AppEnv>): Env {
  return c.env;
}

/** The authenticated user from `requireAuth` middleware. */
export function getUser(c: Context<AppEnv>): { id: string; email: string; name: string } {
  return c.get('user');
}

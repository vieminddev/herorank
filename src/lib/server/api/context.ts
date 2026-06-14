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

/** The D1 database binding from `withDb` middleware. */
export function getDb(c: Context<AppEnv>): D1Database {
  return c.get('db');
}

/** The full Cloudflare Workers environment (bindings + secrets + vars). */
export function getEnv(c: Context<AppEnv>): Env {
  return c.env;
}

/** The authenticated user from `requireAuth` middleware. */
export function getUser(c: Context<AppEnv>): { id: string; email: string; name: string } {
  return c.get('user');
}

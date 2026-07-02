/**
 * Hono app types (Engineer A) — the shared context shape for every API route.
 *
 * `AppEnv` is the Hono env generic: it declares the Cloudflare `Bindings` (= `Env` from
 * env.ts) and the per-request `Variables` set by middleware (withDb, requireAuth, logger).
 *
 * `ApiError` is the standard error response body used by all routes.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';

export interface AppEnv {
  Bindings: Env;
  Variables: {
    /** D1 database binding (OLTP) — set by `withDb` middleware. */
    db: D1Database;
    /** Analytics time-series D1 binding (`vierank-history`) — set by `withDb` middleware. */
    historyDb: D1Database;
    /** Authenticated user — set by `requireAuth` middleware. Absent on public routes. */
    user: { id: string; email: string; name: string };
  };
}

/** Standard JSON error body returned by all API routes. */
export interface ApiError {
  error: string;
  message: string;
}

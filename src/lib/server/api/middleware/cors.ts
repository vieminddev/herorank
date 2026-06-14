/**
 * Same-origin-only CORS guard for `/api/*` (Phase 5 S4 — INFRA-EDGE).
 *
 * The SPA and the API are served from the SAME Worker/origin, so legitimate browser calls are
 * same-origin and carry NO `Origin` header (or an `Origin` equal to the request host). We:
 *   - allow requests with no `Origin` header (same-origin fetch, server-to-server, curl),
 *   - allow requests whose `Origin` matches the request host,
 *   - REJECT cross-origin browser requests with 403 (prevents other sites driving the API
 *     with the user's cookies — defense in depth alongside Better Auth's CSRF handling).
 *
 * EXEMPTION: `/api/billing/webhook` is a server-to-server call from Stripe — Stripe does not
 * send a browser `Origin`, but we exempt the path explicitly so a future signed cross-origin
 * caller is never blocked here (signature verification is the real gate for that route).
 *
 * We deliberately DO NOT emit permissive `Access-Control-Allow-Origin: *` — there is no
 * intended cross-origin consumer. Same-origin responses need no CORS headers at all.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

/** Paths (relative to the `/api` basePath) that bypass the same-origin check. */
const EXEMPT_PATHS = ['/api/billing/webhook'];

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export const cors = createMiddleware<AppEnv>(async (c, next) => {
  const path = c.req.path;
  if (EXEMPT_PATHS.includes(path)) return next();

  const origin = c.req.header('origin');
  // No Origin → same-origin navigation/fetch, server-to-server, or non-browser client. Allow.
  if (!origin) return next();

  const reqHost = c.req.header('host') ?? originHost(new URL(c.req.url).origin);
  const oHost = originHost(origin);

  // Cross-origin browser request → reject. Same host → allow.
  if (oHost && reqHost && oHost === reqHost) return next();

  return c.json(
    { error: 'FORBIDDEN', message: 'Cross-origin requests are not allowed' },
    403
  );
});

/**
 * requireAuth (Engineer A): gate a route on a valid Better Auth session.
 *
 * Uses the SAME cookie the browser already holds — it forwards the raw request headers to
 * `auth.api.getSession`, so Hono routes and SvelteKit loads share one session source.
 * On success sets `c.var.user` (read via `getUser(c)`); otherwise returns 401 UNAUTHORIZED
 * (spec §9 / BR-013 server-side equivalent).
 */
import { createMiddleware } from 'hono/factory';
import { createAuth } from '../../auth';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }

  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  await next();
});

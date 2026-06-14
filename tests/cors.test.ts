/**
 * Tests for the same-origin-only CORS guard (Phase 5 S4, INFRA-EDGE).
 *
 * The middleware is mounted on a throwaway Hono app so we exercise the real Hono request flow.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { cors } from '../src/lib/server/api/middleware/cors';

function makeApp() {
  const app = new Hono().basePath('/api');
  app.use('*', cors);
  app.post('/billing/webhook', (c) => c.json({ ok: true }));
  app.get('/me', (c) => c.json({ ok: true }));
  return app;
}

describe('cors (same-origin only)', () => {
  const app = makeApp();

  it('allows same-origin requests (Origin host === request host)', async () => {
    const res = await app.request('http://app.test/api/me', {
      headers: { Origin: 'http://app.test', Host: 'app.test' },
    });
    expect(res.status).toBe(200);
  });

  it('allows requests with no Origin (server-to-server / non-browser)', async () => {
    const res = await app.request('http://app.test/api/me');
    expect(res.status).toBe(200);
  });

  it('rejects cross-origin browser requests with 403', async () => {
    const res = await app.request('http://app.test/api/me', {
      headers: { Origin: 'http://evil.test', Host: 'app.test' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('exempts the Stripe webhook path from the origin check', async () => {
    const res = await app.request('http://app.test/api/billing/webhook', {
      method: 'POST',
      headers: { Origin: 'http://stripe.com', Host: 'app.test' },
    });
    expect(res.status).toBe(200);
  });
});

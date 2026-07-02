/**
 * Waitlist route tests — `/api/waitlist/:tool` (the backend for the Video Maker "Coming soon"
 * waitlist form). `requireAuth` is mocked to inject a user so we exercise the handler logic
 * (tool allowlist, email validation, idempotent insert) against an in-memory D1 fake.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Context, Next } from 'hono';

// Replace the real Better-Auth gate with a pass-through that injects a signed-in user.
vi.mock('../src/lib/server/api/middleware/requireAuth', () => ({
  requireAuth: async (c: Context, next: Next) => {
    c.set('user', { id: 'u1', email: 'u1@example.com', name: 'U1' });
    await next();
  },
}));

import { Hono } from 'hono';
import waitlistRouter from '../src/lib/server/api/routes/waitlist';

interface Row {
  tool: string;
  email: string;
  user_id: string | null;
}

function makeDb() {
  const rows: Row[] = [];
  const db = {
    rows,
    prepare(_sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async run() {
          // Models `INSERT ... ON CONFLICT(tool, email) DO NOTHING`.
          const [tool, email, userId] = args as [string, string, string | null];
          if (rows.some((r) => r.tool === tool && r.email === email)) {
            return { meta: { changes: 0 } };
          }
          rows.push({ tool, email, user_id: userId });
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return db;
}

function makeApp(db: ReturnType<typeof makeDb>) {
  const app = new Hono().basePath('/api');
  app.use('*', async (c, next) => {
    c.set('db' as never, db as unknown as never);
    await next();
  });
  app.route('/waitlist', waitlistRouter as unknown as Hono);
  return app;
}

async function post(app: Hono, tool: string, body: unknown) {
  return app.request(`http://app.test/api/waitlist/${tool}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('waitlist route — POST /api/waitlist/:tool', () => {
  it('records a valid email and reports joined', async () => {
    const db = makeDb();
    const res = await post(makeApp(db), 'video-generator', { email: 'fan@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ joined: true });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ tool: 'video-generator', email: 'fan@example.com', user_id: 'u1' });
  });

  it('is idempotent — re-joining the same email does not duplicate the row', async () => {
    const db = makeDb();
    const app = makeApp(db);
    await post(app, 'video-generator', { email: 'fan@example.com' });
    const res2 = await post(app, 'video-generator', { email: 'fan@example.com' });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ joined: true });
    expect(db.rows).toHaveLength(1);
  });

  it('lowercases + trims the email before storing', async () => {
    const db = makeDb();
    const res = await post(makeApp(db), 'video-generator', { email: '  Fan@Example.COM  ' });
    expect(res.status).toBe(200);
    expect(db.rows[0].email).toBe('fan@example.com');
  });

  it('rejects an invalid email with 400', async () => {
    const db = makeDb();
    const res = await post(makeApp(db), 'video-generator', { email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it('rejects an unknown tool with 404 before touching the db', async () => {
    const db = makeDb();
    const res = await post(makeApp(db), 'some-other-tool', { email: 'a@b.com' });
    expect(res.status).toBe(404);
    expect(db.rows).toHaveLength(0);
  });
});

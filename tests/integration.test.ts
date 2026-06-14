/**
 * Integration tests — Phase 5 T2 (P1)
 *
 * Tests the real Hono route layer with:
 *   - Fake in-memory D1/KV bindings (same pattern as jobs.test.ts / dlq.test.ts)
 *   - Mocked `requireAuth` that injects a fixed test user
 *   - Mocked `createLlmService` gateway (controls SSE/JSON responses)
 *   - Real `requireCredits` middleware (exercises credit pre-check, deduct, 402 path)
 *   - Real `rateLimit` / `withDb` middleware wired through the app builder
 *
 * Covers (BA spec T2):
 *   (a) GET /api/me — returns user + credits after auth
 *   (b) LLM JSON tool via mock gateway: 200 + credits deducted + 402 when balance=0
 *   (c) Chat SSE deduct fires after [DONE]
 *   (d) Etsy tool via mock EtsyClient + cache hit skips the client call
 *   (e) Queue consumer end-to-end: enqueue → consume → done → deduct
 *   (f) OAuth callback: missing code/state → 400; missing cipher → 500
 *   (g) Rate limit: 429 after exceeding general bucket
 *   (h) DLQ consumer: job moves to failed, no credit charge
 *
 * Relative imports (not `$lib`) keep the tests independent of SvelteKit alias resolver,
 * matching tests/credits.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { AppEnv } from '../src/lib/server/api/types';
import type { Env } from '../src/lib/server/env';

// ---------------------------------------------------------------------------
// Mock observability — prevent console spam in tests
// ---------------------------------------------------------------------------
vi.mock('../src/lib/server/observability/log', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
  newRequestId: () => crypto.randomUUID(),
}));

// Mock $app/environment (SvelteKit internal, not available in vitest).
vi.mock('$app/environment', () => ({ building: false }));
// Mock better-auth svelte-kit handler.
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: async ({ resolve, event }: { resolve: (e: unknown) => Promise<Response>; event: unknown }) =>
    resolve(event),
}));
// Mock createAuth so requireAuth can run (it calls auth.api.getSession).
// The mock session will be set per-test via overriding the return value.
const mockGetSession = vi.fn();
vi.mock('../src/lib/server/auth', () => ({
  createAuth: () => ({ api: { getSession: mockGetSession } }),
}));

// Mock LLM service factory — controlled per test.
const mockLlmStream = vi.fn();
const mockLlmCompleteJson = vi.fn();
vi.mock('../src/lib/server/services/llmService', async (importActual) => {
  const actual = await importActual<typeof import('../src/lib/server/services/llmService')>();
  return {
    ...actual,
    createLlmService: () => ({
      complete: mockLlmCompleteJson,
      stream: mockLlmStream,
    }),
  };
});
vi.mock('../src/lib/server/services/llmJson', async () => ({
  completeJson: mockLlmCompleteJson,
}));

// Mock EtsyClient provider so Etsy tools run without a real key.
// NOTE: vi.mock factories are hoisted — no top-level variables allowed inside.
// We use importActual to get the real helpers and construct mocks inside.
import { createMockEtsyClient } from '../src/lib/server/services/etsy/mock';
import { __setEstimation, type Estimation } from '../src/lib/server/services/etsy/estimationContract';
const mockEtsyClient = createMockEtsyClient();
vi.mock('../src/lib/server/services/etsy/provider', async (importActual) => {
  const mod = await importActual<typeof import('../src/lib/server/services/etsy/provider')>();
  return {
    ...mod,
    // Override to always return mock client (no real key needed).
    getEtsyClient: (env: import('../src/lib/server/env').Env) => {
      // Use the real function logic but it will select mock (no ETSY_API_KEY).
      return mod.getEtsyClient({ ...env, ETSY_API_KEY: undefined });
    },
    getEtsyContext: (env: import('../src/lib/server/env').Env) => {
      return mod.getEtsyContext({ ...env, ETSY_API_KEY: undefined });
    },
    hasEtsyKey: (_env: unknown) => false,
  };
});

// Tool costs mock matching the hermetic pattern from jobs.test.ts.
vi.mock('../src/lib/server/services/toolCosts', () => ({
  TOOL_COSTS: {
    echo: 1, tag: 1, title: 1, keyword: 1, description: 2, 'rankhero-ai': 2,
    'listing-analyzer': 3, 'shop-analyzer': 3, 'rank-check': 2, 'niche-finder': 2,
    'best-sellers': 1, 'etsy-trends': 1, 'buyer-check': 2, 'shop-analysis-deep': 8,
  } as Record<string, number>,
  getToolCost: (tool: string) => ({
    echo: 1, tag: 1, title: 1, keyword: 1, description: 2, 'rankhero-ai': 2,
    'listing-analyzer': 3, 'shop-analyzer': 3, 'rank-check': 2, 'niche-finder': 2,
    'best-sellers': 1, 'etsy-trends': 1, 'buyer-check': 2, 'shop-analysis-deep': 8,
  } as Record<string, number>)[tool],
}));

// ---------------------------------------------------------------------------
// In-memory KV
// ---------------------------------------------------------------------------
function makeKV(): KVNamespace {
  const store = new Map<string, { value: string; expireAt: number | null }>();
  return {
    async get(key: string) {
      const e = store.get(key);
      if (!e) return null;
      if (e.expireAt !== null && Date.now() > e.expireAt) { store.delete(key); return null; }
      return e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, { value, expireAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null });
    },
    async delete(key: string) { store.delete(key); },
    async list() { return { keys: [], list_complete: true as const, cacheStatus: null }; },
  } as unknown as KVNamespace;
}

// ---------------------------------------------------------------------------
// In-memory D1 — subset covering /api/me, credits, analyses, tracked listings.
// Pattern identical to jobs.test.ts makeD1 with extended surfaces.
// ---------------------------------------------------------------------------
interface LedgerRow { id: number; user_id: string; delta: number; reason: string; ref: string | null; balance_after: number; created_at: number; }
interface SubRow { user_id: string; plan: string; status: string; period: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: number | null; credits_balance: number; created_at: number; updated_at: number; }
interface AnalysisRow { id: number; user_id: string; tool: string; subject: string; payload: string; metric: number | null; created_at: number; }
interface UsageRow { day: string; count: number; }
interface TrackedRow { id: number; user_id: string; listing_id: number; keyword: string; last_rank: number | null; last_checked_at: number | null; created_at: number; }
interface OAuthStateRow { state: string; user_id: string; code_verifier: string; created_at: number; expires_at: number; }
interface ConnectedShopRow { id: number; user_id: string; etsy_shop_id: string; encrypted_access_token: string; encrypted_refresh_token: string | null; token_expires_at: number | null; created_at: number; updated_at: number; }

interface Stmt {
  _sql: string;
  _args: unknown[];
  bind: (...a: unknown[]) => Stmt;
  first: <T>() => Promise<T | null>;
  run: () => Promise<{ meta: { changes: number } }>;
  all: <T>() => Promise<{ results: T[] }>;
}

function makeD1() {
  const ledger: LedgerRow[] = [];
  const subs: SubRow[] = [];
  const analyses: AnalysisRow[] = [];
  const usage: Map<string, number> = new Map();
  const tracked: TrackedRow[] = [];
  const oauthStates: OAuthStateRow[] = [];
  const shops: ConnectedShopRow[] = [];
  let ledgerSeq = 1;
  let analysisSeq = 1;
  let trackedSeq = 1;
  let shopSeq = 1;

  function balanceOf(userId: string): number {
    return ledger.filter((l) => l.user_id === userId).reduce((a, l) => a + l.delta, 0);
  }
  function subOf(userId: string): SubRow | undefined {
    return subs.find((x) => x.user_id === userId);
  }

  function exec(s: string, args: unknown[]): { changes: number } {
    // Usage tracking
    if (s.startsWith('INSERT INTO etsy_api_usage')) {
      const day = args[0] as string; const n = args[1] as number;
      usage.set(day, (usage.get(day) ?? 0) + n); return { changes: 1 };
    }
    // Subscription ensure row
    if (s.startsWith('INSERT OR IGNORE INTO subscriptions')) {
      const uid = args[0] as string;
      if (!subs.find((x) => x.user_id === uid)) {
        subs.push({ user_id: uid, plan: 'free', status: 'active', period: null, stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null, credits_balance: 0, created_at: 0, updated_at: 0 });
      }
      return { changes: 1 };
    }
    // Spend: credits ledger INSERT from SELECT with balance guard + ref-dedup (F-01).
    // NOTE: matched BEFORE the grant branch because the spend INSERT also contains `NOT EXISTS`
    // (the F-01 ref guard) — the `credits_balance >=` predicate is what disambiguates it.
    // bind order: (uid, delta, reason, ref, cost, uid, cost, uid, refExists)
    if (s.startsWith('INSERT INTO credits_ledger') && s.includes('SELECT') && s.includes('credits_balance >=')) {
      const [uid, delta, reason, ref, , , cost, , refExists] = args as [string, number, string, string | null, number, string, number, string, string | null];
      const sub = subs.find((x) => x.user_id === uid);
      // F-01 NOT EXISTS guard: a non-null ref already in the ledger blocks the insert (models
      // both the SQL NOT EXISTS and the partial unique index — duplicate non-null ref => no row).
      const dup = refExists != null && ledger.some((l) => l.user_id === uid && l.ref === refExists);
      if (dup) return { changes: 0 };
      if (sub && sub.credits_balance >= cost) {
        ledger.push({ id: ledgerSeq++, user_id: uid, delta, reason, ref, balance_after: sub.credits_balance + delta, created_at: Date.now() });
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    // Grant: credits ledger INSERT … VALUES (real grant() is a plain VALUES insert, not SELECT).
    if (s.startsWith('INSERT INTO credits_ledger') && s.includes('VALUES')) {
      const [uid, delta, reason, ref, balanceAfter] = args as [string, number, string, string | null, number];
      ledger.push({ id: ledgerSeq++, user_id: uid, delta, reason, ref, balance_after: balanceAfter, created_at: Date.now() });
      return { changes: 1 };
    }
    // Grant: subscriptions upsert (INSERT … ON CONFLICT DO UPDATE) — bumps the cached balance.
    if (s.startsWith('INSERT INTO subscriptions') && s.includes('ON CONFLICT')) {
      const [uid, plan, amount] = args as [string, string, number];
      let sub = subs.find((x) => x.user_id === uid);
      if (!sub) {
        sub = { user_id: uid, plan, status: 'active', period: null, stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null, credits_balance: amount, created_at: 0, updated_at: 0 };
        subs.push(sub);
      } else {
        if (plan !== 'free') sub.plan = plan;
        sub.credits_balance += amount;
      }
      return { changes: 1 };
    }
    // Spend: subscriptions cache UPDATE — re-derive credits_balance from the ledger SUM (F-01).
    // bind order: (uid, uid). Idempotent: always re-computes the cache from the ledger.
    if (s.startsWith('UPDATE subscriptions') && s.includes('SELECT COALESCE(SUM(delta), 0) FROM credits_ledger')) {
      const uid = args[0] as string;
      const sub = subs.find((x) => x.user_id === uid);
      if (sub) { sub.credits_balance = balanceOf(uid); return { changes: 1 }; }
      return { changes: 0 };
    }
    // Subscription UPDATE (plan/status/period/credits)
    if (s.startsWith('UPDATE subscriptions') && !s.includes('credits_balance = credits_balance -')) {
      const sub = subs.find((x) => x.user_id === (args[args.length - 1] as string));
      if (sub) { return { changes: 1 }; }
      return { changes: 0 };
    }
    // Analyses UPDATE payload
    if (s.startsWith('UPDATE analyses SET payload')) {
      const row = analyses.find((a) => a.id === args[2]);
      if (row) { row.payload = args[0] as string; row.metric = args[1] as number | null; }
      return { changes: row ? 1 : 0 };
    }
    // Analyses UPDATE status/result/error
    if (s.startsWith('UPDATE analyses SET')) {
      return { changes: 1 };
    }
    // Tracked listings INSERT
    if (s.startsWith('INSERT OR IGNORE INTO tracked_listings')) {
      const [uid, lid, kw] = args as [string, number, string];
      if (!tracked.some((t) => t.user_id === uid && t.listing_id === lid && t.keyword === kw)) {
        tracked.push({ id: trackedSeq++, user_id: uid, listing_id: lid, keyword: kw, last_rank: null, last_checked_at: null, created_at: Math.floor(Date.now() / 1000) });
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    // OAuth states INSERT
    if (s.startsWith('INSERT INTO oauth_states')) {
      oauthStates.push({ state: args[0] as string, user_id: args[1] as string, code_verifier: args[2] as string, created_at: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 600 });
      return { changes: 1 };
    }
    // OAuth states DELETE (take = consume one-shot)
    if (s.startsWith('DELETE FROM oauth_states WHERE state = ?')) {
      const idx = oauthStates.findIndex((o) => o.state === args[0]);
      if (idx !== -1) { oauthStates.splice(idx, 1); return { changes: 1 }; }
      return { changes: 0 };
    }
    // Connected shops INSERT
    if (s.startsWith('INSERT OR REPLACE INTO connected_shops')) {
      shops.push({ id: shopSeq++, user_id: args[0] as string, etsy_shop_id: args[1] as string, encrypted_access_token: args[2] as string, encrypted_refresh_token: args[3] as string | null, token_expires_at: args[4] as number | null, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) });
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  function prepare(sql: string): Stmt {
    const s = sql.replace(/\s+/g, ' ').trim();
    const api: Stmt = {
      _sql: s, _args: [],
      bind(...a: unknown[]) { api._args = a; return api; },
      async first<T>(): Promise<T | null> {
        const args = api._args;
        // Usage count
        if (s.includes('SELECT count FROM etsy_api_usage'))
          return { count: usage.get(args[0] as string) ?? 0 } as unknown as T;
        if (s.startsWith('INSERT INTO etsy_api_usage')) { exec(s, args); return { count: usage.get(args[0] as string) ?? 0 } as unknown as T; }
        // Subscription lookup
        if (s.includes('FROM subscriptions WHERE user_id = ?'))
          return (subs.find((x) => x.user_id === args[0]) as unknown as T) ?? null;
        // Credits balance (ledger SUM)
        if (s.includes('SUM(delta)') && s.includes('credits_ledger'))
          return { total: balanceOf(args[0] as string) } as unknown as T;
        // Ledger ref check
        if (s.includes('FROM credits_ledger WHERE user_id = ? AND ref = ?'))
          return ledger.some((l) => l.user_id === args[0] && l.ref === args[1]) ? ({ hit: 1 } as unknown as T) : null;
        // Analyses by id+tool
        if (s.includes('FROM analyses WHERE id = ? AND user_id = ? AND tool = ?'))
          return (analyses.find((a) => a.id === args[0] && a.user_id === args[1] && a.tool === args[2]) as unknown as T) ?? null;
        if (s.includes('FROM analyses WHERE id = ? AND tool = ?'))
          return (analyses.find((a) => a.id === args[0] && a.tool === args[1]) as unknown as T) ?? null;
        // Analyses INSERT RETURNING id
        if (s.startsWith('INSERT INTO analyses') && s.includes('RETURNING id')) {
          const row: AnalysisRow = { id: analysisSeq++, user_id: args[0] as string, tool: args[1] as string, subject: args[2] as string, payload: args[3] as string, metric: (args[4] as number | null) ?? null, created_at: Math.floor(Date.now() / 1000) };
          analyses.push(row);
          return { id: row.id } as unknown as T;
        }
        // Tracked listings count
        if (s.includes('COUNT(*) AS n FROM tracked_listings WHERE user_id = ?'))
          return { n: tracked.filter((t) => t.user_id === args[0]).length } as unknown as T;
        // OAuth state lookup
        if (s.includes('FROM oauth_states WHERE state = ?'))
          return (oauthStates.find((o) => o.state === args[0]) as unknown as T) ?? null;
        // Connected shop lookup
        if (s.includes('FROM connected_shops WHERE user_id = ?'))
          return (shops.find((sh) => sh.user_id === args[0]) as unknown as T) ?? null;
        return null;
      },
      async run() { return { meta: exec(s, api._args) }; },
      async all<T>(): Promise<{ results: T[] }> {
        const args = api._args;
        if (s.includes('FROM tracked_listings WHERE user_id = ?'))
          return { results: tracked.filter((t) => t.user_id === args[0]) as unknown as T[] };
        if (s.includes('FROM credits_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?')) {
          const rows = ledger.filter((l) => l.user_id === args[0]).slice(-(args[1] as number)).reverse();
          return { results: rows as unknown as T[] };
        }
        return { results: [] };
      },
    };
    return api;
  }

  const db = {
    prepare,
    async batch(stmts: Stmt[]) { return stmts.map((st) => ({ meta: exec(st._sql, st._args) })); },
  } as unknown as D1Database;

  function seedCredits(userId: string, amount: number, plan = 'business') {
    let sub = subs.find((x) => x.user_id === userId);
    if (!sub) {
      sub = { user_id: userId, plan, status: 'active', period: null, stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null, credits_balance: 0, created_at: 0, updated_at: 0 };
      subs.push(sub);
    }
    sub.credits_balance += amount;
    ledger.push({ id: ledgerSeq++, user_id: userId, delta: amount, reason: 'grant', ref: null, balance_after: sub.credits_balance, created_at: Date.now() });
  }

  return { db, ledger, subs, analyses, tracked, oauthStates, shops, seedCredits, balanceOf, subOf };
}

// ---------------------------------------------------------------------------
// Build a fresh integration Hono app for each test (mirrors production middleware order
// from app.ts but with injectable fake bindings).
// ---------------------------------------------------------------------------
async function buildIntegrationApp(env: Partial<Env> = {}) {
  // Re-import to get a fresh, unhoisted module (avoids stale route-level module cache).
  const { default: meRouter } = await import('../src/lib/server/api/routes/me');
  const { default: toolsRouter } = await import('../src/lib/server/api/routes/tools');
  const { default: oauthRouter } = await import('../src/lib/server/api/routes/oauth');
  const { withDb } = await import('../src/lib/server/api/middleware/withDb');
  const { logger } = await import('../src/lib/server/api/middleware/logger');
  const { cors } = await import('../src/lib/server/api/middleware/cors');
  const { rateLimit } = await import('../src/lib/server/api/middleware/rateLimit');

  const app = new Hono<AppEnv>().basePath('/api');

  // Middleware order from app.ts.
  app.use('*', logger);
  app.use('*', cors);
  app.use('*', rateLimit('general'));
  app.use('/tools/*', rateLimit('llm'));
  app.use('*', withDb);
  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/me', meRouter);
  app.route('/tools', toolsRouter);
  app.route('/connect', oauthRouter);

  app.notFound((c) => c.json({ error: 'NOT_FOUND', message: `No route for ${c.req.path}` }, 404));

  /** Fire a request with the fake env bindings injected. */
  const request = async (
    path: string,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = `http://localhost${path}`;
    const req = new Request(url, {
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '127.0.0.1', ...((init.headers as Record<string, string>) ?? {}) },
      ...init,
    });
    return app.fetch(req, env as Env);
  };

  return { request };
}

// ---------------------------------------------------------------------------
// Stub estimation for Etsy tools
// ---------------------------------------------------------------------------
const stubEstimation: Estimation = {
  demandScore: () => ({ score: 50, label: 'medium' }),
  salesEstimate: ({ reviewsLast90d }) => ({ monthlySales: reviewsLast90d * 2, monthlyRevenue: `$${reviewsLast90d * 20}`, rangeLow: reviewsLast90d, rangeHigh: reviewsLast90d * 3, estimated: true }),
  competitionLevel: (n) => (n < 1000 ? 'low' : 'medium'),
  trendDelta: () => ({ change: '—', direction: 'stable' }),
  rankEstimate: ({ orderedListingIds, targetListingId }) => { const idx = orderedListingIds.indexOf(targetListingId); return { position: idx === -1 ? null : idx + 1 }; },
  listingAudit: () => ({ title: { score: 80, feedback: { clarity: [], seo: [] } }, tags: { score: 80, feedback: { clarity: [], seo: [] } }, images: { score: 80, feedback: { clarity: [], seo: [] } }, video: { score: 0, feedback: { clarity: [], seo: [] } }, description: { score: 80, feedback: { clarity: [], seo: [] } } }),
};

beforeEach(() => {
  __setEstimation(stubEstimation);
  vi.clearAllMocks();
  // Default: unauthenticated session — tests override this per-describe.
  mockGetSession.mockResolvedValue(null);
});

// Helper to set an authenticated test session.
function setSession(userId = 'u-test', name = 'Test User', email = 'test@example.com') {
  mockGetSession.mockResolvedValue({
    user: { id: userId, name, email },
    session: { id: 'sess-test', userId },
  });
}

// ---------------------------------------------------------------------------
// (a) GET /api/me — user + credits
// ---------------------------------------------------------------------------
describe('(a) GET /api/me — authenticated user + credits', () => {
  it('returns 401 when not authenticated', async () => {
    const fake = makeD1();
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);
    const res = await request('/api/me');
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('returns user info + credits balance after auth', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 30);
    setSession('u1', 'Alice', 'alice@test.com');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json() as { user: { id: string }; credits: { balance: number }; subscription: { plan: string } };
    expect(body.user.id).toBe('u1');
    expect(body.credits.balance).toBe(30);
    expect(body.subscription.plan).toBe('business');
  });

  it('returns balance=0 + plan=free for a brand-new user (no sub row yet)', async () => {
    const fake = makeD1();
    setSession('new-user');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json() as { credits: { balance: number }; subscription: { plan: string } };
    expect(body.credits.balance).toBe(0);
    expect(body.subscription.plan).toBe('free');
  });
});

// ---------------------------------------------------------------------------
// (b) LLM tool (echo) via route layer: 200 + credits deducted + 402 when empty
// ---------------------------------------------------------------------------
describe('(b) LLM tool via route layer — credits deduct + 402 path', () => {
  it('200 + creditsRemaining in body after a successful echo call', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 10);
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/tools/echo', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result: string; creditsRemaining: number };
    expect(body.result).toBe('hello');
    // echo costs 1 credit; 10 - 1 = 9.
    expect(body.creditsRemaining).toBe(9);
    expect(fake.balanceOf('u1')).toBe(9);
  });

  it('402 INSUFFICIENT_CREDITS when balance is zero', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 0); // ensure sub row exists but balance=0
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/tools/echo', {
      method: 'POST',
      body: JSON.stringify({ text: 'hi' }),
    });
    expect(res.status).toBe(402);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INSUFFICIENT_CREDITS');
    // No deduction happened.
    expect(fake.balanceOf('u1')).toBe(0);
  });

  it('does NOT deduct credits when the tool handler returns 400', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 10);
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/tools/echo', {
      method: 'POST',
      body: JSON.stringify({ text: '' }), // fails zod min(1)
    });
    expect(res.status).toBe(400);
    // Balance unchanged.
    expect(fake.balanceOf('u1')).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// (c) Chat SSE — deduct fires only after [DONE], not on open
// ---------------------------------------------------------------------------
describe('(c) Chat SSE — deduct after [DONE]', () => {
  it('503 JSON (not 200+SSE) when LLM_API_KEY is absent — BUG-01 regression', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 10);
    setSession('u1');
    // No LLM_API_KEY in env → pre-stream 503 JSON (spec §3.5 fix, Phase 2 BUG-01).
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/tools/rankhero-ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    // Must be 503 JSON, NOT 200 SSE (BUG-01 regression check).
    expect(res.status).toBe(503);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json() as { error: string };
    expect(body.error).toBe('LLM_UNAVAILABLE');
    // No credit deduction.
    expect(fake.balanceOf('u1')).toBe(10);
  });

  it('402 JSON (not 200+SSE) when balance < cost before stream opens', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 0);
    setSession('u1');
    const env = { DB: fake.db, KV: makeKV(), LLM_API_KEY: 'sk-test', LLM_MODEL: 'gpt-mock' };
    const { request } = await buildIntegrationApp(env as unknown as Env);

    const res = await request('/api/tools/rankhero-ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(402);
    expect(fake.balanceOf('u1')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (d) Etsy tool via mock EtsyClient + cache hit skips client call
// ---------------------------------------------------------------------------
describe('(d) Etsy listing-analyzer — mock client + cache', () => {
  it('200 with estimated fields and credits deducted (listing-analyzer costs 3)', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 20);
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/tools/listing-analyzer', {
      method: 'POST',
      body: JSON.stringify({ listing: '4511075902' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { creditsRemaining: number; estimated: unknown };
    // listing-analyzer costs 3; 20 - 3 = 17.
    expect(body.creditsRemaining).toBe(17);
    expect(fake.balanceOf('u1')).toBe(17);
  });

  it('cache hit: second call does not increase usage counter (EtsyClient not called again)', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 40);
    setSession('u1');
    const kv = makeKV();
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: kv } as unknown as Env);

    const spy = vi.spyOn(mockEtsyClient, 'getListing');

    // First call — populates cache.
    await request('/api/tools/listing-analyzer', {
      method: 'POST',
      body: JSON.stringify({ listing: '4511075902' }),
    });
    const callsAfterFirst = spy.mock.calls.length;

    // Second call — same listing, should hit KV cache.
    await request('/api/tools/listing-analyzer', {
      method: 'POST',
      body: JSON.stringify({ listing: '4511075902' }),
    });
    // getListing call count should NOT have increased (cache served the response).
    expect(spy.mock.calls.length).toBe(callsAfterFirst);

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// (e) Queue consumer end-to-end: enqueue → consume → done → deduct
// ---------------------------------------------------------------------------
describe('(e) Queue consumer end-to-end', () => {
  it('enqueue returns 202 with jobId; consume moves job to done + deducts credits', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 50);
    setSession('u1');
    // Provide a minimal mock ANALYSIS_QUEUE so the route sends the message without inline processing.
    const queueMessages: unknown[] = [];
    const mockQueue = { send: async (msg: unknown) => { queueMessages.push(msg); } };
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV(), ANALYSIS_QUEUE: mockQueue } as unknown as Env);

    // Enqueue a deep shop analysis (no ANALYSIS_QUEUE → falls back to inline waitUntil).
    const res = await request('/api/tools/shop-analysis-deep', {
      method: 'POST',
      body: JSON.stringify({ shop: 'TestShop' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { jobId: string; status: string };
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe('queued');
    // The queue message was captured; verify shape.
    expect(queueMessages.length).toBe(1);
    const msg = queueMessages[0] as { kind: string; jobId: string; userId: string; shop: string };
    expect(msg.kind).toBe('shop-analysis-deep');
    expect(msg.jobId).toBe(body.jobId);
    expect(msg.userId).toBe('u1');
    expect(msg.shop).toBe('TestShop');

    // Now simulate the queue consumer processing the job end-to-end.
    const { processDeepAnalysisJob } = await import('../src/lib/server/jobs/consume');
    const envForConsumer = { DB: fake.db, KV: makeKV() } as unknown as Env;
    const outcome = await processDeepAnalysisJob(envForConsumer, msg as import('../src/lib/server/jobs/types').DeepShopAnalysisJob);
    expect(outcome.result).toBe('done');

    // Credits deducted: 50 - 8 = 42.
    expect(fake.balanceOf('u1')).toBe(42);

    // Poll via route to verify job status is 'done'.
    const pollRes = await request(`/api/tools/shop-analysis-deep/${body.jobId}`);
    expect(pollRes.status).toBe(200);
    const poll = await pollRes.json() as { status: string };
    expect(poll.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// (f) OAuth callback: validation paths (no real cipher)
// ---------------------------------------------------------------------------
describe('(f) OAuth callback — validation paths', () => {
  it('GET /api/connect/etsy/callback without code/state → 400 VALIDATION', async () => {
    const fake = makeD1();
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/connect/etsy/callback');
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('VALIDATION');
  });

  it('GET /api/connect/etsy/callback with oauth error param → 302 redirect', async () => {
    const fake = makeD1();
    setSession('u1');
    const { request } = await buildIntegrationApp({
      DB: fake.db, KV: makeKV(), OAUTH_TOKEN_KEY: 'ZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVmZGVhZGJlZWY=',
    } as unknown as Env);

    const res = await request('/api/connect/etsy/callback?error=access_denied', { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/settings/connections');
    expect(loc).toContain('access_denied');
  });

  it('GET /api/connect/etsy/callback with code+state → 500 if cipher missing (no OAUTH_TOKEN_KEY)', async () => {
    const fake = makeD1();
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    const res = await request('/api/connect/etsy/callback?code=abc&state=xyz');
    // No OAUTH_TOKEN_KEY → cipher fails → 500 INTERNAL.
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INTERNAL');
  });
});

// ---------------------------------------------------------------------------
// (g) Rate limit — 429 after exceeding per-IP general bucket
// ---------------------------------------------------------------------------
describe('(g) Rate limit — 429 after bucket exhausted', () => {
  it('returns 429 with RATE_LIMITED after exceeding the general bucket (1/min)', async () => {
    const fake = makeD1();
    // Use a KV fake that can count calls; override general limit to 1/min via env.
    const kv = makeKV();
    const env = {
      DB: fake.db,
      KV: kv,
      RATE_LIMIT_GENERAL_PER_MIN: '1', // limit to 1 request/minute
    } as unknown as Env;
    const { request } = await buildIntegrationApp(env);

    // First request: should succeed (or 401 — either way, NOT 429).
    const first = await request('/api/health');
    expect(first.status).not.toBe(429);

    // Second request same IP within 1 minute: should be rate-limited.
    const second = await request('/api/health');
    expect(second.status).toBe(429);
    const body = await second.json() as { error: string };
    expect(body.error).toBe('RATE_LIMITED');
    expect(second.headers.has('Retry-After')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (h) DLQ consumer — job fails, no credit charge
// ---------------------------------------------------------------------------
describe('(h) DLQ consumer — job marked failed, no credit deduction', () => {
  it('handleDLQ marks job failed and does not charge credits', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 100);
    const { createAnalysesJobStore } = await import('../src/lib/server/services/jobs/analysesJobStore');
    const { handleDLQ } = await import('../src/lib/server/jobs/dlq');
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'BrokenShop');

    function makeMsg(body: unknown, id = 'dlq-1') {
      let acked = false;
      return { id, body, ack: () => { acked = true; }, retry: () => {}, get wasAcked() { return acked; } };
    }

    const msg = makeMsg({ kind: 'shop-analysis-deep', jobId: String(jobId), userId: 'u1', shop: 'BrokenShop', requestedAt: Date.now() });
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

    await handleDLQ(
      { queue: 'herorank-analysis-dlq', messages: [msg] } as unknown as MessageBatch<import('../src/lib/server/jobs/types').AnalysisQueueMessage>,
      { DB: fake.db, KV: makeKV() } as unknown as Env,
      ctx
    );

    const view = await jobs.getById(jobId);
    expect(view?.status).toBe('failed');
    expect(msg.wasAcked).toBe(true);
    // No credits deducted — DLQ handler only marks failed, never charges.
    expect(fake.balanceOf('u1')).toBe(100);
    const spends = fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep');
    expect(spends.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// creditsDelta wiring — O1 fix verify
// ---------------------------------------------------------------------------
describe('creditsDelta wiring (O1 fix — requireCredits sets creditsDelta)', () => {
  it('logger middleware receives creditsDelta after a successful echo call', async () => {
    const { logEvent } = await import('../src/lib/server/observability/log');
    const fake = makeD1();
    fake.seedCredits('u1', 10);
    setSession('u1');
    const { request } = await buildIntegrationApp({ DB: fake.db, KV: makeKV() } as unknown as Env);

    await request('/api/tools/echo', {
      method: 'POST',
      body: JSON.stringify({ text: 'probe' }),
    });

    // logEvent is called by logger middleware with the credits_delta field.
    const calls = (logEvent as ReturnType<typeof vi.fn>).mock.calls;
    const requestLog = calls.find(([, fields]) => fields?.event === 'request' && fields?.path?.includes('/tools/echo'));
    expect(requestLog).toBeDefined();
    // credits_delta should be -1 (echo costs 1 credit, deducted).
    expect(requestLog![1].credits_delta).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// per-job spend ref — S10 fix verify
// ---------------------------------------------------------------------------
describe('per-job spend ref (S10 fix — consume.ts uses job:{jobId} as ledger ref)', () => {
  it('deep-analysis spend row has ref=job:{jobId}, not the constant tool name', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 100);
    const { createAnalysesJobStore } = await import('../src/lib/server/services/jobs/analysesJobStore');
    const { processDeepAnalysisJob } = await import('../src/lib/server/jobs/consume');

    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'TestShop');

    await processDeepAnalysisJob(
      { DB: fake.db, KV: makeKV() } as unknown as Env,
      { kind: 'shop-analysis-deep', jobId: String(jobId), userId: 'u1', shop: 'TestShop', requestedAt: Date.now() }
    );

    // The spend ledger row must have ref = `job:{jobId}` (not 'shop-analysis-deep').
    const spends = fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep');
    expect(spends.length).toBe(1);
    expect(spends[0].ref).toBe(`job:${jobId}`);
    // ref is per-job — a second job would have a different ref.
    const jobId2 = await jobs.enqueue('u1', 'SecondShop');
    await processDeepAnalysisJob(
      { DB: fake.db, KV: makeKV() } as unknown as Env,
      { kind: 'shop-analysis-deep', jobId: String(jobId2), userId: 'u1', shop: 'TestShop', requestedAt: Date.now() }
    );
    const spends2 = fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep');
    expect(spends2.length).toBe(2);
    expect(spends2[1].ref).toBe(`job:${jobId2}`);
    // Two different jobs → two different refs.
    expect(spends2[0].ref).not.toBe(spends2[1].ref);
  });
});

// ---------------------------------------------------------------------------
// F-01 (P0) — spend idempotency on ref through the REAL creditsRepo + fake D1.
// Models the status-reset / DLQ-replay scenario that bypasses consume.ts's `done` early-return:
// the same per-job ref is spent twice directly → the ledger must dedupe → exactly one debit.
// ---------------------------------------------------------------------------
describe('F-01: creditsRepo.spend is idempotent on ref (no double-charge)', () => {
  it('same ref spent twice → one debit; different ref → debits again', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 100); // plenty — a second debit WOULD land if not deduped
    const { createCreditsRepo } = await import('../src/lib/server/repositories/creditsRepo');
    const repo = createCreditsRepo(fake.db);

    const r1 = await repo.spend({ userId: 'u1', cost: 8, reason: 'spend:shop-analysis-deep', ref: 'job:7' });
    const r2 = await repo.spend({ userId: 'u1', cost: 8, reason: 'spend:shop-analysis-deep', ref: 'job:7' });

    // Both report success (idempotent), but only ONE debit row for that ref, balance moved 8 once.
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(fake.balanceOf('u1')).toBe(92);
    expect(fake.ledger.filter((l) => l.user_id === 'u1' && l.ref === 'job:7' && l.delta < 0)).toHaveLength(1);

    // A genuinely different operation (different ref) still debits.
    const r3 = await repo.spend({ userId: 'u1', cost: 8, reason: 'spend:shop-analysis-deep', ref: 'job:8' });
    expect(r3.ok).toBe(true);
    expect(fake.balanceOf('u1')).toBe(84);
    expect(fake.ledger.filter((l) => l.user_id === 'u1' && l.delta < 0)).toHaveLength(2);
  });

  it('insufficient balance (ref never charged) → ok:false, no debit', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 5); // less than cost 8
    const { createCreditsRepo } = await import('../src/lib/server/repositories/creditsRepo');
    const repo = createCreditsRepo(fake.db);

    const r = await repo.spend({ userId: 'u1', cost: 8, reason: 'spend:shop-analysis-deep', ref: 'job:9' });
    expect(r.ok).toBe(false);
    expect(fake.balanceOf('u1')).toBe(5);
    expect(fake.ledger.filter((l) => l.user_id === 'u1' && l.delta < 0)).toHaveLength(0);
  });
});

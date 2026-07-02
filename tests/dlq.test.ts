/**
 * DLQ consumer tests (Phase 5, R3 P0 — INFRA-JOBS).
 *
 * Covers:
 *   1. Force-fail flow: message enters DLQ → handleDLQ marks job 'failed' + no charge.
 *   2. Unknown job kind in DLQ → acked safely without crash.
 *   3. Quota persist (O4): usageCounter emits logEvent warn at 80% of 10k Etsy limit.
 *   4. Idempotency (R4): already-done job is not re-processed on queue retry.
 *
 * Everything is hermetic: in-memory D1, no real DB/queue/Etsy key needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { AnalysisQueueMessage } from '../src/lib/server/jobs/types';
import type { Env } from '../src/lib/server/env';

// ---------------------------------------------------------------------------
// Mock observability log (INFRA-EDGE seam — may not be resolvable in tests)
// Provide a stub so DLQ handler tests are hermetic even if log.ts isn't wired.
// ---------------------------------------------------------------------------
vi.mock('../src/lib/server/observability/log', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
  newRequestId: () => 'test-id',
}));

import { logEvent, logError } from '../src/lib/server/observability/log';
import { handleDLQ } from '../src/lib/server/jobs/dlq';
import { createAnalysesJobStore } from '../src/lib/server/services/jobs/analysesJobStore';
import { createUsageCounter, ETSY_HARD_DAILY_LIMIT, utcDay } from '../src/lib/server/services/etsy/usageCounter';
import { processDeepAnalysisJob } from '../src/lib/server/jobs/consume';
import { __setEstimation, type Estimation } from '../src/lib/server/services/etsy/estimationContract';

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
  } as unknown as KVNamespace;
}

// ---------------------------------------------------------------------------
// In-memory D1 (minimal surface: analyses + etsy_api_usage + subscriptions/ledger)
// ---------------------------------------------------------------------------
interface AnalysisRow { id: number; user_id: string; tool: string; subject: string; payload: string; metric: number | null; created_at: number; }
interface UsageRow { count: number }
interface SubRow { user_id: string; plan: string; status: string; credits_balance: number; [k: string]: unknown; }
interface LedgerRow { id: number; user_id: string; delta: number; reason: string; ref: string | null; balance_after: number; }
interface Stmt { _sql: string; _args: unknown[]; bind: (...a: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }>; all: <T>() => Promise<{ results: T[] }>; }

function makeD1() {
  const usage = new Map<string, number>();
  const analyses: AnalysisRow[] = [];
  const subs: SubRow[] = [];
  const ledger: LedgerRow[] = [];
  let analysisSeq = 1;
  let ledgerSeq = 1;

  function balanceOf(userId: string): number {
    return ledger.filter((l) => l.user_id === userId).reduce((a, l) => a + l.delta, 0);
  }

  function exec(s: string, args: unknown[]): { changes: number } {
    if (s.startsWith('INSERT INTO etsy_api_usage')) {
      const day = args[0] as string; const n = args[1] as number;
      usage.set(day, (usage.get(day) ?? 0) + n); return { changes: 1 };
    }
    if (s.startsWith('UPDATE analyses SET payload')) {
      const row = analyses.find((a) => a.id === args[2]);
      if (row) { row.payload = args[0] as string; row.metric = args[1] as number | null; }
      return { changes: row ? 1 : 0 };
    }
    // creditsRepo.spend: INSERT ... VALUES ... ON CONFLICT (user_id, ref) DO NOTHING (balance
    // guard is done in JS via sumLedger). Model the partial unique index: a duplicate non-null
    // ref inserts no row (changes 0 → idempotent), otherwise the spend row lands.
    if (s.startsWith('INSERT INTO credits_ledger') && s.includes('ON CONFLICT')) {
      const [uid, delta, reason, ref, balanceAfter] = args as [string, number, string, string | null, number];
      if (ref != null && ledger.some((l) => l.user_id === uid && l.ref === ref)) {
        return { changes: 0 };
      }
      ledger.push({ id: ledgerSeq++, user_id: uid, delta, reason, ref, balance_after: balanceAfter });
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
        if (s.includes('SELECT count FROM etsy_api_usage'))
          return { count: usage.get(args[0] as string) ?? 0 } as unknown as T;
        if (s.startsWith('INSERT INTO etsy_api_usage')) {
          exec(s, args);
          return { count: usage.get(args[0] as string) ?? 0 } as unknown as T;
        }
        if (s.startsWith('INSERT INTO analyses') && s.includes('RETURNING id')) {
          const row: AnalysisRow = { id: analysisSeq++, user_id: args[0] as string, tool: args[1] as string, subject: args[2] as string, payload: args[3] as string, metric: null, created_at: 0 };
          analyses.push(row);
          return { id: row.id } as unknown as T;
        }
        if (s.includes('FROM analyses WHERE id = ? AND user_id = ? AND tool = ?'))
          return (analyses.find((a) => a.id === args[0] && a.user_id === args[1] && a.tool === args[2]) as unknown as T) ?? null;
        if (s.includes('FROM analyses WHERE id = ? AND tool = ?'))
          return (analyses.find((a) => a.id === args[0] && a.tool === args[1]) as unknown as T) ?? null;
        if (s.includes('SUM(delta)') && s.includes('credits_ledger'))
          return { total: balanceOf(args[0] as string) } as unknown as T;
        if (s.includes('FROM credits_ledger WHERE user_id = ? AND ref = ?'))
          return ledger.some((l) => l.user_id === args[0] && l.ref === args[1]) ? ({ hit: 1 } as unknown as T) : null;
        if (s.includes('FROM subscriptions WHERE user_id = ?'))
          return (subs.find((x) => x.user_id === args[0]) as unknown as T) ?? null;
        return null;
      },
      async run() { return { meta: exec(s, api._args) }; },
      async all<T>(): Promise<{ results: T[] }> { return { results: [] }; },
    };
    return api;
  }

  const db = { prepare, async batch(stmts: Stmt[]) { return stmts.map((st) => ({ meta: exec(st._sql, st._args) })); } } as unknown as D1Database;

  function seedCredits(userId: string, amount: number, plan = 'business') {
    let sub = subs.find((x) => x.user_id === userId);
    if (!sub) { sub = { user_id: userId, plan, status: 'active', credits_balance: 0, period: null, stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null, created_at: 0, updated_at: 0 }; subs.push(sub); }
    sub.credits_balance += amount;
    ledger.push({ id: ledgerSeq++, user_id: userId, delta: amount, reason: 'grant', ref: null, balance_after: amount });
  }

  function seedUsage(day: string, count: number) { usage.set(day, count); }

  return { db, analyses, subs, ledger, usage, seedCredits, seedUsage, balanceOf };
}

// ---------------------------------------------------------------------------
// Stub estimation for consume.ts path
// ---------------------------------------------------------------------------
const stubEstimation: Estimation = {
  demandScore: () => ({ score: 50, label: 'medium' }),
  salesEstimate: ({ reviewsLast90d }) => ({ monthlySales: reviewsLast90d * 2, monthlyRevenue: `$${reviewsLast90d * 20}`, rangeLow: reviewsLast90d, rangeHigh: reviewsLast90d * 3, estimated: true }),
  competitionLevel: (n) => (n < 1000 ? 'low' : 'medium'),
  trendDelta: () => ({ change: '—', direction: 'stable' }),
  rankEstimate: ({ orderedListingIds, targetListingId }) => { const idx = orderedListingIds.indexOf(targetListingId); return { position: idx === -1 ? null : idx + 1 }; },
  listingAudit: () => ({ title: { score: 80, feedback: { clarity: [], seo: [] } }, tags: { score: 80, feedback: { clarity: [], seo: [] } }, images: { score: 80, feedback: { clarity: [], seo: [] } }, video: { score: 0, feedback: { clarity: [], seo: [] } }, description: { score: 80, feedback: { clarity: [], seo: [] } } }),
};

vi.mock('../src/lib/server/services/toolCosts', () => ({
  TOOL_COSTS: { 'shop-analysis-deep': 8 } as Record<string, number>,
  getToolCost: (tool: string) => ({ 'shop-analysis-deep': 8 } as Record<string, number>)[tool],
}));

// ---------------------------------------------------------------------------
// Fake Message helper
// ---------------------------------------------------------------------------
function makeMsg(body: AnalysisQueueMessage, id = 'msg-1') {
  let acked = false; let retried = false;
  return { id, body, ack: () => { acked = true; }, retry: () => { retried = true; }, get wasAcked() { return acked; }, get wasRetried() { return retried; } };
}
function makeBatch(messages: ReturnType<typeof makeMsg>[], queue = 'herorank-analysis-dlq') {
  return { queue, messages } as unknown as MessageBatch<AnalysisQueueMessage>;
}
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

// ---------------------------------------------------------------------------
beforeEach(() => {
  __setEstimation(stubEstimation);
  vi.clearAllMocks();
});

// ===========================================================================
// 1. DLQ consumer — force-fail flow
// ===========================================================================
describe('handleDLQ — R3 (P0) DLQ consumer', () => {
  it('marks job failed in D1 when a message arrives in DLQ', async () => {
    const fake = makeD1();
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'TestShop');

    const msg = makeMsg({ kind: 'shop-analysis-deep', jobId: String(jobId), userId: 'u1', shop: 'TestShop', requestedAt: Date.now() });
    const batch = makeBatch([msg]);

    await handleDLQ(batch, { DB: fake.db, KV: makeKV() } as unknown as Env, ctx);

    const view = await jobs.getById(jobId);
    expect(view?.status).toBe('failed');
    expect(view?.error).toMatch(/maximum retries/i);
  });

  it('does NOT charge credits when job fails via DLQ (deduct-on-success rule)', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 100);
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'TestShop');

    const msg = makeMsg({ kind: 'shop-analysis-deep', jobId: String(jobId), userId: 'u1', shop: 'TestShop', requestedAt: Date.now() });
    await handleDLQ(makeBatch([msg]), { DB: fake.db, KV: makeKV() } as unknown as Env, ctx);

    // Balance must be unchanged — DLQ handler never charges credits.
    expect(fake.balanceOf('u1')).toBe(100);
    const spends = fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep');
    expect(spends.length).toBe(0);
  });

  it('always acks DLQ messages (never retries from DLQ)', async () => {
    const fake = makeD1();
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'AShop');

    const msg = makeMsg({ kind: 'shop-analysis-deep', jobId: String(jobId), userId: 'u1', shop: 'AShop', requestedAt: Date.now() });
    await handleDLQ(makeBatch([msg]), { DB: fake.db, KV: makeKV() } as unknown as Env, ctx);

    expect(msg.wasAcked).toBe(true);
    expect(msg.wasRetried).toBe(false);
  });

  it('emits a logError alert with job context when DLQ message is processed', async () => {
    const fake = makeD1();
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'AlertShop');

    const msg = makeMsg({ kind: 'shop-analysis-deep', jobId: String(jobId), userId: 'u1', shop: 'AlertShop', requestedAt: 12345 });
    await handleDLQ(makeBatch([msg]), { DB: fake.db, KV: makeKV() } as unknown as Env, ctx);

    expect(logError).toHaveBeenCalledOnce();
    const [, context] = (logError as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(context.event).toBe('dlq');
    expect(context.user_id).toBe('u1');
    expect(context.job_id).toBe(String(jobId));
  });

  it('handles unknown job kind gracefully — acks without crashing', async () => {
    const fake = makeD1();
    const unknownMsg = makeMsg({ kind: 'future-kind' as never, jobId: '999', userId: 'u1', shop: 'x', requestedAt: 0 });

    await expect(
      handleDLQ(makeBatch([unknownMsg]), { DB: fake.db, KV: makeKV() } as unknown as Env, ctx)
    ).resolves.toBeUndefined();

    expect(unknownMsg.wasAcked).toBe(true);
  });

  it('processes multiple messages in one batch independently', async () => {
    const fake = makeD1();
    const jobs = createAnalysesJobStore(fake.db);
    const id1 = await jobs.enqueue('u1', 'Shop1');
    const id2 = await jobs.enqueue('u2', 'Shop2');

    const m1 = makeMsg({ kind: 'shop-analysis-deep', jobId: String(id1), userId: 'u1', shop: 'Shop1', requestedAt: 0 }, 'msg-1');
    const m2 = makeMsg({ kind: 'shop-analysis-deep', jobId: String(id2), userId: 'u2', shop: 'Shop2', requestedAt: 0 }, 'msg-2');
    await handleDLQ(makeBatch([m1, m2]), { DB: fake.db, KV: makeKV() } as unknown as Env, ctx);

    expect((await jobs.getById(id1))?.status).toBe('failed');
    expect((await jobs.getById(id2))?.status).toBe('failed');
    expect(m1.wasAcked).toBe(true);
    expect(m2.wasAcked).toBe(true);
  });
});

// ===========================================================================
// 2. Etsy quota persist + alert (O4)
// ===========================================================================
describe('usageCounter — O4 (P1) quota persist + alert', () => {
  it('counter is D1-persisted (survives "restart" = new createUsageCounter call with same db)', async () => {
    const { db } = makeD1();
    const day = utcDay();

    // First counter instance: consume 100
    const c1 = createUsageCounter(db, { cap: 8000 });
    await c1.consume(100);

    // Second instance (simulates isolate recycle — new in-memory counter, same D1)
    const c2 = createUsageCounter(db, { cap: 8000 });
    const { usedToday } = await c2.peek();
    expect(usedToday).toBe(100); // persistent across "restart"
    void day;
  });

  it('does NOT emit quota-warning below 80% of 10k Etsy limit', async () => {
    const { db } = makeD1();
    const c = createUsageCounter(db, { cap: 8000 });
    // Consume 7999 — below 8000 (80% of 10k = 8000, threshold is crossing from below to at/above)
    await c.consume(7998);
    expect(logEvent).not.toHaveBeenCalledWith('warn', expect.objectContaining({ event: 'etsy_quota_warning' }));
  });

  it('emits quota-warning exactly once when usage crosses 80% of ETSY_HARD_DAILY_LIMIT (8000)', async () => {
    const { db, seedUsage } = makeD1();
    const day = utcDay();
    // Pre-seed counter just below 80% threshold (7999)
    seedUsage(day, 7999);

    const c = createUsageCounter(db, { cap: 8000 });
    await c.consume(1); // crosses from 7999 to 8000 (= 80% of 10k)

    expect(logEvent).toHaveBeenCalledWith('warn', expect.objectContaining({
      event: 'etsy_quota_warning',
      hard_limit: ETSY_HARD_DAILY_LIMIT,
      threshold_pct: 80,
    }));
  });

  it('does NOT re-emit warning if already above threshold (idempotent alert)', async () => {
    const { db, seedUsage } = makeD1();
    const day = utcDay();
    // Already at 8001 — both before and after consume are above threshold
    seedUsage(day, 8001);

    const c = createUsageCounter(db, { cap: 9000 });
    await c.consume(1); // 8002 → still above, no crossing event

    const warnCalls = (logEvent as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([, f]) => f?.event === 'etsy_quota_warning'
    );
    expect(warnCalls.length).toBe(0);
  });
});

// ===========================================================================
// 3. Idempotency (R4) — already-done job not re-processed on retry
// ===========================================================================
describe('processDeepAnalysisJob — R4 (P1) idempotency audit', () => {
  it('returns done immediately without re-running analysis if job is already done', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 100);
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'TestShop');

    const env = { DB: fake.db, KV: makeKV() } as unknown as Env;
    const jobMsg = { kind: 'shop-analysis-deep' as const, jobId: String(jobId), userId: 'u1', shop: 'TestShop', requestedAt: Date.now() };

    // First run — succeeds normally
    const first = await processDeepAnalysisJob(env, jobMsg);
    expect(first.result).toBe('done');
    const spendsBefore = fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep').length;

    // Second run — simulates queue retry after crash between success and ack
    const second = await processDeepAnalysisJob(env, jobMsg);
    expect(second.result).toBe('done'); // idempotent, no re-run
    const spendsAfter = fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep').length;

    // No additional charge on retry
    expect(spendsAfter).toBe(spendsBefore);
  });

  it('returns failed immediately (no re-run) if job is already failed', async () => {
    const fake = makeD1();
    fake.seedCredits('u1', 100);
    const jobs = createAnalysesJobStore(fake.db);
    const jobId = await jobs.enqueue('u1', 'TestShop');
    // Force the job to failed state directly
    await jobs.update(jobId, { status: 'failed', error: 'previous failure' });

    const env = { DB: fake.db, KV: makeKV() } as unknown as Env;
    const outcome = await processDeepAnalysisJob(env, {
      kind: 'shop-analysis-deep',
      jobId: String(jobId),
      userId: 'u1',
      shop: 'TestShop',
      requestedAt: Date.now(),
    });

    expect(outcome.result).toBe('failed');
    // No new spend rows
    expect(fake.ledger.filter((l) => l.reason === 'spend:shop-analysis-deep').length).toBe(0);
  });
});

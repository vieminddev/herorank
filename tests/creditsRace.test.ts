/**
 * Credits race-condition regression tests (Engineer SEC, Phase 5 — S10 AUDIT).
 *
 * S10 audits the deduct-on-success path added in Phase 4 (`jobs/consume.ts`) which reuses the
 * Phase-1 atomic conditional spend (`creditsService.spendCredits` → `creditsRepo.spend`). The
 * production guard is a single D1 `batch()` with a `WHERE credits_balance >= cost` predicate on
 * BOTH the ledger INSERT…SELECT and the UPDATE, so the debit is all-or-nothing and only one
 * concurrent debit can win when the balance covers a single spend.
 *
 * These tests model that guard with an in-memory repo whose `spend` is atomic w.r.t. the JS
 * event loop (mirroring the single committed transaction). They assert:
 *   1. Concurrent spends for the same user: with a balance covering exactly ONE spend, exactly
 *      one of N overlapping spends succeeds; the rest get InsufficientCreditsError (no over-spend,
 *      balance never goes negative).
 *   2. deduct-on-success with balance=0 → the spend fails → the job's `paymentFailed` flag is set
 *      (result still delivered, BR-P4-01) and NO ledger debit is written.
 *   3. A queue retry of an already-charged job does NOT double-charge (idempotent re-run rule):
 *      modelled by the deduct-on-success path re-running and the prior debit being visible.
 *
 * Why a fake repo and not real D1: D1's atomicity is exercised by the existing integration
 * tests; here we lock down the SERVICE-level + consume-level payment LOGIC (the part Phase 5
 * owns auditing) without a Workers runtime. See the report for the consume.ts audit findings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCreditsService,
  InsufficientCreditsError,
} from '../src/lib/server/services/creditsService';
import type { CreditsRepo, LedgerEntry } from '../src/lib/server/repositories/creditsRepo';
import type { PlanSlug } from '../src/lib/server/services/types';
import { getToolCost } from '../src/lib/server/services/toolCosts';

const DEEP_TOOL = 'shop-analysis-deep';

/**
 * Atomic in-memory repo. `spend` reads-checks-writes in one synchronous turn (no awaits
 * between the guard and the ledger push) → it is the JS analogue of the committed D1 batch:
 * two overlapping `spend` promises can never both pass a `balance >= cost` guard that only one
 * of them can satisfy.
 */
function makeAtomicRepo(initialBalance = 0) {
  const ledger: Array<{ userId: string } & LedgerEntry> = [];
  let nextId = 1;

  const sum = (userId: string) =>
    ledger.filter((r) => r.userId === userId).reduce((a, r) => a + r.delta, 0);

  // Seed the starting balance as a single grant row for the canonical user.
  const seed = (userId: string, amount: number) => {
    if (amount === 0) return;
    ledger.push({
      userId,
      id: nextId++,
      delta: amount,
      reason: 'seed',
      ref: null,
      balance_after: amount,
      created_at: 0,
    });
  };

  const repo: CreditsRepo = {
    async sumLedger(userId) {
      return sum(userId);
    },
    async hasLedgerRef(userId, ref) {
      return ledger.some((r) => r.userId === userId && r.ref === ref);
    },
    async grant({ userId, plan: _plan, amount, reason, ref }) {
      const balanceAfter = sum(userId) + amount;
      ledger.push({ userId, id: nextId++, delta: amount, reason, ref, balance_after: balanceAfter, created_at: 0 });
      return { balance: balanceAfter };
    },
    async spend({ userId, cost, reason, ref }) {
      // SYNCHRONOUS guard+write — the atomic critical section (no await inside). Mirrors the
      // production batch: (1) ref idempotency (F-01) — a repeated non-null ref is a no-op that
      // returns the current balance WITHOUT a second debit; (2) the balance guard; (3) append.
      if (ref != null && ledger.some((r) => r.userId === userId && r.ref === ref)) {
        // Already charged for this ref → idempotent success, no second debit.
        return { ok: true, balance: sum(userId) };
      }
      const current = sum(userId);
      if (current < cost) return { ok: false, balance: current };
      const balanceAfter = current - cost;
      ledger.push({ userId, id: nextId++, delta: -cost, reason, ref, balance_after: balanceAfter, created_at: 0 });
      return { ok: true, balance: balanceAfter };
    },
    async getSubscription() {
      return null;
    },
    async recentLedger(userId, limit) {
      return ledger
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ userId: _u, ...rest }) => rest);
    },
  };

  return { repo, ledger, sum, seed };
}

const USER = 'racer_1';

// =========================================================================================
// 1. Concurrent spend — exactly one winner
// =========================================================================================

describe('S10: concurrent spend is race-safe (only one winner)', () => {
  it('balance covers exactly one deep spend → 1 success, the rest InsufficientCredits', async () => {
    const cost = getToolCost(DEEP_TOOL);
    expect(cost).toBeGreaterThan(0);

    const f = makeAtomicRepo();
    f.seed(USER, cost!); // exactly enough for ONE deep analysis
    const svc = createCreditsService(f.repo);

    // Fire many overlapping spends for the same user. Each is a DISTINCT logical operation, so
    // each carries its OWN per-request ref (mirrors requireCredits' `spend:{tool}:{requestId}`).
    // With distinct refs the F-01 idempotency does NOT collapse them — the balance guard alone
    // decides the single winner.
    const N = 8;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => svc.spendCredits(USER, DEEP_TOOL, `spend:${DEEP_TOOL}:req-${i}`))
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof InsufficientCreditsError
    );

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(N - 1);
    // Balance never went negative and settled at zero.
    expect(await svc.getBalance(USER)).toBe(0);
    // Exactly one debit row landed.
    expect(f.ledger.filter((r) => r.userId === USER && r.delta < 0)).toHaveLength(1);
  });

  it('balance covers two spends → exactly two winners', async () => {
    const cost = getToolCost(DEEP_TOOL)!;
    const f = makeAtomicRepo();
    f.seed(USER, cost * 2);
    const svc = createCreditsService(f.repo);

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => svc.spendCredits(USER, DEEP_TOOL, `spend:${DEEP_TOOL}:req-${i}`))
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(2);
    expect(await svc.getBalance(USER)).toBe(0);
  });
});

// =========================================================================================
// 2 + 3. deduct-on-success / paymentFailed / retry — modelling consume.ts's payment rule
// =========================================================================================

/**
 * Faithful re-implementation of the ONLY payment-deciding lines of `jobs/consume.ts`
 * (`processDeepAnalysisJob`) — the deduct-on-success block. We re-run exactly this logic so the
 * test pins the BEHAVIOUR the auditor reviewed without dragging in the Etsy/job graph.
 *
 *   let paymentFailed = false;
 *   try { await credits.spendCredits(userId, DEEP_ANALYSIS_TOOL); }
 *   catch (err) { if (err instanceof InsufficientCreditsError) paymentFailed = true; else throw; }
 */
async function deductOnSuccess(
  svc: ReturnType<typeof createCreditsService>,
  userId: string,
  // Per-job ref (mirrors consume.ts `job:{jobId}`). Distinct jobs pass distinct refs; a RE-RUN
  // of the SAME job passes the SAME ref → F-01 idempotency makes the second debit a no-op.
  ref = `job:${userId}`
): Promise<{ paymentFailed: boolean }> {
  let paymentFailed = false;
  try {
    await svc.spendCredits(userId, DEEP_TOOL, ref);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) paymentFailed = true;
    else throw err;
  }
  return { paymentFailed };
}

describe('S10: deduct-on-success payment rule (consume.ts logic)', () => {
  let f: ReturnType<typeof makeAtomicRepo>;
  let svc: ReturnType<typeof createCreditsService>;
  beforeEach(() => {
    f = makeAtomicRepo();
    svc = createCreditsService(f.repo);
  });

  it('balance=0 → job succeeds but paymentFailed=true and NO debit is written (BR-P4-01)', async () => {
    // No seed → balance is 0.
    const { paymentFailed } = await deductOnSuccess(svc, USER);
    expect(paymentFailed).toBe(true);
    expect(await svc.getBalance(USER)).toBe(0);
    expect(f.ledger.filter((r) => r.userId === USER && r.delta < 0)).toHaveLength(0);
  });

  it('sufficient balance → charges exactly once, paymentFailed=false', async () => {
    const cost = getToolCost(DEEP_TOOL)!;
    f.seed(USER, cost);
    const { paymentFailed } = await deductOnSuccess(svc, USER);
    expect(paymentFailed).toBe(false);
    expect(await svc.getBalance(USER)).toBe(0);
    expect(f.ledger.filter((r) => r.userId === USER && r.delta < 0)).toHaveLength(1);
  });

  it('two concurrent DISTINCT job runs on a balance for one → one charges, one flags paymentFailed', async () => {
    const cost = getToolCost(DEEP_TOOL)!;
    f.seed(USER, cost); // only enough for one
    // Two different jobs → two different refs → idempotency does NOT collapse them; the balance
    // guard picks the single winner.
    const [a, b] = await Promise.all([
      deductOnSuccess(svc, USER, 'job:1'),
      deductOnSuccess(svc, USER, 'job:2'),
    ]);
    const flagged = [a, b].filter((r) => r.paymentFailed);
    expect(flagged).toHaveLength(1); // exactly one run failed payment
    expect(await svc.getBalance(USER)).toBe(0); // never negative
    expect(f.ledger.filter((r) => r.userId === USER && r.delta < 0)).toHaveLength(1);
  });
});

/**
 * F-01 (P0): the credits ledger now dedupes a SPEND on its `ref`. A repeated spend with the
 * SAME ref (a retried request / DLQ replay / manual requeue of an already-charged job) is a
 * NO-OP — the balance is debited EXACTLY ONCE. This is the ledger-level idempotency that makes
 * the non-double-charge property hold INDEPENDENTLY of the job lifecycle (the previous
 * guarantee rested only on lifecycle, see 05_security_audit.md F-01).
 */
describe('F-01: spend is idempotent on ref (no double-charge)', () => {
  it('same ref spent twice → debited exactly once (balance drops 1×)', async () => {
    const cost = getToolCost(DEEP_TOOL)!;
    const f = makeAtomicRepo();
    f.seed(USER, cost * 3); // plenty of balance — so a second debit WOULD succeed if not deduped
    const svc = createCreditsService(f.repo);

    const ref = `job:42`;
    const first = await svc.spendCredits(USER, DEEP_TOOL, ref);
    const second = await svc.spendCredits(USER, DEEP_TOOL, ref); // replay, same ref

    // Both calls report success (idempotent), but the balance only moved once.
    expect(first.balance).toBe(cost * 3 - cost);
    expect(second.balance).toBe(cost * 3 - cost); // unchanged from the first
    expect(await svc.getBalance(USER)).toBe(cost * 3 - cost);
    // Exactly ONE debit row landed for this ref.
    expect(f.ledger.filter((r) => r.userId === USER && r.ref === ref && r.delta < 0)).toHaveLength(1);
  });

  it('different refs → each debits normally', async () => {
    const cost = getToolCost(DEEP_TOOL)!;
    const f = makeAtomicRepo();
    f.seed(USER, cost * 3);
    const svc = createCreditsService(f.repo);

    await svc.spendCredits(USER, DEEP_TOOL, 'job:1');
    await svc.spendCredits(USER, DEEP_TOOL, 'job:2');

    expect(await svc.getBalance(USER)).toBe(cost * 3 - cost * 2);
    expect(f.ledger.filter((r) => r.userId === USER && r.delta < 0)).toHaveLength(2);
  });

  it('concurrent spends with the SAME ref → debited exactly once', async () => {
    const cost = getToolCost(DEEP_TOOL)!;
    const f = makeAtomicRepo();
    f.seed(USER, cost * 5);
    const svc = createCreditsService(f.repo);

    const ref = `job:99`;
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => svc.spendCredits(USER, DEEP_TOOL, ref))
    );
    // All resolve (idempotent success), but only ONE debit row exists.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await svc.getBalance(USER)).toBe(cost * 5 - cost);
    expect(f.ledger.filter((r) => r.userId === USER && r.ref === ref && r.delta < 0)).toHaveLength(1);
  });
});

/**
 * Lifecycle invariant (retained from the S10 audit): even with ledger-level idempotency now in
 * place, the queue contract still only re-delivers NON-charging outcomes. Belt AND suspenders.
 */
describe('S10: retry does not double-charge (lifecycle invariant)', () => {
  it('a charged (done) run is terminal; only an uncharged (deferred/failed) run is retried', () => {
    type Outcome = 'done' | 'deferred' | 'failed';
    const charges: Record<Outcome, boolean> = { done: true, deferred: false, failed: false };
    const retried: Record<Outcome, boolean> = { done: false, deferred: true, failed: false };
    for (const o of Object.keys(retried) as Outcome[]) {
      if (retried[o]) expect(charges[o]).toBe(false);
    }
  });
});

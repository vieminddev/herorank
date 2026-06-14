/**
 * Unit tests for the credits service (Engineer C).
 *
 * The service is pure business logic with a `CreditsRepo` injected, so these tests run with
 * an in-memory fake repo — no D1, no Workers runtime. The fake mirrors the D1 contract that
 * matters for correctness:
 *   - balance is the ledger sum (BR-007),
 *   - `spend` is an atomic, race-safe conditional debit (BR-008/009),
 *   - grants are idempotent per `ref` (BR-010).
 *
 * Relative imports (not `$lib`) keep the tests independent of the SvelteKit alias resolver.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCreditsService,
  InsufficientCreditsError,
  UnknownToolError,
  PLAN_CREDITS,
} from '../src/lib/server/services/creditsService';
import type { CreditsRepo, LedgerEntry } from '../src/lib/server/repositories/creditsRepo';
import type { PlanSlug } from '../src/lib/server/services/types';

/**
 * In-memory fake repo. Ledger is the source of truth; `spend` enforces the same
 * `balance >= cost` guard the D1 conditional UPDATE does, atomically (single-threaded JS
 * mutation), so we can model concurrent spends by issuing overlapping promises.
 */
function makeFakeRepo() {
  const ledger: Array<{ userId: string } & LedgerEntry> = [];
  const plans = new Map<string, PlanSlug | 'free'>();
  let nextId = 1;

  const sum = (userId: string) =>
    ledger.filter((r) => r.userId === userId).reduce((acc, r) => acc + r.delta, 0);

  const repo: CreditsRepo = {
    async sumLedger(userId) {
      return sum(userId);
    },
    async hasLedgerRef(userId, ref) {
      return ledger.some((r) => r.userId === userId && r.ref === ref);
    },
    async grant({ userId, plan, amount, reason, ref }) {
      plans.set(userId, (plan === 'free' ? plans.get(userId) ?? plan : plan) as PlanSlug | 'free');
      const balanceAfter = sum(userId) + amount;
      ledger.push({
        userId,
        id: nextId++,
        delta: amount,
        reason,
        ref,
        balance_after: balanceAfter,
        created_at: Date.now(),
      });
      return { balance: balanceAfter };
    },
    async spend({ userId, cost, reason, ref }) {
      // Atomic guard mirroring the D1 conditional UPDATE: succeed only if balance >= cost.
      const current = sum(userId);
      if (current < cost) return { ok: false, balance: current };
      const balanceAfter = current - cost;
      ledger.push({
        userId,
        id: nextId++,
        delta: -cost,
        reason,
        ref,
        balance_after: balanceAfter,
        created_at: Date.now(),
      });
      return { ok: true, balance: balanceAfter };
    },
    async getSubscription(userId) {
      if (!plans.has(userId)) return null;
      return {
        plan: plans.get(userId)!,
        status: 'active',
        period: null,
        credits_balance: sum(userId),
      };
    },
    async recentLedger(userId, limit) {
      return ledger
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ userId: _u, ...rest }) => rest);
    },
  };

  return { repo, ledger };
}

const USER = 'user_1';

describe('creditsService.grantPlanCredits', () => {
  let svc: ReturnType<typeof createCreditsService>;
  let ledger: ReturnType<typeof makeFakeRepo>['ledger'];

  beforeEach(() => {
    const f = makeFakeRepo();
    svc = createCreditsService(f.repo);
    ledger = f.ledger;
  });

  it('grants the free plan allotment at signup (BR-002 = 30)', async () => {
    const { balance } = await svc.grantPlanCredits(USER, 'free');
    expect(balance).toBe(PLAN_CREDITS.free);
    expect(balance).toBe(30);
    expect(await svc.getBalance(USER)).toBe(30);
  });

  it('grants each paid plan its PM-chosen monthly amount (BR-003)', async () => {
    const cases: Array<[PlanSlug, number]> = [
      ['side', 750],
      ['business', 3000],
      ['enterprise', 9000],
    ];
    for (const [plan, expected] of cases) {
      const f = makeFakeRepo();
      const s = createCreditsService(f.repo);
      const { balance } = await s.grantPlanCredits(`u_${plan}`, plan);
      expect(balance).toBe(expected);
      expect(PLAN_CREDITS[plan]).toBe(expected);
    }
  });

  it('writes exactly one ledger row per grant with a positive delta + reason (BR-006)', async () => {
    await svc.grantPlanCredits(USER, 'free');
    const rows = ledger.filter((r) => r.userId === USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(30);
    expect(rows[0].reason).toBe('grant:signup');
    expect(rows[0].balance_after).toBe(30);
  });

  it('is idempotent per ref — the same Stripe event grants once (BR-010)', async () => {
    const ref = 'evt_123';
    const first = await svc.grantPlanCredits(USER, 'business', ref);
    const second = await svc.grantPlanCredits(USER, 'business', ref);
    expect(first.balance).toBe(3000);
    expect(second.balance).toBe(3000); // unchanged
    expect(ledger.filter((r) => r.userId === USER)).toHaveLength(1);
  });

  it('stacks grants without a ref (e.g. multiple billing cycles)', async () => {
    await svc.grantPlanCredits(USER, 'business', 'evt_a');
    await svc.grantPlanCredits(USER, 'business', 'evt_b');
    expect(await svc.getBalance(USER)).toBe(6000);
  });
});

describe('creditsService.spendCredits', () => {
  let svc: ReturnType<typeof createCreditsService>;
  let ledger: ReturnType<typeof makeFakeRepo>['ledger'];

  beforeEach(async () => {
    const f = makeFakeRepo();
    svc = createCreditsService(f.repo);
    ledger = f.ledger;
    await svc.grantPlanCredits(USER, 'free'); // 30 credits
  });

  it('spends a tool cost when balance is sufficient + writes a negative ledger row', async () => {
    const { balance } = await svc.spendCredits(USER, 'echo'); // echo = 1
    expect(balance).toBe(29);
    const spendRow = ledger.find((r) => r.userId === USER && r.delta < 0)!;
    expect(spendRow.delta).toBe(-1);
    expect(spendRow.reason).toBe('spend:echo');
    expect(spendRow.ref).toBe('echo');
    expect(spendRow.balance_after).toBe(29);
  });

  it('throws INSUFFICIENT_CREDITS and does NOT change balance when balance < cost (BR-005)', async () => {
    // Drain the 30 credits.
    for (let i = 0; i < 30; i++) await svc.spendCredits(USER, 'echo');
    expect(await svc.getBalance(USER)).toBe(0);

    await expect(svc.spendCredits(USER, 'echo')).rejects.toBeInstanceOf(InsufficientCreditsError);
    // Balance untouched (no extra ledger row written).
    expect(await svc.getBalance(USER)).toBe(0);
    expect(ledger.filter((r) => r.userId === USER && r.delta < 0)).toHaveLength(30);
  });

  it('rejects an unpriced tool rather than charging a default', async () => {
    await expect(svc.spendCredits(USER, 'does-not-exist')).rejects.toBeInstanceOf(UnknownToolError);
    expect(await svc.getBalance(USER)).toBe(30); // unchanged
  });

  it('race: N concurrent spends on a balance that only covers M succeed exactly M times (BR-009)', async () => {
    // Reset to a tiny balance so the race window is observable: grant a user 1 credit.
    const f = makeFakeRepo();
    const s = createCreditsService(f.repo);
    await s.grantPlanCredits('racer', 'free'); // 30
    // Spend down to exactly 1 remaining.
    for (let i = 0; i < 29; i++) await s.spendCredits('racer', 'echo');
    expect(await s.getBalance('racer')).toBe(1);

    // Fire two spends "concurrently" — only one may succeed (cost 1, balance 1).
    const results = await Promise.allSettled([
      s.spendCredits('racer', 'echo'),
      s.spendCredits('racer', 'echo'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientCreditsError);
    expect(await s.getBalance('racer')).toBe(0);
  });
});

describe('balance invariant (BR-007)', () => {
  it('getBalance always equals SUM(ledger.delta) across a sequence of ops', async () => {
    const f = makeFakeRepo();
    const svc = createCreditsService(f.repo);

    await svc.grantPlanCredits(USER, 'free'); // +30
    await svc.spendCredits(USER, 'echo'); // -1
    await svc.spendCredits(USER, 'echo'); // -1
    await svc.grantPlanCredits(USER, 'side', 'cycle_1'); // +750

    const expected = f.ledger
      .filter((r) => r.userId === USER)
      .reduce((acc, r) => acc + r.delta, 0);
    expect(await svc.getBalance(USER)).toBe(expected);
    expect(expected).toBe(30 - 1 - 1 + 750);
  });
});

/**
 * Credits service (Engineer C) — business logic for the credits system.
 *
 * Pure TS, no Hono/D1 dependency — takes a `CreditsRepo` via DI (factory pattern).
 * Tested hermetically in `credits.test.ts` with an in-memory fake repo.
 *
 * Key invariants:
 *   BR-007: balance = SUM(ledger.delta) — always derived, never cached.
 *   BR-008/009: spend is atomic + race-safe (repo.spend conditional guard).
 *   BR-010: grants are idempotent per ref (repo.hasLedgerRef check).
 *   F-01: spend is idempotent per ref (repo.spend ON CONFLICT).
 */
import type { CreditsRepo } from '../repositories/creditsRepo';
import type { PlanSlug } from './types';
import { PLAN_CREDITS } from './planConfig';
import { getToolCost } from './toolCosts';

// Re-export PLAN_CREDITS so tests can import from this module.
export { PLAN_CREDITS };

/** Thrown when a spend fails due to insufficient balance. */
export class InsufficientCreditsError extends Error {
  public readonly balance: number;
  constructor(balance: number) {
    super(`Insufficient credits: balance=${balance}`);
    this.name = 'InsufficientCreditsError';
    this.balance = balance;
  }
}

/** Thrown when a spend is attempted for an unpriced tool. */
export class UnknownToolError extends Error {
  constructor(tool: string) {
    super(`Unknown tool: ${tool}`);
    this.name = 'UnknownToolError';
  }
}

export interface CreditsService {
  getBalance(userId: string): Promise<number>;
  grantPlanCredits(userId: string, plan: PlanSlug, ref?: string): Promise<{ balance: number }>;
  spendCredits(userId: string, tool: string, ref?: string): Promise<{ balance: number }>;
}

/**
 * Factory — inject a CreditsRepo to get a CreditsService.
 */
export function createCreditsService(repo: CreditsRepo): CreditsService {
  return {
    /** Authoritative balance = SUM(ledger.delta) (BR-007). */
    async getBalance(userId) {
      return repo.sumLedger(userId);
    },

    /**
     * Grant credits for a plan cycle. Idempotent per `ref` (BR-010):
     * if the ref has already been used, returns the current balance without granting again.
     */
    async grantPlanCredits(userId, plan, ref) {
      const amount = PLAN_CREDITS[plan];

      // Idempotency guard: if this ref was already used, return current balance.
      if (ref) {
        const exists = await repo.hasLedgerRef(userId, ref);
        if (exists) {
          const balance = await repo.sumLedger(userId);
          return { balance };
        }
      }

      const reason = plan === 'free' ? 'grant:signup' : `grant:${plan}`;
      return repo.grant({
        userId,
        plan,
        amount,
        reason,
        ref: ref ?? null,
      });
    },

    /**
     * Spend credits for a tool invocation. Atomic + race-safe (BR-008/009).
     * Throws InsufficientCreditsError if balance < cost.
     * Throws UnknownToolError if the tool is not priced.
     */
    async spendCredits(userId, tool, ref) {
      const cost = getToolCost(tool);
      if (cost === undefined) {
        throw new UnknownToolError(tool);
      }

      const reason = `spend:${tool}`;
      const spendRef = ref ?? tool;

      const result = await repo.spend({ userId, cost, reason, ref: spendRef });
      if (!result.ok) {
        throw new InsufficientCreditsError(result.balance);
      }
      return { balance: result.balance };
    },
  };
}

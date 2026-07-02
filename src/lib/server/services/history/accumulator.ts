/**
 * History accumulator — the background worker that VACUUMS up Etsy's free quota to build deep history
 * fast while there are no users competing for it. Runs every 30 min (48×/day); each tick backfills a
 * bounded chunk of shop review-cadence so the heavy pagination spreads across the day (each tick is
 * small → no cron wall-clock risk), tagged by category to fuel category-level seasonality.
 *
 * Two ceilings keep it ToS-safe and predictable:
 *   1. SOFT daily target (default 12k) — before each tick it reads the day's total logical Etsy calls
 *      (SUM etsy_key_usage) and only spends up to `min(perTickCalls, target - usedToday)`. So daily
 *      usage converges to the target and never blows past it, even with the knobs cranked.
 *   2. HARD per-key cap — the keyPool refuses a key past its daily cap (≈4500) and rotates; when all
 *      keys are exhausted it throws QuotaExceededError, which we catch and stop. So we PHYSICALLY
 *      cannot exceed Etsy's per-key limit regardless of the soft target.
 *
 * The orchestration is small; the quota math is injected (`usedToday`) so it's unit-testable.
 */
import type { EtsyClient } from '../etsy/types';
import type { SeriesRepo } from '../../repositories/seriesRepo';
import { backfillShopReviews } from './reviewBackfill';
import { QuotaExceededError } from '../etsy/client';

export interface AccumulatorDeps {
  client: Pick<EtsyClient, 'getReviewsByShop'>;
  series: SeriesRepo;
  /** Today's total logical Etsy calls so far (SUM of etsy_key_usage for the UTC day). */
  usedToday: () => Promise<number>;
}

export interface AccumulatorOptions {
  /** Soft daily ceiling on total logical Etsy calls. Default 12000 (pool hard cap ≈ 13500). */
  dailyTarget?: number;
  /** Max calls this single tick may add. Default 250 (~17s at the pool's aggregate RPS). */
  perTickCalls?: number;
  /** Max review pages per shop. Default 15 (~1500 reviews → years of cadence for most shops). */
  maxPagesPerShop?: number;
  /** Hard cap on shops fetched from the queue per tick (safety). Default 40. */
  maxShopsPerTick?: number;
}

export interface AccumulatorResult {
  usedBefore: number;
  budget: number;
  shopsBackfilled: number;
  callsSpent: number;
  /** True when the work-queue (shops needing backfill) is empty — nothing left to do this round. */
  queueEmpty: boolean;
  /** True when the pool reported all keys exhausted mid-tick (real out-of-quota). */
  quotaHit: boolean;
}

export async function runHistoryAccumulator(
  deps: AccumulatorDeps,
  opts: AccumulatorOptions = {}
): Promise<AccumulatorResult> {
  const dailyTarget = Math.max(0, Math.floor(opts.dailyTarget ?? 12_000));
  const perTickCalls = Math.max(0, Math.floor(opts.perTickCalls ?? 250));
  const maxPagesPerShop = Math.max(1, Math.floor(opts.maxPagesPerShop ?? 15));
  const maxShopsPerTick = Math.max(1, Math.floor(opts.maxShopsPerTick ?? 40));

  const usedBefore = await deps.usedToday();
  const budget = Math.min(perTickCalls, Math.max(0, dailyTarget - usedBefore));
  if (budget <= 0) {
    return { usedBefore, budget: 0, shopsBackfilled: 0, callsSpent: 0, queueEmpty: false, quotaHit: false };
  }

  // Fetch enough candidate shops to plausibly fill the budget (each spends ≥1, ≤maxPagesPerShop calls).
  // Assume ~3 pages/shop average when sizing the fetch; capped by maxShopsPerTick.
  const want = Math.min(maxShopsPerTick, Math.max(1, Math.ceil(budget / 3)));
  const shops = await deps.series.shopsMissingReviewBackfill(want);
  if (shops.length === 0) {
    return { usedBefore, budget, shopsBackfilled: 0, callsSpent: 0, queueEmpty: true, quotaHit: false };
  }

  let callsSpent = 0;
  let shopsBackfilled = 0;
  let quotaHit = false;
  for (const s of shops) {
    if (callsSpent >= budget) break;
    try {
      const r = await backfillShopReviews(
        { client: deps.client, series: deps.series },
        s.shopId,
        { categoryId: s.categoryId, maxPages: maxPagesPerShop }
      );
      callsSpent += r.pagesFetched;
      if (!r.skipped) shopsBackfilled++;
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        quotaHit = true;
        break; // all keys exhausted — stop; the next tick resumes (idempotent skips are free)
      }
      // Non-quota error on one shop → skip it, keep going (next round retries).
    }
  }

  return { usedBefore, budget, shopsBackfilled, callsSpent, queueEmpty: shops.length < want, quotaHit };
}

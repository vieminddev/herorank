/**
 * Queue consumer — processes deep shop analysis jobs (Engineer F).
 *
 * `processDeepAnalysisJob` is called by the queue consumer (queue.ts) for each message.
 * Deduct-on-SUCCESS rule (BR-P4-01): only charges credits after a successful analysis.
 *
 * Also exported as `DEEP_ANALYSIS_TOOL` for the route's pre-check.
 */
import type { Env } from '../env';
import type { DeepShopAnalysisJob } from './types';
import { getEtsyClient } from '../services/etsy/provider';
import { createEtsyCache } from '../services/etsy/cache';
import { createUsageCounter } from '../services/etsy/usageCounter';
import { etsyLimitsFromEnv } from '../services/etsy/limits';
import { runDeepShopAnalysis, ShopNotFoundError, DeepAnalysisQuotaError } from '../services/jobs/deepShopAnalysis';
import { createAnalysesJobStore } from '../services/jobs/analysesJobStore';
import { createCreditsRepo } from '../repositories/creditsRepo';
import { createCreditsService } from '../services/creditsService';
import { getToolCost } from '../services/toolCosts';

export const DEEP_ANALYSIS_TOOL = 'shop-analysis-deep';

export interface ProcessResult {
  result: 'done' | 'failed' | 'deferred';
  error?: string;
}

export async function processDeepAnalysisJob(
  env: Env,
  job: DeepShopAnalysisJob
): Promise<ProcessResult> {
  const db = env.DB;
  const kv = env.KV;
  const jobs = createAnalysesJobStore(db);
  const limits = etsyLimitsFromEnv(env);
  const client = getEtsyClient(env);
  const cache = createEtsyCache(kv);
  const usage = createUsageCounter(db, { cap: limits.dailyCap, hardLimit: limits.rpd });
  const jobId = parseInt(job.jobId, 10);

  try {
    // Idempotency (R4): a queue retry of an already-terminal job must NOT re-run the analysis or
    // re-charge. 'done' and 'failed' are terminal → return their outcome immediately. 'deferred',
    // 'queued', and 'running' fall through and (re)run — deferred jobs are meant to be retried, and
    // a crash mid-'running' should resume. The spend ref is per-job idempotent regardless (belt-
    // and-braces against double-charge); skipping the re-run also avoids wasted Etsy calls. Kept
    // inside the try so a status-read failure marks the job failed instead of leaving it stuck.
    const existing = await jobs.getById(jobId);
    if (existing?.status === 'done') return { result: 'done' };
    if (existing?.status === 'failed') return { result: 'failed', error: existing.error };

    // maxPages 10 → up to 1000 listings + 1000 reviews (covers virtually every shop). Each page is
    // one sequential Etsy call; the queue consumer has ample wall-clock vs. the request path that
    // forces the quick analyzer's ~100-item cap. db passed so calibration factors load (BR-P4-CAL-01).
    const result = await runDeepShopAnalysis(
      { client, cache, usage, db, maxPages: 10 },
      job.shop
    );

    // Write result to analyses row — done with result.
    await jobs.update(jobId, { status: 'done', result });

    // Deduct credits on SUCCESS only (BR-P4-01).
    const cost = getToolCost(DEEP_ANALYSIS_TOOL);
    if (cost) {
      const credits = createCreditsService(createCreditsRepo(db));
      const spendRef = `spend:${DEEP_ANALYSIS_TOOL}:job:${job.jobId}`;
      try {
        await credits.spendCredits(job.userId, DEEP_ANALYSIS_TOOL, spendRef);
      } catch {
        // Insufficient credits post-analysis — mark payment failed but keep result.
        await jobs.update(jobId, { status: 'done', paymentFailed: true });
      }
    }

    return { result: 'done' };
  } catch (err) {
    if (err instanceof DeepAnalysisQuotaError) {
      // Quota exhausted mid-job → defer (queue retry will pick it up).
      await jobs.update(jobId, { status: 'deferred', error: 'quota_exhausted' });
      return { result: 'deferred', error: 'quota_exhausted' };
    }
    if (err instanceof ShopNotFoundError) {
      await jobs.update(jobId, { status: 'failed', error: 'Shop not found' });
      return { result: 'failed', error: 'shop_not_found' };
    }
    // Unknown error → mark failed.
    const message = err instanceof Error ? err.message : 'Unknown error';
    await jobs.update(jobId, { status: 'failed', error: message });
    return { result: 'failed', error: message };
  }
}

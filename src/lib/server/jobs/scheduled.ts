/**
 * Cron handler (Engineer A + F) — dispatches scheduled triggers by cron expression.
 *
 * Called by `worker.ts` for each Cron Trigger. Branches on `event.cron` to the correct
 * job handler. Errors are caught per-branch so one failing job doesn't block others.
 *
 * Cron schedule (wrangler.jsonc):
 *   every 30 min    → rank-track sweep
 *   "0 4 * * 0"     → weekly OAuth calibration job
 */
import type { Env } from '../env';
import { getEtsyClient } from '../services/etsy/provider';
import { createEtsyCache } from '../services/etsy/cache';
import { createUsageCounter, DEFAULT_ETSY_DAILY_CAP } from '../services/etsy/usageCounter';
import { createTrackedListingsStore, createRankHistoryStore } from '../services/jobs/jobsStore';
import { runRankTrack } from '../services/jobs/rankTrack';

export async function handleScheduled(
  event: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const db = env.DB;
  const kv = env.KV;

  switch (event.cron) {
    // --- Every 30 min: rank-track sweep ---
    case '*/30 * * * *': {
      try {
        const client = getEtsyClient(env);
        const cache = createEtsyCache(kv);
        const cronCap = parseInt(String(env.ETSY_CRON_CAP ?? '2000'), 10);
        const dailyCap = parseInt(String(env.ETSY_DAILY_CAP ?? String(DEFAULT_ETSY_DAILY_CAP)), 10);
        const usage = createUsageCounter(db, { cap: dailyCap, subCap: cronCap });
        const tracked = createTrackedListingsStore(db);
        const rankHistory = createRankHistoryStore(db);

        const result = await runRankTrack({ client, cache, usage, tracked, rankHistory });
        console.log(
          `[cron] rank-track: processed=${result.processed} deferred=${result.deferred} cacheHits=${result.cacheHits} quotaHit=${result.quotaHit}`
        );
      } catch (err) {
        console.error('[cron] rank-track failed:', err);
      }
      break;
    }

    // --- Weekly Sunday 4 AM: OAuth calibration ---
    case '0 4 * * 0': {
      try {
        console.log('[cron] calibration job — stub (Phase 4 follow-up)');
      } catch (err) {
        console.error('[cron] calibration job failed:', err);
      }
      break;
    }

    default:
      // Unmapped cron expression — no-op.
      break;
  }
}

/**
 * Cron handler (Engineer A + F) — dispatches scheduled triggers by cron expression.
 *
 * Called by `worker.ts` for each Cron Trigger. Branches on `event.cron` to the correct
 * job handler. Errors are caught per-branch so one failing job doesn't block others.
 *
 * Cron schedule (wrangler.jsonc):
 *   every 30 min    → rank-track sweep + history accumulator
 *   "30 0 * * *"    → research half A: taxonomy + trends + retention prune  (00:30 UTC)
 *   "45 0 * * *"    → research half B: best-sellers + calibration           (00:45 UTC)
 *
 * Dispatch rule: the every-30-min sweep is matched explicitly; "45 0 * * *" runs the best-sellers
 * half; ANY OTHER cron (the daily "30 0 * * *", legacy forms, or an ad-hoc one-off trigger)
 * runs the trends half. Splitting keeps each invocation well under the per-invocation wall-clock
 * limit — the combined sweep over the ~356-keyword seed set took ~9-10 min.
 */
import { type Env } from '../env';
import { getEtsyClient, hasEtsyKey } from '../services/etsy/provider';
import { createEtsyCache, createKeywordHistory } from '../services/etsy/cache';
import { createShopPulse } from '../services/etsy/shopPulse';
import { createSeriesRepo } from '../repositories/seriesRepo';
import { historyDbFromEnv } from '../api/context';
import { pruneTimeSeries, pruneMetricSeries, pruneAnalyses } from '../services/etsy/retention';
import { createUsageCounter, utcDay } from '../services/etsy/usageCounter';
import { runHistoryAccumulator } from '../services/history/accumulator';
import { etsyLimitsFromEnv } from '../services/etsy/limits';
import { createTrackedListingsStore, createRankHistoryStore } from '../services/jobs/jobsStore';
import { runRankTrack } from '../services/jobs/rankTrack';
import { refreshTrends, refreshBestSellers, refreshTaxonomy } from '../services/etsy/refresh';
import { recordCronRun, cronWatchdog } from '../services/observability/store';

export async function handleScheduled(
  event: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const db = env.DB;
  const historyDb = historyDbFromEnv(env); // vierank-history: all time-series tables live here now
  const kv = env.KV;

  // --- Every 30 min: rank-track sweep ---
  if (event.cron === '*/30 * * * *') {
    try {
      const client = getEtsyClient(env);
      const cache = createEtsyCache(kv);
      const limits = etsyLimitsFromEnv(env);
      const usage = createUsageCounter(db, {
        cap: limits.dailyCap,
        subCap: limits.cronCap,
        hardLimit: limits.rpd,
      });
      const tracked = createTrackedListingsStore(db); // tracked_listings config stays in OLTP
      const rankHistory = createRankHistoryStore(historyDb); // rank_history now in vierank-history

      const result = await runRankTrack({ client, cache, usage, tracked, rankHistory });
      const detail = `processed=${result.processed} deferred=${result.deferred} cacheHits=${result.cacheHits} quotaHit=${result.quotaHit}`;
      console.log(`[cron] rank-track: ${detail}`);
      await recordCronRun(env, 'rank-track', true, detail);
    } catch (err) {
      console.error('[cron] rank-track failed:', err);
      await recordCronRun(env, 'rank-track', false, err instanceof Error ? err.message : String(err));
    }

    // Background history accumulator: spread deep review-backfill across all 48 daily ticks, bounded
    // by a soft daily quota target (the keyPool is the hard per-key ceiling). Fills history fast while
    // there are no users competing for the quota; naturally idles when the backfill queue is empty.
    if (hasEtsyKey(env)) {
      try {
        const series = createSeriesRepo(historyDb);
        const usedToday = async () => {
          const row = await db
            .prepare('SELECT COALESCE(SUM(count), 0) AS c FROM etsy_key_usage WHERE day = ?')
            .bind(utcDay())
            .first<{ c: number }>();
          return row?.c ?? 0;
        };
        const acc = await runHistoryAccumulator(
          { client: getEtsyClient(env), series, usedToday },
          {
            dailyTarget: Math.max(0, Math.floor(Number(env.HISTORY_DAILY_TARGET)) || 12_000),
            perTickCalls: Math.max(0, Math.floor(Number(env.HISTORY_ACCUM_PER_TICK)) || 250),
            maxShopsPerTick: Math.max(1, Math.floor(Number(env.HISTORY_ACCUM_SHOPS_PER_TICK)) || 40),
          }
        );
        console.log(
          `[cron] history-accum: used=${acc.usedBefore} budget=${acc.budget} ` +
            `shops=${acc.shopsBackfilled} calls=${acc.callsSpent} queueEmpty=${acc.queueEmpty} quotaHit=${acc.quotaHit}`
        );
      } catch (err) {
        console.error('[cron] history-accum failed:', err);
      }
    }

    // The frequent trigger doubles as the watchdog for the once-a-day jobs (trends / best-sellers).
    await cronWatchdog(env).catch(() => {});
    return;
  }

  // --- Daily research refresh, SPLIT across two LIGHT invocations so neither approaches the
  //     per-invocation wall-clock limit (the combined sweep over ~356 seeds ran ~9-10 min):
  //       "30 0 * * *"  (+ any ad-hoc one-off) → taxonomy + trends + retention prune   (half A)
  //       "45 0 * * *"                         → best-sellers + calibration            (half B)
  //     Each half hits Etsy via the shared key POOL (getEtsyClient) — the SAME path rank-track uses;
  //     the legacy single-key path (etsyApiKey = ETSY_OAUTH_CLIENT_ID) was rejected by Etsy
  //     ("EtsyConfigError"). Per-key usage is tracked in etsy_key_usage (no global double-accounting).
  const bestSellersHalf = event.cron === '45 0 * * *';
  const researchJob = bestSellersHalf ? 'best-sellers' : 'trends';

  try {
    if (!hasEtsyKey(env)) {
      console.log('[cron] research refresh skipped — no Etsy keystring configured');
    } else {
      // Fan the sweep across the key pool (bounded). Default 8; physical RPS stays gated per-key.
      const concurrency = Math.max(1, Math.floor(Number(env.ETSY_REFRESH_CONCURRENCY)) || 8);
      // Per-run review-backfill budget: how many NEW shops get their full review history paginated
      // this best-sellers run. Small so the heavy pagination spreads across days within the quota;
      // env-tunable. Idempotent skips of already-backfilled shops don't count against it.
      const backfillBudget = { remaining: Math.max(0, Math.floor(Number(env.HISTORY_BACKFILL_PER_RUN)) || 8) };
      const deps = {
        client: getEtsyClient(env),
        cache: createEtsyCache(kv),
        history: createKeywordHistory(historyDb), // keywords_cache now in vierank-history
        shopPulse: createShopPulse(historyDb), // shop_pulse now in vierank-history
        series: createSeriesRepo(historyDb),
        backfillBudget,
        shopsPerCategory: Math.max(1, Math.floor(Number(env.BESTSELLERS_SHOPS_PER_CAT)) || 20),
        leadKeywords: Math.max(1, Math.floor(Number(env.BESTSELLERS_LEADS)) || 3),
        db, // OLTP — still used for public review-rate calibration upserts (calibration_factors)
        concurrency,
      };
      if (bestSellersHalf) {
        const best = await refreshBestSellers(deps);
        const detail = `processed=${best.processed} deferred=${best.deferred} quotaHit=${best.quotaHit} backfillLeft=${backfillBudget.remaining}`;
        console.log(`[cron] research B (best-sellers): ${detail}`);
        await recordCronRun(env, 'best-sellers', true, detail);
      } else {
        await refreshTaxonomy(deps).catch((e) => console.error('[cron] taxonomy refresh failed:', e));
        const trends = await refreshTrends(deps);
        const detail = `processed=${trends.processed} deferred=${trends.deferred} quotaHit=${trends.quotaHit}`;
        console.log(`[cron] research A (trends): ${detail}`);
        await recordCronRun(env, 'trends', true, detail);
      }
    }
  } catch (err) {
    console.error('[cron] research refresh failed:', err);
    await recordCronRun(env, researchJob, false, err instanceof Error ? err.message : String(err));
  }

  // Time-series retention + R2 cold archive (cheap cleanup) — runs on the trends half (A) only, so
  // the best-sellers invocation stays lean. Runs regardless of Etsy key.
  if (!bestSellersHalf) {
    try {
      // Market time-series tables live in vierank-history now; analyses stays in OLTP.
      const pruned = await pruneTimeSeries(historyDb, Date.now(), env.ARCHIVE);
      const an = await pruneAnalyses(db, Date.now(), env.ARCHIVE);
      console.log(
        `[cron] retention prune: keywords=${pruned.keywords} shop_pulse=${pruned.shopPulse} ` +
          `rank_history=${pruned.rankHistory} analyses=${an.analyses} archived=${pruned.archived + an.archived}`
      );
    } catch (err) {
      console.error('[cron] retention prune failed:', err);
    }
    try {
      const ms = await pruneMetricSeries(historyDb, Date.now(), env.ARCHIVE);
      console.log(
        `[cron] metric_series prune: day=${ms.day} week=${ms.week} month=${ms.month} archived=${ms.archived}`
      );
    } catch (err) {
      console.error('[cron] metric_series prune failed:', err);
    }
  }

  // OAuth calibration (stub — Phase 4 follow-up) — on the best-sellers half (B).
  if (bestSellersHalf) {
    console.log('[cron] calibration job — stub (Phase 4 follow-up)');
  }
}

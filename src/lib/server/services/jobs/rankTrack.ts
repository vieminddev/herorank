/**
 * Cron rank-track sweep (Engineer F owns) — §1.3, BR-P4-CRON-01.
 *
 * Invoked by `handleScheduled` on the every-30-min trigger. Re-checks tracked_listings that
 * are "due" (last_checked_at older than 24h, or never checked), at most 1×/day per listing so
 * load spreads smoothly across the day (no thundering herd). For each due listing:
 *   1. Cache-first: reuse Phase 3's rank cache key (etsy:v1:rank:{listing}:{kw}). A FRESH hit
 *      yields the ordered listing ids with 0 Etsy calls (BR-P3-03 principle).
 *   2. On a miss, consume 1 from the SHARED usageCounter built with the CRON sub-cap
 *      (env.ETSY_CRON_CAP). When the counter throws QuotaExceededError, STOP — the remaining
 *      due listings defer to the next 30-min trigger (resumable, idempotent).
 *   3. rankEstimate (Engineer G, behind getEstimation) → write a GLOBAL rank_history row +
 *      stamp tracked_listings.last_checked_at/last_rank (the 24h idempotency guard).
 *
 * Pure-ish: all I/O comes through injected deps so it is unit-testable with fakes (no D1/KV/
 * network). `runRankTrack(deps)` is what the scheduled handler calls.
 */
import type { EtsyClient } from '../etsy/types';
import type { EtsyCache } from '../etsy/cache';
import type { UsageCounter } from '../etsy/types';
import type { TrackedListingsStore, RankHistoryStore } from './jobsStore';
import { cacheKeys, TTL } from '../etsy/cache';
import { QuotaExceededError } from '../etsy/client';
import { getEstimation } from '../etsy/estimationContract';

/** 24h: each listing is re-checked at most once per day. */
export const RANK_TRACK_STALE_SEC = 24 * 3_600;
/** Max listings touched per 30-min run — keeps each run tiny and within QPS. */
export const RANK_TRACK_BATCH = 50;

export interface RankTrackDeps {
  client: EtsyClient;
  cache: EtsyCache;
  usage: UsageCounter;
  tracked: TrackedListingsStore;
  rankHistory: RankHistoryStore;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Batch size override (tests). */
  batch?: number;
}

export interface RankTrackResult {
  processed: number;
  /** Remaining due listings not processed because the cron cap was hit. */
  deferred: number;
  quotaHit: boolean;
  cacheHits: number;
}

/** Cached shape for a rank lookup: the ordered listing ids from the last live search. */
interface RankCachePayload {
  ordered: number[];
}

export async function runRankTrack(deps: RankTrackDeps): Promise<RankTrackResult> {
  const now = deps.now ?? (() => Date.now());
  const batch = deps.batch ?? RANK_TRACK_BATCH;
  const est = await getEstimation();

  const due = await deps.tracked.due(RANK_TRACK_STALE_SEC, batch, now());
  let processed = 0;
  let cacheHits = 0;
  let quotaHit = false;

  for (let i = 0; i < due.length; i++) {
    const row = due[i];
    const key = cacheKeys.rank(row.listing_id, row.keyword);

    try {
      // 1. Cache-first — a fresh entry means 0 Etsy calls (shared with the on-demand rank-check).
      let ordered: number[] | null = null;
      const cached = await deps.cache.get<RankCachePayload>(key, now());
      if (cached?.fresh && Array.isArray(cached.payload.ordered)) {
        ordered = cached.payload.ordered;
        cacheHits++;
      }

      // 2. Miss → consume quota (cron sub-cap) then hit Etsy. Quota exhaustion defers the rest.
      if (ordered === null) {
        await deps.usage.consume(1);
        const page = await deps.client.findActiveListings({
          keywords: row.keyword,
          sortOn: 'score',
          sortOrder: 'desc',
          limit: 100,
        });
        ordered = (page.results ?? []).map((l) => l.listing_id);
        await deps.cache.put(key, { ordered } satisfies RankCachePayload, TTL.rank, { now: now() });
      }

      // 3. Estimate rank → global history + idempotency stamp.
      const { position } = est.rankEstimate({
        orderedListingIds: ordered,
        targetListingId: row.listing_id,
      });
      await deps.rankHistory.insert(row.listing_id, row.keyword, position, now());
      await deps.tracked.markChecked(row.id, position, now());
      processed++;
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        // Stop the sweep — remaining due listings (including this one) resume next trigger.
        quotaHit = true;
        return { processed, deferred: due.length - i, quotaHit, cacheHits };
      }
      // Non-quota error on one listing → skip it (it stays "due", retried next run); keep going.
    }
  }

  return { processed, deferred: 0, quotaHit, cacheHits };
}

/**
 * Etsy provider seam (Engineer F owns, spec §1.6) — "plug the key into env and it runs".
 *
 * Mirrors Phase 1's `services/provider.ts` pattern. With NO `env.ETSY_API_KEY` → the mock
 * client (dev/test path TODAY). With a key → the real client wired to a D1-backed usage
 * counter. No route code changes when the key arrives.
 *
 * Also exposes `getEtsyContext(env)` which bundles the client + cache + keyword-history +
 * usage counter the route needs, so `etsy-tools.ts` constructs them in one call.
 */
import { etsyApiKey, etsyApiKeys, etsyOAuthApiKey, type Env } from '../../env';
import type { EtsyClient } from './types';
import { createEtsyClient, EtsyError } from './client';
import { createMockEtsyClient, defaultFixtures } from './mock';
import { createUsageCounter } from './usageCounter';
import { createEtsyKeyPool } from './keyPool';
import { etsyLimitsFromEnv } from './limits';
import { cacheKeys, TTL, createEtsyCache, createKeywordHistory, type EtsyCache, type KeywordHistoryStore } from './cache';

/**
 * True when a real Etsy keystring is configured (drives real-vs-mock selection). Accepts the
 * dedicated `ETSY_API_KEY` or the OAuth keystring (`ETSY_OAUTH_CLIENT_ID`) — they're the same
 * Etsy keystring, so having OAuth configured is enough to use the real research client.
 */
export function hasEtsyKey(env: Env): boolean {
  return !!(env.ETSY_API_KEY ?? env.ETSY_OAUTH_CLIENT_ID);
}

/**
 * Seller-facing READ client — runs on the OAuth app key (`ETSY_OAUTH_CLIENT_ID`, "8mh6"), the SAME
 * registered app sellers connect/authorize through, NOT the cron pool. Keeps the reviewable,
 * user-facing surface on our own approved app key. Usage is tracked in `etsy_api_usage` (a table
 * SEPARATE from the pool's `etsy_key_usage`), so seller traffic never eats the cron accumulator's
 * budget. Used by `getEtsyContext` (all etsy-tools routes), My Shop, and user-initiated jobs.
 *
 * NOTE: assumes the OAuth app key ("8mh6") is DISTINCT from the ETSY_API_KEYS pool keys, so the two
 * paths don't double-spend one physical key's real Etsy daily limit.
 */
export function getEtsyClientForUser(env: Env): EtsyClient {
  if (!hasEtsyKey(env)) return createMockEtsyClient(defaultFixtures);
  const limits = etsyLimitsFromEnv(env);
  // OAuth app's keystring:secret (8mh6); fall back to etsyApiKey only if OAuth isn't configured.
  const keystring = etsyOAuthApiKey(env) ?? etsyApiKey(env)!;
  return createEtsyClient({
    apiKey: keystring,
    rps: limits.rps,
    usageCounter: createUsageCounter(env.DB, { cap: limits.dailyCap, hardLimit: limits.rpd }),
  });
}

/**
 * Background/CRON READ client — runs on the `ETSY_API_KEYS` pool (rotates across keys; per-key caps
 * tracked in `etsy_key_usage`). Kept separate from seller traffic so the heavy data-enrichment cron
 * never competes with user-facing reads. Used by the scheduled cron + calibration.
 */
export function getEtsyClient(env: Env): EtsyClient {
  if (!hasEtsyKey(env)) return createMockEtsyClient(defaultFixtures);
  const limits = etsyLimitsFromEnv(env);
  const keys = etsyApiKeys(env);

  // Multi-key POOL: rotate across keys (each its own RPS + daily cap) → ~N× effective throughput.
  if (keys.length >= 2) {
    const pool = createEtsyKeyPool(keys, {
      db: env.DB,
      rpsPerKey: limits.rps,
      rpdPerKey: limits.dailyCap,
    });
    return createEtsyClient({ apiKey: '', keyPool: pool });
  }

  // Single key — unchanged legacy path (shared usage counter + the client's own RPS gate).
  return createEtsyClient({
    apiKey: keys[0]?.apiKey ?? etsyApiKey(env)!, // keystring:shared_secret for the x-api-key header
    rps: limits.rps,
    usageCounter: createUsageCounter(env.DB, { cap: limits.dailyCap, hardLimit: limits.rpd }),
  });
}

export interface EtsyContext {
  client: EtsyClient;
  cache: EtsyCache;
  history: KeywordHistoryStore;
  /** Whether live data is available (real key). Mock path still serves results. */
  live: boolean;
}

export function getEtsyContext(env: Env): EtsyContext {
  return {
    client: getEtsyClientForUser(env), // seller-facing surface → OAuth app key (8mh6), not the cron pool
    cache: createEtsyCache(env.KV),
    history: createKeywordHistory(env.HISTORY_DB ?? env.DB), // keywords_cache lives in vierank-history
    live: hasEtsyKey(env),
  };
}

/**
 * Real total active-listing count for a keyword (the `count` from a `limit:1` search), used to
 * GROUND LLM-suggested keywords with live Etsy market size. Cache-first (`cacheKeys.keyword`,
 * 7d TTL) so repeated keywords cost 0 Etsy calls.
 *
 * `allowFetch` gates the live API call (callers spend a small per-request budget): when false, or
 * on an Etsy transport error, it returns the cached count if present, otherwise `null` (caller
 * falls back to the un-grounded LLM estimate). Non-Etsy errors are rethrown.
 *
 * @param ctx        - Etsy context bundle (client + cache).
 * @param keyword    - Keyword to count active listings for.
 * @param allowFetch - Whether a live `findActiveListings` call is permitted on a cache miss.
 * @returns The active-listing count, or `null` when no real number is available.
 */
export async function realListingCount(
  ctx: Pick<EtsyContext, 'client' | 'cache'>,
  keyword: string,
  allowFetch: boolean
): Promise<number | null> {
  const key = cacheKeys.keyword(keyword);
  const cached = await ctx.cache.get<{ count: number }>(key);
  if (cached?.fresh) return cached.payload.count;
  if (!allowFetch) return cached?.payload.count ?? null;
  try {
    const page = await ctx.client.findActiveListings({ keywords: keyword, limit: 1 });
    const count = page.count ?? 0;
    await ctx.cache.put(key, { count }, TTL.keyword);
    return count;
  } catch (err) {
    if (err instanceof EtsyError) return cached?.payload.count ?? null;
    throw err;
  }
}

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
import type { Env } from '../../env';
import type { EtsyClient } from './types';
import { createEtsyClient, EtsyError } from './client';
import { createMockEtsyClient, defaultFixtures } from './mock';
import { createUsageCounter, DEFAULT_ETSY_DAILY_CAP } from './usageCounter';
import { cacheKeys, TTL, createEtsyCache, createKeywordHistory, type EtsyCache, type KeywordHistoryStore } from './cache';

/** True when a real Etsy key is configured (drives real-vs-mock selection). */
export function hasEtsyKey(env: Env): boolean {
  return !!env.ETSY_API_KEY;
}

export function getEtsyClient(env: Env): EtsyClient {
  if (!hasEtsyKey(env)) return createMockEtsyClient(defaultFixtures);
  const cap = parseCap(env.ETSY_DAILY_CAP, DEFAULT_ETSY_DAILY_CAP);
  return createEtsyClient({
    apiKey: env.ETSY_API_KEY!,
    usageCounter: createUsageCounter(env.DB, { cap }),
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
    client: getEtsyClient(env),
    cache: createEtsyCache(env.KV),
    history: createKeywordHistory(env.DB),
    live: hasEtsyKey(env),
  };
}

function parseCap(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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

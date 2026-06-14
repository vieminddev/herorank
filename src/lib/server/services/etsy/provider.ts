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
import { createEtsyClient } from './client';
import { createMockEtsyClient, defaultFixtures } from './mock';
import { createUsageCounter, DEFAULT_ETSY_DAILY_CAP } from './usageCounter';
import { createEtsyCache, createKeywordHistory, type EtsyCache, type KeywordHistoryStore } from './cache';

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

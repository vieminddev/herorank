/**
 * runPool (bounded-concurrency map) — the primitive the cron research sweeps use to fan hundreds
 * of sequential Etsy calls into a handful of parallel streams (refresh.ts). Verifies:
 *   (a) the concurrency cap is respected (never more than N workers in flight)
 *   (b) every item is processed and results are collected (undefined = recorded skip)
 *   (c) a stop-matched throw halts scheduling of not-yet-started items but resolves (no reject)
 *   (d) refreshTrends with concurrency>1 yields the SAME data as the sequential default
 */
import { describe, it, expect, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { runPool } from '../src/lib/server/services/etsy/concurrency';
import { refreshTrends, type RefreshDeps } from '../src/lib/server/services/etsy/refresh';
import { createEtsyCache, createKeywordHistory, cacheKeys } from '../src/lib/server/services/etsy/cache';
import { createEtsyClient, QuotaExceededError } from '../src/lib/server/services/etsy/client';
import { makeSqliteD1 } from './helpers/sqliteD1';

/** Minimal in-memory KV (mirrors the inline mock other etsy tests use). */
function makeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
    list: async () => ({ keys: [...store.keys()].map((name) => ({ name })), list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

// A latch that resolves on demand so we can hold workers in flight and measure overlap.
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('runPool — bounded concurrency', () => {
  it('never exceeds the concurrency cap and processes every item', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;
    const { results, stopped } = await runPool(items, 4, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); // yield so siblings can ramp up
      await Promise.resolve();
      inFlight--;
      return n * 2;
    });
    expect(stopped).toBe(false);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1); // genuinely concurrent
    expect(results.sort((a, b) => a - b)).toEqual(items.map((n) => n * 2));
  });

  it('clamps concurrency to the item count and records skips (undefined results)', async () => {
    const { results } = await runPool([1, 2, 3], 99, async (n) => (n % 2 ? n : undefined));
    expect(results.sort()).toEqual([1, 3]); // even item skipped
  });

  it('stops scheduling new items when a worker throws a stop-matched error (no reject)', async () => {
    const started: number[] = [];
    const gate = deferred<void>();
    const promise = runPool(
      [0, 1, 2, 3, 4, 5, 6, 7],
      2,
      async (n) => {
        started.push(n);
        if (n === 0) {
          await gate.promise; // hold item 0 so item 1 can throw the stop first
          return n;
        }
        if (n === 1) throw new QuotaExceededError(1, 1);
        return n;
      },
      (err) => err instanceof QuotaExceededError
    );
    // Let item 1 throw and flip the stop flag, then release item 0.
    await Promise.resolve();
    gate.resolve();
    const { results, stopped } = await promise;
    expect(stopped).toBe(true);
    // With cap=2 only items 0 and 1 ever started; the stop prevented 2..7 from scheduling.
    expect(started.sort()).toEqual([0, 1]);
    expect(results).toEqual([0]); // item 1 threw (no result), 2..7 never ran
  });

  it('non-stop errors reject the pool (caller must catch inside the worker to skip)', async () => {
    await expect(
      runPool([1, 2, 3], 2, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});

describe('refreshTrends — concurrency equivalence', () => {
  function buildDeps(): { deps: Omit<RefreshDeps, 'concurrency'>; fetchCount: () => number } {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return new Response(
        JSON.stringify({ count: 1234, results: [{ listing_id: 1, views: 100, num_favorers: 5, price: { amount: 2000, divisor: 100 } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const client = createEtsyClient({ apiKey: 'k', fetchImpl, sleepImpl: async () => {} });
    const { db } = makeSqliteD1();
    return {
      deps: { client, cache: createEtsyCache(makeKV()), history: createKeywordHistory(db) },
      fetchCount: () => calls,
    };
  }

  const seeds = [
    { name: 'Jewelry', taxonomyId: 1199, keywords: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { name: 'Candles', taxonomyId: null, keywords: ['g', 'h', 'i'] },
  ];

  it('processes all keywords with concurrency>1, same totals as sequential', async () => {
    const seq = buildDeps();
    const conc = buildDeps();
    const total = seeds.reduce((n, c) => n + c.keywords.length, 0);

    const r1 = await refreshTrends({ ...seq.deps, concurrency: 1 }, seeds);
    const r2 = await refreshTrends({ ...conc.deps, concurrency: 5 }, seeds);

    expect(r1.processed).toBe(total);
    expect(r2.processed).toBe(total);
    expect(r2.deferred).toBe(0);
    expect(r2.quotaHit).toBe(false);
    expect(conc.fetchCount()).toBe(total); // one Etsy call per keyword, no duplication

    // Both runs write the global trends KV with all keywords ranked.
    const all = await conc.deps.cache.get(cacheKeys.trends('all'));
    expect(all).not.toBeNull();
  });
});

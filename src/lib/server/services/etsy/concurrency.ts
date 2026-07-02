/**
 * Bounded-concurrency map (Engineer F) — runs a worker over `items` with at most `concurrency`
 * in flight at once. Used by the cron refresh sweeps (refresh.ts) to fan hundreds of sequential
 * Etsy calls into a handful of parallel streams, cutting each daily research half from ~13 min
 * (sequential, brushing Cloudflare's per-invocation wall-clock limit) to ~1 min.
 *
 * Safety: physical Etsy RPS is NOT bounded here — it stays bounded by the key pool's per-key
 * `makeGate` (each key still ≤ ETSY_RPS), so N concurrent workers funnel through K key-gates and
 * burst to at most K × RPS aggregate, never past any single key's per-second limit. Per-key daily
 * quota is likewise enforced in the pool; the read-then-write pre-check can over-count by a hair
 * under concurrency, which is benign given the large daily headroom.
 *
 * Stop signal: a worker that throws an error matched by `isStop` (e.g. QuotaExceededError) halts
 * scheduling of any not-yet-started items — in-flight workers still finish — and `runPool` resolves
 * with `stopped: true` instead of rejecting. NON-stop errors propagate (reject the whole pool), so
 * callers that want skip-and-continue must catch those inside the worker and return `undefined`.
 */

export interface PoolOutcome<R> {
  /** Results from workers that returned a defined value, in completion order. */
  results: R[];
  /** True when a worker threw a stop-matched error and scheduling was halted early. */
  stopped: boolean;
}

/**
 * Map `worker` over `items` with bounded concurrency.
 *
 * @param items       work list (processed in array order as slots free up)
 * @param concurrency max workers in flight (clamped to ≥1 and ≤ items.length)
 * @param worker      async producer; return `undefined` to record a skip (no result), throw to error
 * @param isStop      predicate: when a thrown error matches, halt scheduling (resolve, don't reject)
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R | undefined>,
  isStop: (err: unknown) => boolean = () => false
): Promise<PoolOutcome<R>> {
  const results: R[] = [];
  if (items.length === 0) return { results, stopped: false };

  let stopped = false;
  let cursor = 0;
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));

  async function runner(): Promise<void> {
    while (!stopped) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const r = await worker(items[i], i);
        if (r !== undefined) results.push(r);
      } catch (err) {
        if (isStop(err)) {
          stopped = true;
          return;
        }
        throw err;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runner()));
  return { results, stopped };
}

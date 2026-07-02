/**
 * Etsy API key POOL (multi-key rotation) — multiplies effective throughput to ~N × per-key RPD.
 *
 * Each Etsy app key has its own 5 RPS / 5000 RPD budget. The pool round-robins logical calls across
 * the configured keys, paces EACH key independently (per-key RPS gate), counts EACH key's daily
 * usage (etsy_key_usage), and — when a key hits its daily cap locally OR Etsy returns a daily-limit
 * 429 — marks that key exhausted-for-today and rotates to the next available key. When every key is
 * exhausted it throws QuotaExceededError (the real "out of quota" state).
 *
 * Pure-ish: D1 + injected clock/sleep so it is unit-testable with fakes. Transient (per-second) 429s
 * are NOT a key's fault → the key is tried again next call; only DAILY-limit 429s exhaust a key.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { QuotaExceededError, EtsyRateLimitError, EtsyDailyLimitError } from './client';
import { utcDay } from './usageCounter';

export interface PooledKey {
  /** Stable, non-sensitive id (keystring prefix). */
  id: string;
  /** `keystring:shared_secret` for the x-api-key header. */
  apiKey: string;
}

export interface EtsyKeyPool {
  readonly size: number;
  /** Run `send(apiKey)` against an available key, rotating on daily-limit/quota exhaustion. */
  execute<T>(send: (apiKey: string) => Promise<T>): Promise<T>;
}

export interface KeyPoolConfig {
  db: D1Database;
  /** Requests/second ceiling PER KEY (env.ETSY_RPS). */
  rpsPerKey: number;
  /** Internal daily cap PER KEY (derived from env.ETSY_RPD). */
  rpdPerKey: number;
  sleepImpl?: (ms: number) => Promise<void>;
  /** ms clock. */
  nowImpl?: () => number;
  /** Starting round-robin index (tests). */
  startIndex?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A per-key min-spacing RPS gate (same algorithm as the single-key client throttle). */
function makeGate(rps: number, sleep: (ms: number) => Promise<void>, clock: () => number) {
  const minInterval = rps > 0 ? 1000 / rps : 0;
  let nextAt = 0;
  let chain: Promise<void> = Promise.resolve();
  return function acquire(): Promise<void> {
    if (minInterval <= 0) return Promise.resolve();
    const run = chain.then(async () => {
      const now = clock();
      const wait = nextAt - now;
      if (wait > 0) await sleep(wait);
      nextAt = (wait > 0 ? nextAt : now) + minInterval;
    });
    chain = run.catch(() => {});
    return run;
  };
}

/** Charge one unit against a key's daily counter; returns false (no increment) if the cap is reached. */
async function consumeKey(db: D1Database, day: string, keyId: string, cap: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT count FROM etsy_key_usage WHERE day = ? AND key_id = ?')
    .bind(day, keyId)
    .first<{ count: number }>();
  const current = row?.count ?? 0;
  if (current + 1 > cap) return false;
  await db
    .prepare(
      'INSERT INTO etsy_key_usage (day, key_id, count) VALUES (?, ?, 1) ' +
        'ON CONFLICT(day, key_id) DO UPDATE SET count = count + 1'
    )
    .bind(day, keyId)
    .run();
  return true;
}

export function createEtsyKeyPool(keys: PooledKey[], cfg: KeyPoolConfig): EtsyKeyPool {
  const sleep = cfg.sleepImpl ?? defaultSleep;
  const clock = cfg.nowImpl ?? (() => Date.now());
  const gates = new Map(keys.map((k) => [k.id, makeGate(cfg.rpsPerKey, sleep, clock)]));
  // keyId → UTC day on which it was marked exhausted (cleared implicitly when the day rolls over).
  const exhausted = new Map<string, string>();
  let rr = cfg.startIndex ?? 0;

  return {
    size: keys.length,

    async execute<T>(send: (apiKey: string) => Promise<T>): Promise<T> {
      const day = utcDay(new Date(clock()));
      const avail = keys.filter((k) => exhausted.get(k.id) !== day);
      if (avail.length === 0) {
        throw new QuotaExceededError(0, cfg.rpdPerKey * keys.length, 'All Etsy keys exhausted for today');
      }

      // Round-robin order over the currently-available keys; advance the cursor so load spreads.
      const order: PooledKey[] = [];
      for (let i = 0; i < avail.length; i++) order.push(avail[(rr + i) % avail.length]);
      rr = (rr + 1) % avail.length;

      let lastErr: unknown = null;
      for (const key of order) {
        // Per-key daily quota — skip (and exhaust) a key that already hit its cap.
        if (!(await consumeKey(cfg.db, day, key.id, cfg.rpdPerKey))) {
          exhausted.set(key.id, day);
          lastErr = new QuotaExceededError(cfg.rpdPerKey, cfg.rpdPerKey, `Key ${key.id} daily cap reached`);
          continue;
        }
        await gates.get(key.id)!();
        try {
          return await send(key.apiKey);
        } catch (err) {
          if (err instanceof EtsyDailyLimitError) {
            // Etsy says this key is done for the day → mark exhausted, rotate.
            exhausted.set(key.id, day);
            lastErr = err;
            continue;
          }
          if (err instanceof EtsyRateLimitError) {
            // Transient per-second limit (already retried by the caller) → try another key, but do
            // NOT exhaust this one (it's fine again next call).
            lastErr = err;
            continue;
          }
          throw err; // not-found / config / upstream → surface unchanged
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new QuotaExceededError(0, cfg.rpdPerKey * keys.length, 'All Etsy keys exhausted');
    },
  };
}

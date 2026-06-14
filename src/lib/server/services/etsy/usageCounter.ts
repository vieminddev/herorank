/**
 * Daily Etsy API usage counter (Engineer F owns, spec §1.5) — the hard quota guard.
 *
 * Store: D1 (durable, survives KV eventual-consistency / isolate recycles), one row per UTC
 * day in `etsy_api_usage(day TEXT PK, count INTEGER)` (migration 0003). User requests AND
 * cron share this one counter so we never blow past Etsy's 10k/day. Default cap = 8000
 * (PM Q14), well below 10k for QPS-burst / clock-skew headroom.
 *
 * `consume(n)` is a single atomic statement (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`)
 * so there is no read-then-write race; a tiny over-count under extreme concurrency is fine
 * (the cap has headroom). When the post-increment total would exceed the cap, it does NOT
 * persist the increment and throws `QuotaExceededError` (spec §1.5).
 *
 * O4 (Phase 5): Emits a logEvent 'warn' alert when daily usage reaches ≥80% of the
 * ETSY_HARD_DAILY_LIMIT (10 000). Best-effort — never throws for observability.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { UsageCounter } from './types';
import { QuotaExceededError } from './client';
import { logEvent } from '$lib/server/observability/log';

/** Etsy's hard daily API limit (external constraint, not configurable). */
export const ETSY_HARD_DAILY_LIMIT = 10_000;
/** Fraction of ETSY_HARD_DAILY_LIMIT at which we emit a quota-warning alert. */
const QUOTA_WARN_THRESHOLD = 0.8;

export const DEFAULT_ETSY_DAILY_CAP = 8000;

/** UTC day key 'YYYY-MM-DD'. */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

interface UsageRow {
  count: number;
}

export interface UsageCounterConfig {
  /** Hard daily cap (env.ETSY_DAILY_CAP). Default 8000. */
  cap?: number;
  /** Sub-cap applied to cron callers so cron never starves users (env.ETSY_CRON_CAP). */
  subCap?: number;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export function createUsageCounter(db: D1Database, config: UsageCounterConfig = {}): UsageCounter {
  const cap = config.cap ?? DEFAULT_ETSY_DAILY_CAP;
  const effectiveCap = config.subCap !== undefined ? Math.min(config.subCap, cap) : cap;
  const now = config.now ?? (() => new Date());

  async function readCount(day: string): Promise<number> {
    const row = await db
      .prepare('SELECT count FROM etsy_api_usage WHERE day = ?')
      .bind(day)
      .first<UsageRow>();
    return row?.count ?? 0;
  }

  return {
    async consume(n: number): Promise<{ usedToday: number; capRemaining: number }> {
      const day = utcDay(now());

      // Pre-check against the (sub-)cap before committing the increment, so a refused call
      // does not inflate the counter. The increment itself is a single atomic statement.
      const current = await readCount(day);
      if (current + n > effectiveCap) {
        throw new QuotaExceededError(current, effectiveCap);
      }

      const row = await db
        .prepare(
          'INSERT INTO etsy_api_usage (day, count) VALUES (?, ?) ' +
            'ON CONFLICT(day) DO UPDATE SET count = count + excluded.count ' +
            'RETURNING count'
        )
        .bind(day, n)
        .first<UsageRow>();

      const usedToday = row?.count ?? current + n;

      // O4: Alert when the shared daily counter crosses 80% of Etsy's hard 10k/day limit.
      // Use ETSY_HARD_DAILY_LIMIT (10k), NOT the internal effectiveCap (8k), so the alert
      // fires relative to Etsy's real ceiling. Best-effort: logEvent never throws.
      const warnAt = Math.floor(ETSY_HARD_DAILY_LIMIT * QUOTA_WARN_THRESHOLD);
      if (usedToday >= warnAt && current < warnAt) {
        // Only emit once per crossing (current was below threshold, usedToday is now above).
        logEvent('warn', {
          event: 'etsy_quota_warning',
          used_today: usedToday,
          hard_limit: ETSY_HARD_DAILY_LIMIT,
          threshold_pct: Math.round(QUOTA_WARN_THRESHOLD * 100),
          cap: effectiveCap,
          day,
        });
      }

      return { usedToday, capRemaining: Math.max(0, effectiveCap - usedToday) };
    },

    async peek(): Promise<{ usedToday: number; cap: number }> {
      const day = utcDay(now());
      return { usedToday: await readCount(day), cap: effectiveCap };
    },
  };
}

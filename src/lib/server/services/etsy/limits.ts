/**
 * Etsy API rate limits — the TWO knobs you change when your Etsy plan changes.
 *
 *   ETSY_RPS  — requests/SECOND the Etsy app key allows → proactive throttle in `client.ts`.
 *   ETSY_RPD  — requests/DAY the Etsy app key allows    → hard daily ceiling (usageCounter).
 *
 * Everything else (internal daily hard-cap, cron sub-cap, quota-warning threshold) is DERIVED
 * from these two so there is a single place to edit when Etsy raises/lowers the plan. Set them in
 * `wrangler.jsonc` (vars) / `.dev.vars`; the legacy `ETSY_DAILY_CAP` / `ETSY_CRON_CAP` still work
 * as explicit overrides when you want to pin those numbers independently.
 *
 * Defaults match the current app plan: 5 RPS / 5000 RPD.
 */

/** Requests/second the Etsy app key allows. */
export const DEFAULT_ETSY_RPS = 5;
/** Requests/day the Etsy app key allows. */
export const DEFAULT_ETSY_RPD = 5000;

/**
 * Fraction of RPD held back as internal headroom. A 429-retry is a real HTTP request but is NOT
 * counted by the usage counter (one logical call = 1 quota unit regardless of retries), and clock
 * skew across isolates can over-count. The effective internal cap therefore stops us *below* the
 * real ceiling: dailyCap = floor(rpd * (1 - headroom)). 0.1 → 4500 for a 5000 RPD plan.
 */
export const ETSY_RPD_HEADROOM = 0.1;

/**
 * Default share of the internal daily cap reserved for background jobs (weekly refresh + the
 * 30-min rank sweep) so cron never starves live user requests. 0.4 → 1800 for a 4500 dailyCap.
 */
export const ETSY_CRON_SHARE = 0.4;

export interface EtsyLimits {
  /** Requests/second ceiling — feeds the proactive throttle (`client.ts`). */
  rps: number;
  /** Requests/day ceiling — the raw external Etsy limit; drives the quota-warning threshold. */
  rpd: number;
  /** Effective internal hard daily cap = floor(rpd * (1 - headroom)). Shared user + cron. */
  dailyCap: number;
  /** Cron sub-cap = floor(dailyCap * cronShare) (or the ETSY_CRON_CAP override). */
  cronCap: number;
}

/** Parse a positive numeric env string; fall back when absent/invalid. */
function num(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Subset of `Env` this module reads. */
export interface EtsyLimitEnv {
  ETSY_RPS?: string;
  ETSY_RPD?: string;
  /** Legacy explicit override for the internal daily hard-cap. */
  ETSY_DAILY_CAP?: string;
  /** Legacy explicit override for the cron sub-cap. */
  ETSY_CRON_CAP?: string;
}

/**
 * Resolve the effective Etsy limits from env. The two canonical knobs are `ETSY_RPS` / `ETSY_RPD`;
 * `dailyCap` and `cronCap` are derived from them but can be pinned via the legacy overrides.
 */
export function etsyLimitsFromEnv(env: EtsyLimitEnv): EtsyLimits {
  const rps = num(env.ETSY_RPS, DEFAULT_ETSY_RPS);
  const rpd = num(env.ETSY_RPD, DEFAULT_ETSY_RPD);

  const derivedDailyCap = Math.floor(rpd * (1 - ETSY_RPD_HEADROOM));
  const dailyCap = num(env.ETSY_DAILY_CAP, derivedDailyCap);

  const derivedCronCap = Math.floor(dailyCap * ETSY_CRON_SHARE);
  // Cron sub-cap can never exceed the daily cap (Math.min guards a mis-set override).
  const cronCap = Math.min(dailyCap, num(env.ETSY_CRON_CAP, derivedCronCap));

  return { rps, rpd, dailyCap, cronCap };
}

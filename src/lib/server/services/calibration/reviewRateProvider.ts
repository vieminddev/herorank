/**
 * Review-rate provider (Engineer H) — the seam G injects into `salesEstimate` (BR-P4-CAL-01).
 *
 * THE design rule (BA spec §3.4): calibration must reach the estimation engine through a DATA
 * table the engine READS, never by editing `estimation/config.ts` literals. This provider is
 * that read path. G's `salesEstimate` resolves a per-category review-rate as:
 *
 *     const rate = reviewRateProvider(categoryId) ?? config.byCategory[categoryId] ?? config.default;
 *
 * So a measured calibration rate (when confident) overrides the config; otherwise the config
 * stays the floor. The provider returns `null` when there is no confident measurement for the
 * category, which is the signal for G to fall back to config.
 *
 * CONFIDENCE GATE: a measured rate is only returned when `sample_size >= MIN_SAMPLE` (BR-P4-CAL-01)
 * — sparse categories fall back to config rather than over-fitting a handful of transactions.
 *
 * INTERFACE (what G consumes):
 *   - `ReviewRateProvider = (categoryId: number | null | undefined) => number | null`
 *     PURE-CALL signature: synchronous, no I/O at call time. Estimation stays pure — the data
 *     is loaded ONCE (async) into a snapshot, then the provider closes over it.
 *   - G calls `await loadReviewRateProvider(db)` (or accepts an injected provider in tests) and
 *     passes the resulting function into `salesEstimate`. The estimation function itself never
 *     imports this module — it only receives the function (DI), preserving pure-fn testability.
 */
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Minimum backing transactions before a measured review-rate overrides the config default
 * (PM decision / BA Q14). 50 transactions per category is the confidence floor.
 */
export const MIN_SAMPLE = 50;

/**
 * The provider G injects into `salesEstimate`. Synchronous + pure: given a top-level taxonomy
 * `categoryId`, returns the measured review-rate or `null` (→ G falls back to config).
 */
export type ReviewRateProvider = (categoryId: number | null | undefined) => number | null;

/** One calibrated category row (as stored in `calibration_factors`). */
export interface CalibrationFactor {
  categoryId: number;
  reviewRate: number;
  sampleSize: number;
  updatedAt: number;
}

/** A no-op provider: always falls back to config. Used as the default before any calibration. */
export const noopReviewRateProvider: ReviewRateProvider = () => null;

/**
 * Build a synchronous provider over an already-loaded snapshot of calibration factors.
 * Only factors with `sampleSize >= minSample` are eligible (confidence gate).
 */
export function reviewRateProviderFromFactors(
  factors: CalibrationFactor[],
  minSample = MIN_SAMPLE
): ReviewRateProvider {
  const byCategory = new Map<number, number>();
  for (const f of factors) {
    if (f.sampleSize >= minSample && f.reviewRate > 0) {
      byCategory.set(f.categoryId, f.reviewRate);
    }
  }
  return (categoryId) => {
    if (categoryId == null) return null;
    return byCategory.get(categoryId) ?? null;
  };
}

/**
 * Load all calibration factors from D1 and return a ready-to-inject provider. Call this ONCE per
 * request/job (it reads the whole small table), then pass the result into `salesEstimate`.
 */
export async function loadReviewRateProvider(
  db: D1Database,
  minSample = MIN_SAMPLE
): Promise<ReviewRateProvider> {
  const factors = await loadCalibrationFactors(db);
  return reviewRateProviderFromFactors(factors, minSample);
}

/** Raw read of `calibration_factors` (used by the provider loader + tests). */
export async function loadCalibrationFactors(db: D1Database): Promise<CalibrationFactor[]> {
  const res = await db
    .prepare(
      'SELECT category_id, review_rate, sample_size, updated_at FROM calibration_factors'
    )
    .all<{ category_id: number; review_rate: number; sample_size: number; updated_at: number }>();
  return (res.results ?? []).map((r) => ({
    categoryId: r.category_id,
    reviewRate: r.review_rate,
    sampleSize: r.sample_size,
    updatedAt: r.updated_at,
  }));
}

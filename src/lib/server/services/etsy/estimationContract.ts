/**
 * Estimation contract (Engineer F declares — Engineer G implements).
 *
 * This file is the AGREED SIGNATURE BOUNDARY between the Etsy data layer (F) and the
 * estimation engine (G, `src/lib/server/services/estimation/`). F's `etsy-tools.ts` imports
 * `getEstimation()` from here so it type-checks and runs TODAY, before G's pure functions land.
 *
 * Wiring (G does this, NO change to this file's signatures):
 *   - G ships `src/lib/server/services/estimation/index.ts` exporting the 6 pure fns below
 *     (demandScore, salesEstimate, competitionLevel, trendDelta, rankEstimate, listingAudit)
 *     with EXACTLY these parameter + return types.
 *   - Then F flips `loadEstimation()` here from the placeholder to a dynamic import of that
 *     module (one-line change, marked TODO below). Until then, the placeholder returns honest
 *     neutral values so routes never crash and tests can run against the mock client.
 *
 * Inputs reference the raw Etsy* types in `./types` (F owns); outputs are G's to define but are
 * pinned here so both sides agree. Pure functions: NO I/O, NO Etsy import inside them.
 */
import type { EtsyListing, EtsyReview, CompetitionLabel, DemandLabel, TrendDirection } from './types';
import type { ReviewRateProvider } from '$lib/server/services/calibration/reviewRateProvider';

// --- demandScore ------------------------------------------------------------
export interface DemandScoreInput {
  /** Total active listings for the keyword (findActiveListings.count) — market/competition size. */
  resultCount: number;
  /** Sum of recent-review counts across top-N listings for the keyword — real buying activity. */
  aggregateReviewVelocity: number;
  /** Sum of num_favorers across top-N listings — engagement proxy. */
  favoritesSignal: number;
  /**
   * Sum of `views` across top-N listings — REAL traffic, the strongest demand signal (far better
   * than faves, which are frequently 0). Optional for back-compat: absent → falls back to the
   * faves/velocity blend only.
   */
  aggregateViews?: number;
}
export interface DemandScoreResult {
  score: number; // 0-100
  label: DemandLabel;
}

// --- salesEstimate ----------------------------------------------------------
export interface SalesEstimateInput {
  /** Reviews observed in the trailing 90 days (from review timestamps). */
  reviewsLast90d: number;
  /** Average listing price in major currency units (e.g. dollars), already divided by divisor. */
  avgPrice: number;
  /** Top-level taxonomy id for category-specific REVIEW_RATE lookup (nullable → default rate). */
  categoryId?: number | null;
}
export interface SalesEstimateResult {
  monthlySales: number;
  monthlyRevenue: string; // formatted, e.g. '$1.2K' / '$540'
  /** Optional confidence band multipliers (Q4) — FE may show a range or ignore. */
  rangeLow: number;
  rangeHigh: number;
  estimated: true;
}

// --- trendDelta -------------------------------------------------------------
export interface TrendDeltaResult {
  change: string; // '+12%' | '-5%' | '—'
  direction: TrendDirection;
}

// --- rankEstimate -----------------------------------------------------------
export interface RankEstimateInput {
  /** Ordered listing_ids from findActiveListings(sort_on=score) — index 0 = top. */
  orderedListingIds: number[];
  targetListingId: number;
}
export interface RankEstimateResult {
  position: number | null; // 1-based; null = not in the provided window
}

// --- listingAudit -----------------------------------------------------------
export interface ListingAuditScoreSection {
  score: number; // 0-100
  feedback: {
    clarity: Array<{ status: 'good' | 'warning' | 'error'; text: string }>;
    seo: Array<{ status: 'good' | 'warning' | 'error'; text: string }>;
  };
}
export interface ListingAuditResult {
  title: ListingAuditScoreSection;
  tags: ListingAuditScoreSection;
  images: ListingAuditScoreSection;
  video: ListingAuditScoreSection;
  description: ListingAuditScoreSection;
}

/** The full estimation surface F consumes. G's `estimation/index.ts` must satisfy this. */
export interface Estimation {
  demandScore(input: DemandScoreInput): DemandScoreResult;
  /** Optional 2nd param: calibration provider (Phase 4 BR-P4-CAL-01). Absent = noop (Phase-3 config path). */
  salesEstimate(input: SalesEstimateInput, reviewRateProvider?: ReviewRateProvider): SalesEstimateResult;
  competitionLevel(resultCount: number): CompetitionLabel;
  /** prior may be null (cold start) → direction 'stable', change '—'. Values are demandScore (0-100). */
  trendDelta(current: number, prior: number | null): TrendDeltaResult;
  rankEstimate(input: RankEstimateInput): RankEstimateResult;
  listingAudit(listing: EtsyListing): ListingAuditResult;
}

// ---------------------------------------------------------------------------
// Placeholder implementation — honest neutral values until G's module lands.
// ---------------------------------------------------------------------------

const placeholderSection = (): ListingAuditScoreSection => ({
  score: 0,
  feedback: { clarity: [{ status: 'warning', text: 'Audit pending (estimation engine not wired).' }], seo: [] },
});

const placeholder: Estimation = {
  demandScore: () => ({ score: 0, label: 'low' }),
  salesEstimate: () => ({
    monthlySales: 0,
    monthlyRevenue: '$0',
    rangeLow: 0,
    rangeHigh: 0,
    estimated: true,
  }),
  competitionLevel: (resultCount) =>
    resultCount < 1000 ? 'low' : resultCount < 20000 ? 'medium' : 'high',
  trendDelta: (current, prior) => {
    if (prior === null) return { change: '—', direction: 'stable' };
    const pct = ((current - prior) / Math.max(prior, 1)) * 100;
    const direction: TrendDirection = pct > 3 ? 'up' : pct < -3 ? 'down' : 'stable';
    return { change: (pct >= 0 ? '+' : '') + Math.round(pct) + '%', direction };
  },
  rankEstimate: ({ orderedListingIds, targetListingId }) => {
    const idx = orderedListingIds.indexOf(targetListingId);
    return { position: idx === -1 ? null : idx + 1 };
  },
  listingAudit: () => ({
    title: placeholderSection(),
    tags: placeholderSection(),
    images: placeholderSection(),
    video: placeholderSection(),
    description: placeholderSection(),
  }),
};

let cached: Estimation | null = null;

/**
 * Resolve the estimation surface. Memoized dynamic import of G's `estimation/index.ts`.
 * QA: flipped from placeholder → real module (G's estimation/index.ts is shipped and typed
 * `: Estimation`, compile-time verified).
 */
export async function getEstimation(): Promise<Estimation> {
  if (cached) return cached;
  const mod = await import('../estimation');
  cached = mod.estimation;
  return cached;
}

/** Test seam: inject a real/stub Estimation (used by route integration tests). */
export function __setEstimation(e: Estimation): void {
  cached = e;
}

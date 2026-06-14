/**
 * Estimation calibration surface (Engineer G owns) — BR-P3-EST-01.
 *
 * EVERY magic number used by the estimation engine lives here, in ONE file, so that:
 *   1. Reviewers see all coefficients/buckets/scales in a single place.
 *   2. Phase 4 (Layer-4 own-shop sales) can recalibrate by editing ONLY this file —
 *      no formula touched.
 *
 * Phase 4 override path: import { ESTIMATION_CONFIG } and either edit literals here, or
 * (preferred, non-destructive) merge an override at startup:
 *
 *     import { ESTIMATION_CONFIG } from '$lib/server/services/estimation/config';
 *     Object.assign(ESTIMATION_CONFIG.demandWeights, { velocity: 0.6, faves: 0.2, resultCount: 0.2 });
 *     ESTIMATION_CONFIG.reviewRate.byCategory[1] = 0.22; // jewelry node id → calibrated rate
 *
 * The estimation functions read `ESTIMATION_CONFIG` at CALL TIME (not import time), so a
 * mutation done before the first tool request is picked up. Keep the object mutable for this
 * reason (do NOT `as const` / deep-freeze it).
 *
 * NO estimation magic number may appear outside this file. Tests import these values rather
 * than re-declaring literals, so a coefficient change can never silently drift from its test.
 */

// --- demandScore (§3.1) -----------------------------------------------------

/**
 * Signal weights for demandScore. MUST sum to 1.0 (score stays on a 0-100 scale).
 * review-velocity is weighted highest because reviews-over-time is the only API signal tied
 * to REAL transactions; resultCount is a competition/market-exists proxy, not demand itself.
 * PM Q3: Google Trends DEFERRED — these three signals only.
 */
export interface DemandWeights {
  velocity: number; // weight on aggregateReviewVelocity (best real demand signal)
  faves: number; // weight on favoritesSignal (engagement proxy)
  resultCount: number; // weight on resultCount (market-exists / size proxy)
}

/**
 * Log-scaling reference points. norm(x) = 100 * log10(1+x) / log10(1+SCALE) clamped to 100.
 * SCALE = the value of a signal we treat as "fully saturated" (norm ≈ 100). Chosen from the
 * long-tail shape of each signal across typical Etsy keywords; calibratable in Phase 4.
 */
export interface NormScales {
  velocity: number; // aggregate recent-review count across top-N that reads as max demand
  faves: number; // aggregate num_favorers across top-N that reads as max engagement
  resultCount: number; // active-listing count that reads as a fully-served (max-size) market
}

// --- demandScore label thresholds (score 0-100 → low/medium/high) -----------
export interface DemandLabelThresholds {
  high: number; // score >= high → 'high'
  medium: number; // score >= medium (and < high) → 'medium'; else 'low'
}

// --- salesEstimate (§3.2) ---------------------------------------------------

/**
 * REVIEW_RATE: the fraction of buyers who leave a review, per top-level category (keyed by
 * Etsy taxonomy node id). monthlySales = reviewsPerMonth / REVIEW_RATE. Lower rate ⇒ each
 * review implies MORE hidden sales. Industry-reported review rates run ~10–30%
 * (02_alternatives §1.2, §4.4) — these are estimates of estimates; label loudly in the UI.
 *
 * Keys are placeholder taxonomy node ids for the §5.2 seed categories — Phase 4 corrects the
 * ids + rates against real own-shop data. `default` applies when categoryId is null/unknown.
 */
export interface ReviewRateConfig {
  default: number; // fallback review rate (PM/BA: ~0.15 when category unknown)
  byCategory: Record<number, number>; // taxonomy node id → review rate
}

/**
 * Confidence band multipliers (Q4). monthlySales is a point estimate; rangeLow/High give the
 * FE an optional ± band. Wide because the underlying review-rate is itself uncertain.
 */
export interface SalesBand {
  low: number; // monthlySales * low  = rangeLow
  high: number; // monthlySales * high = rangeHigh
}

// --- competitionLevel (§3.3) ------------------------------------------------
/** resultCount buckets. < lowMax → 'low'; < mediumMax → 'medium'; >= mediumMax → 'high'. */
export interface CompetitionBuckets {
  lowMax: number; // resultCount < lowMax → 'low'
  mediumMax: number; // lowMax <= resultCount < mediumMax → 'medium'; >= → 'high'
}

// --- trendDelta (§3.4) ------------------------------------------------------
/** pct-change thresholds. pct > up → 'up'; pct < down → 'down'; else 'stable'. */
export interface TrendThresholds {
  up: number; // percentage points above which a change reads as 'up'
  down: number; // percentage points below which a change reads as 'down' (negative)
}

// --- listingAudit (§4.1.1) --------------------------------------------------
/**
 * Rule-based listing-audit thresholds. All deterministic, no LLM. Each section scores 0-100
 * and emits clarity/seo feedback. Numbers mirror eRank/Marmalead-style Etsy SEO heuristics.
 */
export interface AuditConfig {
  title: {
    minLength: number; // below → too short to rank/describe
    maxLength: number; // Etsy hard cap is 140 chars; above is impossible/over-stuffed
    idealMin: number; // ideal title length window (descriptive + keyword-rich)
    idealMax: number;
  };
  tags: {
    max: number; // Etsy allows 13 tags; using all 13 is best practice
    good: number; // >= good tags → full marks
    maxTagLength: number; // Etsy per-tag cap is 20 chars
  };
  images: {
    ideal: number; // Etsy allows 10; >= ideal reads as a complete gallery
    min: number; // below → penalize heavily
  };
  description: {
    minLength: number; // below → thin description (poor SEO + clarity)
    idealLength: number; // >= idealLength → full marks
  };
}

export interface EstimationConfig {
  demandWeights: DemandWeights;
  normScales: NormScales;
  demandLabel: DemandLabelThresholds;
  reviewRate: ReviewRateConfig;
  salesBand: SalesBand;
  competition: CompetitionBuckets;
  trend: TrendThresholds;
  audit: AuditConfig;
}

/**
 * THE single calibration object. Mutable on purpose (Phase 4 override — see file header).
 * Functions in this module read it at call time.
 */
export const ESTIMATION_CONFIG: EstimationConfig = {
  // demandScore weights — sum = 1.0 (spec §3.1: velocity 0.55 + faves 0.25 + resultCount 0.20)
  demandWeights: {
    velocity: 0.55, // best REAL demand signal (reviews tied to transactions)
    faves: 0.25, // engagement proxy
    resultCount: 0.2, // market-exists / size proxy only (not demand itself)
  },

  // log-scale saturation points (norm(x) ≈ 100 at SCALE). Tuned to typical Etsy magnitudes.
  normScales: {
    velocity: 500, // ~500 aggregate recent reviews across top-N ⇒ saturated demand
    faves: 50000, // ~50k aggregate favorers across top-N ⇒ saturated engagement
    resultCount: 50000, // ~50k active listings ⇒ a fully-served (saturated) market
  },

  // score → label cutoffs (spec §3.1: high >=67, medium >=34, else low)
  demandLabel: {
    high: 67,
    medium: 34,
  },

  // review-rate per category (spec §3.2). Placeholder taxonomy ids for the seed set;
  // Phase 4 replaces ids + rates with real-data calibration.
  reviewRate: {
    default: 0.15, // unknown category fallback (BA-recommended)
    byCategory: {
      1: 0.18, // jewelry — buyers review more (physical, gift-heavy)
      2: 0.16, // home_decor
      3: 0.08, // digital_downloads — low review rate (instant, low engagement)
      4: 0.17, // art
      5: 0.15, // clothing
      6: 0.14, // party_supplies / paper_party
      7: 0.12, // stickers
      8: 0.13, // craft_supplies
    },
  },

  // sales confidence band (Q4) — wide, because review-rate itself is uncertain.
  salesBand: {
    low: 0.6, // rangeLow  = monthlySales * 0.6
    high: 1.7, // rangeHigh = monthlySales * 1.7
  },

  // competition buckets (spec §3.3: <1000 low, <20000 medium, >=20000 high)
  competition: {
    lowMax: 1000,
    mediumMax: 20000,
  },

  // trend thresholds (spec §3.4: > +3% up, < -3% down, else stable)
  trend: {
    up: 3,
    down: -3,
  },

  // listing-audit heuristics (spec §4.1.1)
  audit: {
    title: {
      minLength: 20, // shorter than ~20 chars is too thin to rank/describe
      maxLength: 140, // Etsy hard limit
      idealMin: 70, // descriptive, keyword-rich window
      idealMax: 140,
    },
    tags: {
      max: 13, // Etsy allows 13
      good: 13, // using all 13 = full marks
      maxTagLength: 20, // Etsy per-tag char cap
    },
    images: {
      ideal: 5, // >= 5 images reads as a complete gallery (Etsy allows 10)
      min: 1, // at least one image required to not be penalized to the floor
    },
    description: {
      minLength: 160, // below → thin description
      idealLength: 500, // >= 500 chars → full marks
    },
  },
};

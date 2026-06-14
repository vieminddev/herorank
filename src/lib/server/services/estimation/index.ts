/**
 * Estimation engine (Engineer G owns) — Layer 2, spec §3.
 *
 * SIX pure, deterministic functions that take ALREADY-FETCHED Layer-1 data (F's `Etsy*` types)
 * and return estimates. NO I/O, NO `fetch`, NO Etsy client import, NO Date.now() / randomness —
 * every output is a pure function of its inputs (so it is unit-testable in isolation, the
 * riskiest part of Phase 3).
 *
 * This module SATISFIES the `Estimation` interface declared in
 * `etsy/estimationContract.ts` (F's signature boundary). F flips `getEstimation()` there from
 * the placeholder to `import('../estimation')` once this lands — G does not edit that file.
 *
 * Honesty principle (spec §3): every number here is an ESTIMATE. Response shapes carry
 * `estimated` flags; the FE renders an "Estimated" badge. We never present these as official
 * Etsy figures.
 *
 * ALL coefficients/buckets/scales come from `./config` (BR-P3-EST-01) — no magic numbers here.
 */
import type { EtsyListing } from '$lib/server/services/etsy/types';
import type {
  DemandScoreInput,
  DemandScoreResult,
  SalesEstimateInput,
  SalesEstimateResult,
  TrendDeltaResult,
  RankEstimateInput,
  RankEstimateResult,
  ListingAuditResult,
  ListingAuditScoreSection,
  Estimation,
} from '$lib/server/services/etsy/estimationContract';
import type { CompetitionLabel, TrendDirection } from '$lib/server/services/etsy/types';
import type { ReviewRateProvider } from '$lib/server/services/calibration/reviewRateProvider';
import { ESTIMATION_CONFIG } from './config';

// ---------------------------------------------------------------------------
// Shared numeric helpers (pure)
// ---------------------------------------------------------------------------

/** Clamp x into [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Log-scale a long-tailed signal to 0-100. norm(0) = 0; norm(scale) ≈ 100; grows fast at the
 * low end (where small differences matter), flat near saturation. Negative/NaN inputs floor to 0.
 */
function normLog(x: number, scale: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (scale <= 0) return 0;
  const v = (100 * Math.log10(1 + x)) / Math.log10(1 + scale);
  return clamp(v, 0, 100);
}

/** Format a money amount into a compact display string ('$540', '$1.2K', '$3.4M'). */
function formatMoney(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  if (amount >= 1_000_000) return `$${trimDecimal(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${trimDecimal(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

/** One decimal place, trailing-zero-trimmed: 1.0 → '1', 1.2 → '1.2'. */
function trimDecimal(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

// ---------------------------------------------------------------------------
// 3.1 demandScore — weighted, log-scaled blend of three API signals → 0-100 + label
// ---------------------------------------------------------------------------

export function demandScore(input: DemandScoreInput): DemandScoreResult {
  const { demandWeights, normScales, demandLabel } = ESTIMATION_CONFIG;

  const vNorm = normLog(input.aggregateReviewVelocity, normScales.velocity);
  const fNorm = normLog(input.favoritesSignal, normScales.faves);
  const rNorm = normLog(input.resultCount, normScales.resultCount);

  const raw =
    demandWeights.velocity * vNorm +
    demandWeights.faves * fNorm +
    demandWeights.resultCount * rNorm;

  const score = clamp(Math.round(raw), 0, 100);
  const label =
    score >= demandLabel.high ? 'high' : score >= demandLabel.medium ? 'medium' : 'low';

  return { score, label };
}

// ---------------------------------------------------------------------------
// 3.2 salesEstimate — review-velocity ÷ category review-rate → monthly sales + revenue
// ---------------------------------------------------------------------------

export function salesEstimate(
  input: SalesEstimateInput,
  reviewRateProvider?: ReviewRateProvider
): SalesEstimateResult {
  const { reviewRate, salesBand } = ESTIMATION_CONFIG;

  const reviews90 = Number.isFinite(input.reviewsLast90d)
    ? Math.max(0, input.reviewsLast90d)
    : 0;
  const reviewsPerMonth = reviews90 / 3;

  // Only a fraction of buyers review → divide by the review rate to back out sales.
  //
  // Phase 4 calibration seam (BR-P4-CAL-01): if an injected provider returns a measured rate
  // for this category (it only does so when sample_size >= MIN_SAMPLE), use it. Otherwise the
  // provider returns null and we fall back to the Phase-3 config behaviour EXACTLY — so callers
  // that pass no provider are unaffected (backward compatible).
  const calibratedRate = reviewRateProvider?.(input.categoryId) ?? null;
  const rate =
    calibratedRate != null && calibratedRate > 0
      ? calibratedRate
      : input.categoryId != null && reviewRate.byCategory[input.categoryId] != null
        ? reviewRate.byCategory[input.categoryId]
        : reviewRate.default;

  const monthlySales = rate > 0 ? Math.round(reviewsPerMonth / rate) : 0;

  const price = Number.isFinite(input.avgPrice) ? Math.max(0, input.avgPrice) : 0;
  const monthlyRevenueAmount = monthlySales * price;

  return {
    monthlySales,
    monthlyRevenue: formatMoney(monthlyRevenueAmount),
    rangeLow: Math.round(monthlySales * salesBand.low),
    rangeHigh: Math.round(monthlySales * salesBand.high),
    estimated: true,
  };
}

// ---------------------------------------------------------------------------
// 3.3 competitionLevel — pure bucket on active-listing count
// ---------------------------------------------------------------------------

export function competitionLevel(resultCount: number): CompetitionLabel {
  const { competition } = ESTIMATION_CONFIG;
  const n = Number.isFinite(resultCount) ? resultCount : 0;
  if (n < competition.lowMax) return 'low';
  if (n < competition.mediumMax) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// 3.4 trendDelta — pct change between two demandScore snapshots → label + direction
// ---------------------------------------------------------------------------

export function trendDelta(current: number, prior: number | null): TrendDeltaResult {
  const { trend } = ESTIMATION_CONFIG;

  // Cold start: no prior snapshot → honest "building history" state.
  if (prior === null || !Number.isFinite(prior)) {
    return { change: '—', direction: 'stable' };
  }

  const cur = Number.isFinite(current) ? current : 0;
  // Division-by-zero guard: a 0 → N rise reads as a 100% baseline-relative move (prior floored to 1).
  const pct = ((cur - prior) / Math.max(prior, 1)) * 100;

  const direction: TrendDirection =
    pct > trend.up ? 'up' : pct < trend.down ? 'down' : 'stable';
  const rounded = Math.round(pct);
  const change = `${rounded >= 0 ? '+' : ''}${rounded}%`;

  return { change, direction };
}

// ---------------------------------------------------------------------------
// 3.5 rankEstimate — 1-based index of the target listing in the ordered window
// ---------------------------------------------------------------------------

export function rankEstimate(input: RankEstimateInput): RankEstimateResult {
  const idx = input.orderedListingIds.indexOf(input.targetListingId);
  return { position: idx === -1 ? null : idx + 1 };
}

// ---------------------------------------------------------------------------
// 4.1.1 listingAudit — deterministic, rule-based SEO/clarity audit (NO LLM)
// ---------------------------------------------------------------------------

type FeedbackStatus = 'good' | 'warning' | 'error';
type FeedbackItem = { status: FeedbackStatus; text: string };

function section(
  score: number,
  clarity: FeedbackItem[],
  seo: FeedbackItem[]
): ListingAuditScoreSection {
  return { score: clamp(Math.round(score), 0, 100), feedback: { clarity, seo } };
}

function auditTitle(title: string): ListingAuditScoreSection {
  const { title: cfg } = ESTIMATION_CONFIG.audit;
  const t = (title ?? '').trim();
  const len = t.length;
  const clarity: FeedbackItem[] = [];
  const seo: FeedbackItem[] = [];
  let score = 100;

  if (len === 0) {
    return section(0, [{ status: 'error', text: 'Title is empty.' }], [
      { status: 'error', text: 'No title means no keyword coverage — buyers cannot find this listing.' },
    ]);
  }

  if (len < cfg.minLength) {
    score -= 40;
    clarity.push({ status: 'error', text: `Title is very short (${len} chars) — add detail.` });
    seo.push({ status: 'error', text: 'Too short to hold long-tail keywords buyers search for.' });
  } else if (len < cfg.idealMin) {
    score -= 20;
    seo.push({
      status: 'warning',
      text: `Title is ${len} chars — aim for ${cfg.idealMin}-${cfg.idealMax} to cover more keywords.`,
    });
  } else if (len > cfg.maxLength) {
    score -= 30;
    clarity.push({ status: 'error', text: `Title exceeds Etsy's ${cfg.maxLength}-char limit.` });
  } else {
    clarity.push({ status: 'good', text: 'Title length is in the ideal range.' });
    seo.push({ status: 'good', text: 'Good length for keyword coverage.' });
  }

  // Delimiter usage helps Etsy parse distinct phrases.
  if (/[,|·\-–—]/.test(t)) {
    seo.push({ status: 'good', text: 'Uses delimiters to separate keyword phrases.' });
  } else if (len >= cfg.idealMin) {
    score -= 10;
    seo.push({
      status: 'warning',
      text: 'No delimiters (comma/pipe) — separate keyword phrases for better parsing.',
    });
  }

  return section(score, clarity, seo);
}

function auditTags(tags: string[]): ListingAuditScoreSection {
  const { tags: cfg } = ESTIMATION_CONFIG.audit;
  const list = Array.isArray(tags) ? tags.filter((x) => typeof x === 'string' && x.trim()) : [];
  const count = list.length;
  const clarity: FeedbackItem[] = [];
  const seo: FeedbackItem[] = [];
  let score = 100;

  if (count === 0) {
    return section(0, [{ status: 'error', text: 'No tags set.' }], [
      { status: 'error', text: `Add up to ${cfg.max} tags — tags are a primary Etsy ranking signal.` },
    ]);
  }

  if (count < cfg.good) {
    // Penalize proportionally to the unused-tag gap (each of 13 slots is a ranking opportunity).
    const missing = cfg.max - count;
    score -= Math.min(60, missing * (60 / cfg.max));
    seo.push({
      status: count >= cfg.max - 3 ? 'warning' : 'error',
      text: `Using ${count} of ${cfg.max} tags — fill all ${cfg.max} to maximize keyword reach.`,
    });
  } else {
    seo.push({ status: 'good', text: `All ${cfg.max} tags used — full keyword coverage.` });
  }

  const longTags = list.filter((x) => x.trim().length > cfg.maxTagLength);
  if (longTags.length > 0) {
    score -= 10;
    clarity.push({
      status: 'warning',
      text: `${longTags.length} tag(s) exceed ${cfg.maxTagLength} chars and may be rejected.`,
    });
  } else {
    clarity.push({ status: 'good', text: 'All tags are within the length limit.' });
  }

  return section(score, clarity, seo);
}

function auditImages(images: EtsyListing['images']): ListingAuditScoreSection {
  const { images: cfg } = ESTIMATION_CONFIG.audit;
  const count = Array.isArray(images) ? images.length : 0;
  const clarity: FeedbackItem[] = [];
  const seo: FeedbackItem[] = [];
  let score = 100;

  if (count === 0) {
    return section(0, [{ status: 'error', text: 'No images on this listing.' }], [
      { status: 'warning', text: 'Listings with photos convert far better — add several angles.' },
    ]);
  }

  if (count < cfg.ideal) {
    // Scale the floor up toward 100 as count approaches the ideal.
    score = 40 + Math.round((60 * (count - cfg.min)) / (cfg.ideal - cfg.min));
    clarity.push({
      status: count <= cfg.min ? 'error' : 'warning',
      text: `Only ${count} image(s) — aim for ${cfg.ideal}+ (angles, scale, in-use).`,
    });
  } else {
    clarity.push({ status: 'good', text: `${count} images — a complete gallery.` });
  }
  seo.push({ status: 'good', text: 'Images do not directly affect search but drive click-through.' });

  return section(score, clarity, seo);
}

function auditVideo(videos: EtsyListing['videos']): ListingAuditScoreSection {
  const hasVideo = Array.isArray(videos) && videos.length > 0;
  if (hasVideo) {
    return section(
      100,
      [{ status: 'good', text: 'Listing includes a video.' }],
      [{ status: 'good', text: 'Video boosts engagement and dwell time.' }]
    );
  }
  return section(
    0,
    [{ status: 'warning', text: 'No video — add a short clip to stand out.' }],
    [{ status: 'warning', text: 'Listings with video tend to convert better.' }]
  );
}

function auditDescription(description: string): ListingAuditScoreSection {
  const { description: cfg } = ESTIMATION_CONFIG.audit;
  const d = (description ?? '').trim();
  const len = d.length;
  const clarity: FeedbackItem[] = [];
  const seo: FeedbackItem[] = [];
  let score = 100;

  if (len === 0) {
    return section(0, [{ status: 'error', text: 'Description is empty.' }], [
      { status: 'error', text: 'Add a keyword-rich description — it supports search and clarity.' },
    ]);
  }

  if (len < cfg.minLength) {
    score -= 40;
    clarity.push({
      status: 'error',
      text: `Description is thin (${len} chars) — add materials, sizing, and use cases.`,
    });
    seo.push({ status: 'warning', text: 'Short descriptions carry few keywords for context.' });
  } else if (len < cfg.idealLength) {
    score -= 15;
    clarity.push({
      status: 'warning',
      text: `Description is ${len} chars — expand toward ${cfg.idealLength}+ for full detail.`,
    });
  } else {
    clarity.push({ status: 'good', text: 'Description is detailed.' });
    seo.push({ status: 'good', text: 'Rich description supports keyword context.' });
  }

  // First-line front-loading: a strong opening line carries SEO and the listing preview.
  const firstLine = d.split('\n')[0]?.trim() ?? '';
  if (firstLine.length >= 40) {
    seo.push({ status: 'good', text: 'Opening line front-loads detail for the preview snippet.' });
  } else if (len >= cfg.minLength) {
    score -= 10;
    seo.push({
      status: 'warning',
      text: 'Lead with a descriptive, keyword-rich first line (it shows in the preview).',
    });
  }

  return section(score, clarity, seo);
}

export function listingAudit(listing: EtsyListing): ListingAuditResult {
  return {
    title: auditTitle(listing.title ?? ''),
    tags: auditTags(listing.tags ?? []),
    images: auditImages(listing.images),
    video: auditVideo(listing.videos),
    description: auditDescription(listing.description ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Aggregate surface — satisfies the `Estimation` interface F consumes.
// ---------------------------------------------------------------------------

/** Type-level assurance that the named exports collectively satisfy F's `Estimation` contract. */
export const estimation: Estimation = {
  demandScore,
  salesEstimate,
  competitionLevel,
  trendDelta,
  rankEstimate,
  listingAudit,
};

export default estimation;

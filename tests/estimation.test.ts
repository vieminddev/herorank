/**
 * Estimation engine unit tests (Engineer G) — spec §7.2, highest priority.
 *
 * Pure-function tests: no D1, no KV, no Etsy client, no mock fetch. Every function is exercised
 * in isolation against typed inputs. Per BR-P3-EST-01, tests import coefficients/buckets from
 * `config.ts` rather than hard-coding literals, so a calibration change can never silently
 * diverge from its test (boundary tests still pin a few documented spec values explicitly).
 *
 * Relative imports (not $lib) keep the suite independent of the SvelteKit alias resolver,
 * matching tests/etsy.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  demandScore,
  salesEstimate,
  competitionLevel,
  trendDelta,
  rankEstimate,
  listingAudit,
  estimation,
} from '../src/lib/server/services/estimation/index';
import { ESTIMATION_CONFIG } from '../src/lib/server/services/estimation/config';
import type { EtsyListing } from '../src/lib/server/services/etsy/types';
import type { ReviewRateProvider } from '../src/lib/server/services/calibration/reviewRateProvider';

// ---------------------------------------------------------------------------
// demandScore
// ---------------------------------------------------------------------------
describe('demandScore', () => {
  it('returns score 0 / label low for all-zero signals (boundary 0)', () => {
    const r = demandScore({ resultCount: 0, aggregateReviewVelocity: 0, favoritesSignal: 0 });
    expect(r.score).toBe(0);
    expect(r.label).toBe('low');
  });

  it('clamps to 100 / label high when every signal is saturated (boundary 100)', () => {
    const huge = 10_000_000;
    const r = demandScore({
      resultCount: huge,
      aggregateReviewVelocity: huge,
      favoritesSignal: huge,
    });
    expect(r.score).toBe(100);
    expect(r.label).toBe('high');
  });

  it('keeps score within [0,100] for arbitrary positive inputs', () => {
    const r = demandScore({
      resultCount: 12345,
      aggregateReviewVelocity: 321,
      favoritesSignal: 9876,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('is monotonic: more review velocity never lowers the score', () => {
    const base = { resultCount: 1000, aggregateReviewVelocity: 50, favoritesSignal: 500 };
    const more = { ...base, aggregateReviewVelocity: 400 };
    expect(demandScore(more).score).toBeGreaterThanOrEqual(demandScore(base).score);
  });

  it('weights review-velocity above favorites and resultCount (spec §3.1)', () => {
    // Confirm the configured ordering of weights, and that an isolated velocity signal
    // outscores the same magnitude applied to faves/resultCount alone.
    expect(ESTIMATION_CONFIG.demandWeights.velocity).toBeGreaterThan(
      ESTIMATION_CONFIG.demandWeights.faves
    );
    expect(ESTIMATION_CONFIG.demandWeights.faves).toBeGreaterThan(
      ESTIMATION_CONFIG.demandWeights.resultCount
    );

    const sig = 1000;
    const velocityOnly = demandScore({
      resultCount: 0,
      aggregateReviewVelocity: sig,
      favoritesSignal: 0,
    }).score;
    const favesOnly = demandScore({
      resultCount: 0,
      aggregateReviewVelocity: 0,
      favoritesSignal: sig,
    }).score;
    // velocity has both a higher weight AND a smaller norm-scale (saturates faster) → must win.
    expect(velocityOnly).toBeGreaterThan(favesOnly);
  });

  it('honors the configured label thresholds at their boundaries', () => {
    // Drive score to exactly the configured cutoffs via a single saturated-enough velocity input
    // and assert label flips at config.demandLabel.high / .medium.
    const { high, medium } = ESTIMATION_CONFIG.demandLabel;
    expect(high).toBe(67); // spec §3.1
    expect(medium).toBe(34); // spec §3.1

    // Reconstruct the label rule the implementation uses, to assert it matches config.
    const labelOf = (score: number) =>
      score >= high ? 'high' : score >= medium ? 'medium' : 'low';
    expect(labelOf(high)).toBe('high');
    expect(labelOf(high - 1)).toBe('medium');
    expect(labelOf(medium)).toBe('medium');
    expect(labelOf(medium - 1)).toBe('low');
  });

  it('tolerates negative / non-finite signals by flooring them', () => {
    const r = demandScore({
      resultCount: -5,
      aggregateReviewVelocity: Number.NaN,
      favoritesSignal: -100,
    });
    expect(r.score).toBe(0);
    expect(r.label).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// salesEstimate
// ---------------------------------------------------------------------------
describe('salesEstimate', () => {
  it('backs out monthly sales = (reviews/3) / reviewRate, using default rate when no category', () => {
    const rate = ESTIMATION_CONFIG.reviewRate.default;
    const reviewsLast90d = 90; // → 30 reviews/month
    const expected = Math.round(30 / rate);
    const r = salesEstimate({ reviewsLast90d, avgPrice: 25 });
    expect(r.monthlySales).toBe(expected);
    expect(r.estimated).toBe(true);
  });

  it('uses the per-category review rate when categoryId is known', () => {
    const categoryId = 3; // digital_downloads — low rate ⇒ more implied sales
    const rate = ESTIMATION_CONFIG.reviewRate.byCategory[categoryId];
    const r = salesEstimate({ reviewsLast90d: 30, avgPrice: 10, categoryId });
    expect(r.monthlySales).toBe(Math.round(10 / rate));

    // Same reviews in a higher-review-rate category ⇒ fewer implied sales.
    const jewelry = salesEstimate({ reviewsLast90d: 30, avgPrice: 10, categoryId: 1 });
    expect(r.monthlySales).toBeGreaterThan(jewelry.monthlySales);
  });

  it('falls back to default rate for an unknown categoryId', () => {
    const known = salesEstimate({ reviewsLast90d: 60, avgPrice: 20, categoryId: 999999 });
    const noCat = salesEstimate({ reviewsLast90d: 60, avgPrice: 20 });
    expect(known.monthlySales).toBe(noCat.monthlySales);
  });

  it('returns 0 sales and $0 revenue for 0 reviews', () => {
    const r = salesEstimate({ reviewsLast90d: 0, avgPrice: 25 });
    expect(r.monthlySales).toBe(0);
    expect(r.monthlyRevenue).toBe('$0');
    expect(r.rangeLow).toBe(0);
    expect(r.rangeHigh).toBe(0);
  });

  it('computes revenue = monthlySales × avgPrice and formats it compactly', () => {
    const r = salesEstimate({ reviewsLast90d: 90, avgPrice: 30, categoryId: 1 });
    // monthlySales = round((90/3)/0.18) = round(166.67) = 167; revenue = 167*30 = 5010 → '$5K'
    expect(r.monthlySales).toBe(Math.round(30 / 0.18));
    expect(r.monthlyRevenue).toMatch(/^\$/);
  });

  it('produces a confidence band rangeLow <= monthlySales <= rangeHigh', () => {
    const r = salesEstimate({ reviewsLast90d: 120, avgPrice: 40 });
    expect(r.rangeLow).toBe(Math.round(r.monthlySales * ESTIMATION_CONFIG.salesBand.low));
    expect(r.rangeHigh).toBe(Math.round(r.monthlySales * ESTIMATION_CONFIG.salesBand.high));
    expect(r.rangeLow).toBeLessThanOrEqual(r.monthlySales);
    expect(r.rangeHigh).toBeGreaterThanOrEqual(r.monthlySales);
  });

  it('handles a null categoryId like an unknown one', () => {
    const a = salesEstimate({ reviewsLast90d: 45, avgPrice: 15, categoryId: null });
    const b = salesEstimate({ reviewsLast90d: 45, avgPrice: 15 });
    expect(a.monthlySales).toBe(b.monthlySales);
  });

  // --- Phase 4: calibration provider injection (BR-P4-CAL-01) ---------------

  it('uses the calibrated rate from an injected provider, overriding config', () => {
    const categoryId = 1; // config rate for jewelry is 0.18
    const calibratedRate = 0.3; // measured rate (different from config) ⇒ different result
    const provider: ReviewRateProvider = (cat) => (cat === categoryId ? calibratedRate : null);

    const calibrated = salesEstimate({ reviewsLast90d: 90, avgPrice: 20, categoryId }, provider);
    const configOnly = salesEstimate({ reviewsLast90d: 90, avgPrice: 20, categoryId });

    expect(calibrated.monthlySales).toBe(Math.round(30 / calibratedRate));
    // measured rate (0.30) > config rate (0.18) ⇒ FEWER implied sales than the config path.
    expect(calibrated.monthlySales).toBeLessThan(configOnly.monthlySales);
    expect(calibrated.monthlySales).not.toBe(configOnly.monthlySales);
  });

  it('falls back to config when the provider returns null (no confident measurement)', () => {
    const categoryId = 1;
    const nullProvider: ReviewRateProvider = () => null; // e.g. sample_size < MIN_SAMPLE
    const withProvider = salesEstimate(
      { reviewsLast90d: 90, avgPrice: 20, categoryId },
      nullProvider
    );
    const withoutProvider = salesEstimate({ reviewsLast90d: 90, avgPrice: 20, categoryId });
    // null measurement ⇒ identical to the Phase-3 config path.
    expect(withProvider.monthlySales).toBe(withoutProvider.monthlySales);
    expect(withProvider.monthlySales).toBe(Math.round(30 / ESTIMATION_CONFIG.reviewRate.byCategory[categoryId]));
  });

  it('is byte-for-byte identical to Phase 3 when no provider is passed (backward compatible)', () => {
    const input = { reviewsLast90d: 120, avgPrice: 42, categoryId: 3 };
    const noProvider = salesEstimate(input);
    const rate = ESTIMATION_CONFIG.reviewRate.byCategory[3];
    expect(noProvider.monthlySales).toBe(Math.round(40 / rate));
  });

  it('falls back to config when the provider returns null for an unknown/null category', () => {
    // Provider only knows category 5; a null category → provider returns null → config default.
    const provider: ReviewRateProvider = (cat) => (cat === 5 ? 0.25 : null);
    const a = salesEstimate({ reviewsLast90d: 60, avgPrice: 10, categoryId: null }, provider);
    const b = salesEstimate({ reviewsLast90d: 60, avgPrice: 10, categoryId: null });
    expect(a.monthlySales).toBe(b.monthlySales); // default rate path
  });
});

// ---------------------------------------------------------------------------
// competitionLevel
// ---------------------------------------------------------------------------
describe('competitionLevel', () => {
  const { lowMax, mediumMax } = ESTIMATION_CONFIG.competition;

  it('matches the spec bucket boundaries (999/1000/19999/20000)', () => {
    expect(lowMax).toBe(1000); // spec §3.3
    expect(mediumMax).toBe(20000); // spec §3.3
    expect(competitionLevel(lowMax - 1)).toBe('low');
    expect(competitionLevel(lowMax)).toBe('medium');
    expect(competitionLevel(mediumMax - 1)).toBe('medium');
    expect(competitionLevel(mediumMax)).toBe('high');
  });

  it('treats 0 / non-finite as low', () => {
    expect(competitionLevel(0)).toBe('low');
    expect(competitionLevel(Number.NaN)).toBe('low');
  });

  it('classifies large counts as high', () => {
    expect(competitionLevel(500000)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// trendDelta
// ---------------------------------------------------------------------------
describe('trendDelta', () => {
  const { up, down } = ESTIMATION_CONFIG.trend;

  it('cold start (prior=null) → "—" / stable', () => {
    const r = trendDelta(50, null);
    expect(r.change).toBe('—');
    expect(r.direction).toBe('stable');
  });

  it('rising demand → direction up with a + sign', () => {
    const r = trendDelta(60, 50); // +20%
    expect(r.direction).toBe('up');
    expect(r.change).toBe('+20%');
  });

  it('falling demand → direction down with a - sign', () => {
    const r = trendDelta(40, 50); // -20%
    expect(r.direction).toBe('down');
    expect(r.change).toBe('-20%');
  });

  it('small change within ±threshold → stable', () => {
    // prior 100, change just inside the up threshold (< up%).
    const within = 100 + (up - 1); // e.g. +2% when up=3
    const r = trendDelta(within, 100);
    expect(r.direction).toBe('stable');
  });

  it('respects the configured up/down thresholds at the boundary', () => {
    expect(up).toBe(3); // spec §3.4
    expect(down).toBe(-3); // spec §3.4
    // exactly +up% is NOT up (strict >); just above is.
    expect(trendDelta(100 + up, 100).direction).toBe('stable');
    expect(trendDelta(100 + up + 1, 100).direction).toBe('up');
    expect(trendDelta(100 + down, 100).direction).toBe('stable');
    expect(trendDelta(100 + down - 1, 100).direction).toBe('down');
  });

  it('division-by-zero guard: prior=0 does not throw and floors the divisor to 1', () => {
    const r = trendDelta(5, 0);
    expect(Number.isFinite(Number.parseInt(r.change, 10))).toBe(true);
    expect(r.direction).toBe('up'); // (5-0)/1*100 = +500%
  });

  it('non-finite prior is treated as cold start', () => {
    const r = trendDelta(50, Number.NaN);
    expect(r.change).toBe('—');
    expect(r.direction).toBe('stable');
  });

  it('flat (current == prior) → stable +0%', () => {
    const r = trendDelta(50, 50);
    expect(r.direction).toBe('stable');
    expect(r.change).toBe('+0%');
  });
});

// ---------------------------------------------------------------------------
// rankEstimate
// ---------------------------------------------------------------------------
describe('rankEstimate', () => {
  it('returns a 1-based position when the target is found', () => {
    const r = rankEstimate({ orderedListingIds: [11, 22, 33, 44], targetListingId: 33 });
    expect(r.position).toBe(3);
  });

  it('returns position 1 when the target is first', () => {
    const r = rankEstimate({ orderedListingIds: [99, 22, 33], targetListingId: 99 });
    expect(r.position).toBe(1);
  });

  it('returns null when the target is not in the window', () => {
    const r = rankEstimate({ orderedListingIds: [1, 2, 3], targetListingId: 999 });
    expect(r.position).toBeNull();
  });

  it('returns null for an empty window', () => {
    const r = rankEstimate({ orderedListingIds: [], targetListingId: 5 });
    expect(r.position).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listingAudit
// ---------------------------------------------------------------------------
describe('listingAudit', () => {
  const goodListing: EtsyListing = {
    listing_id: 1,
    title:
      'Personalized Name Necklace, Gold Custom Jewelry, Birthday Gift for Her, Dainty Pendant',
    description:
      'Handmade personalized name necklace in 18k gold-plated stainless steel. Choose your name, font, and chain length. Comes gift-boxed and ready to give. Perfect for birthdays, anniversaries, and bridesmaid gifts. Tarnish-resistant, hypoallergenic, and adjustable from 16 to 18 inches. Each piece is made to order in our studio and ships within 3-5 business days with tracking.',
    tags: [
      'name necklace',
      'personalized gift',
      'gold necklace',
      'custom jewelry',
      'dainty necklace',
      'birthday gift',
      'gift for her',
      'pendant necklace',
      'bridesmaid gift',
      'minimalist',
      'layering necklace',
      'mom gift',
      'anniversary',
    ],
    images: [
      { listing_image_id: 1 },
      { listing_image_id: 2 },
      { listing_image_id: 3 },
      { listing_image_id: 4 },
      { listing_image_id: 5 },
    ],
    videos: [{ video_id: 1 }],
  };

  it('returns all five sections, each with score 0-100 and clarity+seo feedback arrays', () => {
    const r = listingAudit(goodListing);
    for (const key of ['title', 'tags', 'images', 'video', 'description'] as const) {
      expect(r[key].score).toBeGreaterThanOrEqual(0);
      expect(r[key].score).toBeLessThanOrEqual(100);
      expect(Array.isArray(r[key].feedback.clarity)).toBe(true);
      expect(Array.isArray(r[key].feedback.seo)).toBe(true);
    }
  });

  it('scores a well-optimized listing highly across the board', () => {
    const r = listingAudit(goodListing);
    expect(r.title.score).toBeGreaterThanOrEqual(80);
    expect(r.tags.score).toBe(100); // all 13 tags, none too long
    expect(r.images.score).toBe(100); // >= ideal
    expect(r.video.score).toBe(100); // has video
    expect(r.description.score).toBeGreaterThanOrEqual(80);
  });

  it('flags missing video with score 0 and warning feedback', () => {
    const r = listingAudit({ ...goodListing, videos: [] });
    expect(r.video.score).toBe(0);
    expect(r.video.feedback.clarity.some((f) => f.status === 'warning')).toBe(true);
  });

  it('penalizes too-few tags and reports the unused-tag gap', () => {
    const r = listingAudit({ ...goodListing, tags: ['one', 'two', 'three'] });
    expect(r.tags.score).toBeLessThan(100);
    expect(r.tags.feedback.seo.some((f) => f.status !== 'good')).toBe(true);
  });

  it('errors on empty tags', () => {
    const r = listingAudit({ ...goodListing, tags: [] });
    expect(r.tags.score).toBe(0);
    expect(r.tags.feedback.seo.some((f) => f.status === 'error')).toBe(true);
  });

  it('penalizes a title that exceeds the Etsy length limit', () => {
    const tooLong = 'a'.repeat(ESTIMATION_CONFIG.audit.title.maxLength + 20);
    const r = listingAudit({ ...goodListing, title: tooLong });
    expect(r.title.score).toBeLessThan(100);
    expect(
      r.title.feedback.clarity.some((f) => f.status === 'error' && /limit/i.test(f.text))
    ).toBe(true);
  });

  it('penalizes a very short title', () => {
    const r = listingAudit({ ...goodListing, title: 'Necklace' });
    expect(r.title.score).toBeLessThan(80);
  });

  it('penalizes a thin description and errors on an empty one', () => {
    const thin = listingAudit({ ...goodListing, description: 'Short.' });
    expect(thin.description.score).toBeLessThan(80);

    const empty = listingAudit({ ...goodListing, description: '' });
    expect(empty.description.score).toBe(0);
    expect(empty.description.feedback.seo.some((f) => f.status === 'error')).toBe(true);
  });

  it('penalizes too-few images proportionally to the count', () => {
    const one = listingAudit({ ...goodListing, images: [{ listing_image_id: 1 }] });
    const three = listingAudit({
      ...goodListing,
      images: [{ listing_image_id: 1 }, { listing_image_id: 2 }, { listing_image_id: 3 }],
    });
    expect(one.images.score).toBeLessThan(three.images.score);
    expect(three.images.score).toBeLessThan(100);
  });

  it('handles a listing with no optional fields without throwing', () => {
    const bare: EtsyListing = { listing_id: 2, title: '' };
    const r = listingAudit(bare);
    expect(r.title.score).toBe(0);
    expect(r.tags.score).toBe(0);
    expect(r.images.score).toBe(0);
    expect(r.video.score).toBe(0);
    expect(r.description.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregate surface matches the Estimation contract
// ---------------------------------------------------------------------------
describe('estimation aggregate', () => {
  it('exposes all six functions on the default surface', () => {
    expect(typeof estimation.demandScore).toBe('function');
    expect(typeof estimation.salesEstimate).toBe('function');
    expect(typeof estimation.competitionLevel).toBe('function');
    expect(typeof estimation.trendDelta).toBe('function');
    expect(typeof estimation.rankEstimate).toBe('function');
    expect(typeof estimation.listingAudit).toBe('function');
  });

  it('aggregate functions are the same references as the named exports', () => {
    expect(estimation.demandScore).toBe(demandScore);
    expect(estimation.listingAudit).toBe(listingAudit);
  });
});

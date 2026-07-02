/**
 * Cron-collected data pass-through contract (best-sellers + etsy-trends).
 *
 * The /best-sellers and /etsy-trends route handlers serve a cached KV payload by SPREADING it
 * into the response (`{ ...cached.payload, ... }`), and /etsy-trends additionally runs the rows
 * through `applyTrendFilter` (spread filter) + `enrichWithForecasts` (`{ ...row, forecast }`).
 *
 * These tests pin the contract the FE relies on: the NEW optional cron fields on BestSellerRow /
 * TrendRow survive a spread-based reshape unchanged, and stay absent (not coerced to anything)
 * on legacy payloads that never carried them. They are pure shape tests — no HTTP/KV/auth — so
 * they document the invariant without depending on the route's private helpers.
 */
import { describe, it, expect } from 'vitest';
import type {
  BestSellerRow,
  BestSellersResponse,
  TrendRow,
  EtsyTrendsResponse,
} from '../src/lib/server/services/etsy/types';

// Mirror of the handlers' spread reshape (envelope flags merged last).
const reshapeBestSellers = (payload: BestSellersResponse): BestSellersResponse => ({
  ...payload,
  cached: true,
  stale: false,
});
const filterAndForecast = (payload: EtsyTrendsResponse): EtsyTrendsResponse => ({
  ...payload,
  filter: null,
  trends: payload.trends
    .filter((t) => t.keyword.includes('')) // applyTrendFilter-style spread filter (keeps all)
    .map((row) => ({ ...row, forecast: row.forecast })), // enrichWithForecasts-style row spread
});

describe('best-sellers — real cron sales fields survive pass-through', () => {
  it('forwards soldCount / soldPerWeek / confidence unchanged', () => {
    const row: BestSellerRow = {
      rank: 1,
      name: 'CaitlynMinimalist',
      country: 'United States',
      countryCode: 'US',
      rating: 4.9,
      opened: '2017',
      listings: 6000,
      faves: 1_200_000,
      sales: 50_000, // estimated
      soldCount: 100_995, // REAL lifetime
      soldPerWeek: 320, // REAL velocity
      soldVelocityConfidence: 'high',
    };
    const out = reshapeBestSellers({
      cached: false,
      category: 'Jewelry',
      view: 'shops',
      shops: [row],
      estimated: { sales: true, ranking: true },
    });
    const s = out.shops[0];
    expect(s.soldCount).toBe(100_995);
    expect(s.soldPerWeek).toBe(320);
    expect(s.soldVelocityConfidence).toBe('high');
  });

  it('leaves the real fields ABSENT on legacy rows (back-compat, not coerced)', () => {
    const legacy: BestSellerRow = {
      rank: 1,
      name: 'OldShop',
      country: 'United States',
      countryCode: 'US',
      rating: 4.8,
      opened: '2015',
      listings: 100,
      faves: 500,
      sales: 1000,
    };
    const out = reshapeBestSellers({
      cached: false,
      category: null,
      view: 'shops',
      shops: [legacy],
      estimated: { sales: true, ranking: true },
    });
    expect('soldCount' in out.shops[0]).toBe(false);
    expect(out.shops[0].soldPerWeek).toBeUndefined();
  });
});

describe('etsy-trends — Nhịp A market fields survive filter + forecast spread', () => {
  it('forwards price percentiles / newListings7d / whitespace unchanged', () => {
    const row: TrendRow = {
      keyword: 'personalized necklace',
      category: 'Jewelry',
      demandIndex: 72,
      trend: 'up',
      change: '+12%',
      priceMedian: 3200,
      priceP25: 1650,
      priceP75: 5000,
      medianViews: 560,
      hasVariationsPct: 88,
      newListings7d: 140,
      whitespace: 64,
      estimated: { demandIndex: true, change: true },
    };
    const out = filterAndForecast({
      cached: true,
      filter: null,
      trends: [row],
      buildingHistory: false,
    });
    const t = out.trends[0];
    expect(t.priceP25).toBe(1650);
    expect(t.priceMedian).toBe(3200);
    expect(t.priceP75).toBe(5000);
    expect(t.newListings7d).toBe(140);
    expect(t.whitespace).toBe(64);
  });

  it('leaves market fields ABSENT on legacy rows (renders as — on FE)', () => {
    const legacy: TrendRow = {
      keyword: 'minimalist ring',
      category: 'Jewelry',
      demandIndex: 40,
      trend: 'stable',
      change: '—',
      estimated: { demandIndex: true, change: true },
    };
    const out = filterAndForecast({
      cached: true,
      filter: null,
      trends: [legacy],
      buildingHistory: true,
    });
    expect(out.trends[0].priceP25).toBeUndefined();
    expect(out.trends[0].whitespace).toBeUndefined();
    expect('newListings7d' in out.trends[0]).toBe(false);
  });
});

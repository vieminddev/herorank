/**
 * Focused unit tests for the listing-analyzer sales-optimization enrichment (Engineer F).
 *
 * These exercise the PURE builder fns the `/listing-analyzer` route uses to turn the richer
 * Etsy listing object (real lifetime views, handling days, inventory, category attribute
 * catalog) into actionable signals. Fully hermetic — no client, no D1/KV, no estimation stub.
 */
import { describe, it, expect } from 'vitest';
import {
  buildViewsInsight,
  buildShippingInsight,
  buildAttributeCompleteness,
  buildVariationInsight,
} from '../src/lib/server/api/routes/etsy-tools';
import type { EtsyListing, EtsyTaxonomyProperty } from '../src/lib/server/services/etsy/types';

describe('buildViewsInsight', () => {
  it('computes an estimated conversion % from sales ÷ lifetime views', () => {
    const r = buildViewsInsight(1000, 30);
    expect(r.views).toBe(1000);
    expect(r.conversionRatePct).toBe(3); // 30/1000 = 3%
    expect(r.note).toBeNull();
  });

  it('returns null conversion + an honest note when views are 0 (guard divide-by-zero)', () => {
    const r = buildViewsInsight(0, 30);
    expect(r.conversionRatePct).toBeNull();
    expect(r.note).toMatch(/no lifetime view data/i);
  });

  it('returns null conversion + a note when there is no sales signal', () => {
    const r = buildViewsInsight(1000, 0);
    expect(r.conversionRatePct).toBeNull();
    expect(r.note).toMatch(/no sales signal/i);
  });
});

describe('buildShippingInsight', () => {
  it('rates ≤3 day handling as fast', () => {
    const r = buildShippingInsight(1, 3);
    expect(r?.verdict).toBe('fast');
    expect(r?.label).toBe('1–3 business days');
  });

  it('rates 4–7 day handling as average', () => {
    expect(buildShippingInsight(5, 7)?.verdict).toBe('average');
  });

  it('rates >7 day handling as slow', () => {
    expect(buildShippingInsight(10, 14)?.verdict).toBe('slow');
  });

  it('returns null when no processing data is present', () => {
    expect(buildShippingInsight(undefined, undefined)).toBeNull();
  });
});

describe('buildAttributeCompleteness', () => {
  const catalog: EtsyTaxonomyProperty[] = [
    { property_id: 200, name: 'Primary color', display_name: 'Primary color', is_required: false, possible_values: [{ name: 'Black' }] },
    { property_id: 201, name: 'Material', display_name: 'Material', is_required: true, possible_values: [{ name: 'Cotton' }] },
    { property_id: 202, name: 'Occasion', display_name: 'Occasion', is_required: false, possible_values: [{ name: 'Birthday' }] },
  ];

  it('reports the catalog gap and a completeness %', () => {
    const listing = {
      taxonomy_id: 1,
      inventory: {
        products: [
          { property_values: [{ property_id: 200, property_name: 'Primary color', values: ['Black'] }] },
        ],
      },
    } as unknown as EtsyListing;
    const r = buildAttributeCompleteness(catalog, listing);
    expect(r?.filledAttributes).toEqual(['Primary color']);
    expect(r?.missingAttributes).toEqual(['Material', 'Occasion']);
    expect(r?.missingRequired).toEqual(['Material']); // required + not covered
    expect(r?.completenessPct).toBe(33); // 1 of 3
  });

  it('counts core attributes (materials) as covering the catalog Material property', () => {
    const listing = { taxonomy_id: 1, materials: ['Cotton'] } as unknown as EtsyListing;
    const r = buildAttributeCompleteness(catalog, listing);
    expect(r?.filledAttributes).toContain('Material');
    expect(r?.missingRequired).toEqual([]); // Material now covered
  });

  it('returns null for an empty catalog (no taxonomy properties)', () => {
    expect(buildAttributeCompleteness([], {} as EtsyListing)).toBeNull();
  });
});

describe('buildVariationInsight', () => {
  const money = (amount: number) => ({ amount, divisor: 100, currency_code: 'USD' });

  it('summarizes variation count + min/max/spread of enabled offering prices', () => {
    const listing = {
      has_variations: true,
      inventory: {
        products: [
          { offerings: [{ is_enabled: true, price: money(1000) }] },
          { offerings: [{ is_enabled: true, price: money(2500) }] },
        ],
      },
    } as unknown as EtsyListing;
    const r = buildVariationInsight(listing, 'USD');
    expect(r?.variationCount).toBe(2);
    expect(r?.minPrice).toBe('$10.00');
    expect(r?.maxPrice).toBe('$25.00');
    expect(r?.priceSpread).toBe('$15.00');
  });

  it('returns null when the listing has no variations', () => {
    expect(buildVariationInsight({ has_variations: false } as EtsyListing, 'USD')).toBeNull();
  });
});

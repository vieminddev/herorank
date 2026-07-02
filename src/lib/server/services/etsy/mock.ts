/**
 * Mock EtsyClient (Engineer F owns) — the dev/test path TODAY (no real key, spec §1.1).
 *
 * Implements the same `EtsyClient` interface from in-repo fixture JSON shaped after the
 * DOCUMENTED v3 responses (research §3). The provider (provider.ts) selects this whenever
 * `env.ETSY_API_KEY` is absent, so every tool runs end-to-end with zero Etsy access.
 *
 * Review timestamps: fixtures carry `_days_ago` so the mock can stamp `created_timestamp`
 * relative to NOW — otherwise a frozen fixture date would fall outside the trailing-90-day
 * window and salesEstimate would always read 0. `_days_ago` is stripped from the returned shape.
 *
 * `createMockEtsyClient(overrides)` lets a test swap any fixture (e.g. an empty review page,
 * a not-found shop) without touching files. It makes NO network calls and never throws config
 * errors — it is the always-available stand-in.
 */
import type {
  EtsyClient,
  EtsyImage,
  EtsyListing,
  EtsyListingPage,
  EtsyReview,
  EtsyReviewPage,
  EtsyShop,
  EtsyShopSection,
  EtsyTaxonomyNode,
  EtsyTaxonomyProperty,
} from './types';

import listingFixture from './__fixtures__/listing.json';
import listingPageFixture from './__fixtures__/listingPage.json';
import shopFixture from './__fixtures__/shop.json';
import shopsPageFixture from './__fixtures__/shopsPage.json';
import shopListingsFixture from './__fixtures__/shopListings.json';
import reviewsShopFixtureRaw from './__fixtures__/reviewsShop.json';
import reviewsListingFixtureRaw from './__fixtures__/reviewsListing.json';
import taxonomyFixture from './__fixtures__/taxonomy.json';

type RawReview = EtsyReview & { _days_ago?: number };

/** Turn `_days_ago` markers into real `created_timestamp` epoch seconds relative to now. */
function materializeReviews(page: { count: number; results: RawReview[] }): EtsyReviewPage {
  const nowSec = Math.floor(Date.now() / 1000);
  const results: EtsyReview[] = page.results.map((r) => {
    const { _days_ago, ...rest } = r;
    return {
      ...rest,
      created_timestamp:
        _days_ago !== undefined ? nowSec - _days_ago * 86_400 : rest.created_timestamp,
    };
  });
  return { count: page.count, results };
}

export interface MockEtsyFixtures {
  listing?: EtsyListing;
  listingPage?: EtsyListingPage;
  shop?: EtsyShop;
  shops?: EtsyShop[];
  shopListings?: EtsyListingPage;
  reviewsShop?: EtsyReviewPage;
  reviewsListing?: EtsyReviewPage;
  taxonomy?: EtsyTaxonomyNode[];
  taxonomyProperties?: EtsyTaxonomyProperty[];
  shopSections?: EtsyShopSection[];
  featured?: EtsyListingPage;
}

/** Representative attribute catalog so the mock path exercises attribute-gap analysis. */
const MOCK_TAXONOMY_PROPERTIES: EtsyTaxonomyProperty[] = [
  { property_id: 200, name: 'Primary color', display_name: 'Primary color', is_required: false, possible_values: [{ name: 'Black' }, { name: 'White' }, { name: 'Blue' }] },
  { property_id: 201, name: 'Material', display_name: 'Material', is_required: false, possible_values: [{ name: 'Ceramic' }, { name: 'Cotton' }, { name: 'Wood' }] },
  { property_id: 202, name: 'Occasion', display_name: 'Occasion', is_required: false, possible_values: [{ name: 'Birthday' }, { name: 'Wedding' }, { name: 'Anniversary' }] },
  { property_id: 203, name: 'Holiday', display_name: 'Holiday', is_required: false, possible_values: [{ name: 'Christmas' }, { name: 'Halloween' }] },
];

const MOCK_SHOP_SECTIONS: EtsyShopSection[] = [
  { shop_section_id: 1, title: 'Best Sellers', rank: 1, active_listing_count: 24 },
  { shop_section_id: 2, title: 'New Arrivals', rank: 2, active_listing_count: 12 },
  { shop_section_id: 3, title: 'On Sale', rank: 3, active_listing_count: 8 },
];

/** Ensure mock listings carry the newer optimization fields so tools render non-empty in dev. */
function enrichListing(l: EtsyListing): EtsyListing {
  return {
    views: 540,
    featured_rank: -1,
    processing_min: 1,
    processing_max: 3,
    has_variations: true,
    is_personalizable: false,
    inventory: l.inventory ?? {
      products: [
        {
          product_id: 1,
          sku: 'MOCK-1',
          offerings: [{ offering_id: 1, quantity: 25, is_enabled: true, price: l.price }],
          property_values: [{ property_id: 200, property_name: 'Primary color', values: ['Black'] }],
        },
      ],
    },
    ...l,
  };
}

export function createMockEtsyClient(overrides: MockEtsyFixtures = {}): EtsyClient {
  const listing = overrides.listing ?? (listingFixture as EtsyListing);
  const listingPage = overrides.listingPage ?? (listingPageFixture as EtsyListingPage);
  const shop = overrides.shop ?? (shopFixture as EtsyShop);
  const shops = overrides.shops ?? ((shopsPageFixture as { results: EtsyShop[] }).results);
  const shopListings = overrides.shopListings ?? (shopListingsFixture as EtsyListingPage);
  const reviewsShop =
    overrides.reviewsShop ?? materializeReviews(reviewsShopFixtureRaw as { count: number; results: RawReview[] });
  const reviewsListing =
    overrides.reviewsListing ??
    materializeReviews(reviewsListingFixtureRaw as { count: number; results: RawReview[] });
  const taxonomy =
    overrides.taxonomy ?? ((taxonomyFixture as { results: EtsyTaxonomyNode[] }).results);
  const taxonomyProperties = overrides.taxonomyProperties ?? MOCK_TAXONOMY_PROPERTIES;
  const shopSections = overrides.shopSections ?? MOCK_SHOP_SECTIONS;
  const featured = overrides.featured ?? listingPage;

  return {
    async findActiveListings(): Promise<EtsyListingPage> {
      return { ...listingPage, results: listingPage.results.map(enrichListing) };
    },
    async getListing(listingId): Promise<EtsyListing> {
      // Return the canonical fixture but reflect the requested id so callers can correlate.
      return enrichListing({ ...listing, listing_id: listingId });
    },
    async getListingsByListingIds(ids): Promise<EtsyListing[]> {
      return ids.map((id) => ({ ...listing, listing_id: id }));
    },
    async getListingImages(): Promise<EtsyImage[]> {
      return listing.images ?? [];
    },
    async findShops(): Promise<EtsyShop[]> {
      return shops;
    },
    async getShop(shopId): Promise<EtsyShop> {
      return { ...shop, shop_id: shopId };
    },
    async getActiveListingsByShop(): Promise<EtsyListingPage> {
      return shopListings;
    },
    async getReviewsByListing(): Promise<EtsyReviewPage> {
      return reviewsListing;
    },
    async getReviewsByShop(): Promise<EtsyReviewPage> {
      return reviewsShop;
    },
    async getSellerTaxonomyNodes(): Promise<EtsyTaxonomyNode[]> {
      return taxonomy;
    },
    async getTaxonomyProperties(): Promise<EtsyTaxonomyProperty[]> {
      return taxonomyProperties;
    },
    async getShopSections(): Promise<EtsyShopSection[]> {
      return shopSections;
    },
    async getFeaturedListings(): Promise<EtsyListingPage> {
      return { ...featured, results: featured.results.map(enrichListing) };
    },
  };
}

/** The default fixture set used by the provider when no real key is present. */
export const defaultFixtures: MockEtsyFixtures = {};

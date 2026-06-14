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
  EtsyTaxonomyNode,
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

  return {
    async findActiveListings(): Promise<EtsyListingPage> {
      return listingPage;
    },
    async getListing(listingId): Promise<EtsyListing> {
      // Return the canonical fixture but reflect the requested id so callers can correlate.
      return { ...listing, listing_id: listingId };
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
  };
}

/** The default fixture set used by the provider when no real key is present. */
export const defaultFixtures: MockEtsyFixtures = {};

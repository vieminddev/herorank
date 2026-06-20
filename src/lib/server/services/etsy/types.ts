/**
 * Etsy Open API v3 raw data types + tool response shapes (Engineer F owns).
 *
 * Two concerns live here on purpose so there is ONE source of truth shared by:
 *   - `client.ts` / `mock.ts`        (raw Etsy v3 read shapes)
 *   - `estimation/*` (Engineer G)    (imports the Etsy* raw shapes as pure-fn inputs)
 *   - `etsy-tools.ts` (routes)       (builds the *Response shapes below for the FE)
 *
 * The raw shapes follow the DOCUMENTED Etsy API v3 response fields (research §3). We only
 * declare the fields the spec actually relies on (spec §1.3) — extra upstream fields are
 * tolerated (responses are read structurally, never exhaustively).
 *
 * NOTE on sales/views (research §4): there is NO `quantity_sold` / `views` for other shops'
 * listings in v3. The only public sales-proxy is review COUNT + review TIMESTAMPS. Nothing
 * here exposes a cross-shop sales field, by design — the estimation engine derives it.
 */

// ---------------------------------------------------------------------------
// 1. Raw Etsy v3 read shapes (consumed by client + mock + estimation)
// ---------------------------------------------------------------------------

/** Etsy money object: amount is an integer in the smallest unit; value = amount / divisor. */
export interface EtsyMoney {
  amount: number;
  divisor: number;
  currency_code: string;
}

export interface EtsyImage {
  listing_image_id: number;
  url_570xN?: string;
  url_fullxfull?: string;
  full_height?: number;
  full_width?: number;
  rank?: number;
}

/**
 * A single active listing (public, no OAuth). Fields beyond these may be present but are not
 * relied upon. `quantity_sold` / `views` intentionally absent (not available cross-shop).
 */
export interface EtsyListing {
  listing_id: number;
  title: string;
  description?: string;
  price?: EtsyMoney;
  tags?: string[];
  num_favorers?: number;
  quantity?: number; // current stock, not units sold
  created_timestamp?: number; // epoch seconds
  shop_id?: number;
  url?: string;
  state?: string;
  taxonomy_id?: number;
  /** Present only when requested via includes=Images. */
  images?: EtsyImage[];
  /** Present only when requested via includes=Videos — binary "has video" signal. */
  videos?: Array<{ video_id: number }>;
}

/** A paginated listing search/scan result. `count` is the TOTAL matches (competition proxy). */
export interface EtsyListingPage {
  count: number;
  results: EtsyListing[];
}

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  title?: string | null;
  announcement?: string | null;
  currency_code?: string;
  is_vacation?: boolean;
  listing_active_count?: number;
  transaction_sold_count?: number; // real lifetime sales (public on getShop)
  icon_url_fullxfull?: string; // shop avatar/icon (public)
  num_favorers?: number;
  review_count?: number; // total lifetime reviews (if exposed)
  review_average?: number; // 0-5
  created_timestamp?: number; // epoch seconds (shop opened)
  shop_location_country?: string | null;
  url?: string;
}

export interface EtsyShopPage {
  count: number;
  results: EtsyShop[];
}

export interface EtsyReview {
  shop_id?: number;
  listing_id?: number;
  rating: number; // 1-5
  review?: string; // review text (may be empty)
  created_timestamp: number; // epoch seconds — the velocity signal
  updated_timestamp?: number;
}

export interface EtsyReviewPage {
  count: number;
  results: EtsyReview[];
}

export interface EtsyTaxonomyNode {
  id: number;
  name: string;
  level: number;
  parent_id?: number | null;
  /** Full root→node id path (Etsy exposes this on some nodes); index 0 = top-level category. */
  full_path_taxonomy_ids?: number[];
  children?: EtsyTaxonomyNode[];
}

// ---------------------------------------------------------------------------
// 2. EtsyClient interface (real + mock implement this) — spec §1.2
// ---------------------------------------------------------------------------

export interface FindActiveListingsParams {
  keywords?: string;
  taxonomyId?: number;
  minPrice?: number;
  maxPrice?: number;
  sortOn?: 'created' | 'price' | 'updated' | 'score';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface EtsyClient {
  findActiveListings(p: FindActiveListingsParams): Promise<EtsyListingPage>;
  getListing(
    listingId: number,
    opts?: { includes?: ('Images' | 'Shop' | 'Tags' | 'Videos')[] }
  ): Promise<EtsyListing>;
  getListingsByListingIds(ids: number[], opts?: { includes?: string[] }): Promise<EtsyListing[]>;
  getListingImages(listingId: number): Promise<EtsyImage[]>;
  findShops(p: { shopName: string; limit?: number }): Promise<EtsyShop[]>;
  getShop(shopId: number): Promise<EtsyShop>;
  getActiveListingsByShop(
    shopId: number,
    p?: { limit?: number; offset?: number }
  ): Promise<EtsyListingPage>;
  getReviewsByListing(
    listingId: number,
    p?: { limit?: number; offset?: number }
  ): Promise<EtsyReviewPage>;
  getReviewsByShop(
    shopId: number,
    p?: { limit?: number; offset?: number }
  ): Promise<EtsyReviewPage>;
  getSellerTaxonomyNodes(): Promise<EtsyTaxonomyNode[]>;
}

// ---------------------------------------------------------------------------
// 3. Usage counter (quota guard) — spec §1.5
// ---------------------------------------------------------------------------

export interface UsageCounter {
  /** Increment today's UTC count by n; throws QuotaExceededError if it would exceed the cap. */
  consume(n: number): Promise<{ usedToday: number; capRemaining: number }>;
  /** Read today's usage without incrementing. */
  peek(): Promise<{ usedToday: number; cap: number }>;
}

// ---------------------------------------------------------------------------
// 4. Tool RESPONSE shapes (Engineer F builds; FE E2 wires) — spec §4
// ---------------------------------------------------------------------------

/**
 * Response envelope flags every tool body carries. `creditsRemaining` is merged LAST by the
 * `requireCredits` middleware (not by the route), so it is optional in the shapes below.
 */
export interface ToolMeta {
  /** True when served from a fresh cache hit (0 Etsy calls). */
  cached: boolean;
  /** True when served past soft-TTL due to quota/upstream degradation (still a result). */
  stale?: boolean;
  /** Merged by requireCredits middleware on 2xx. */
  creditsRemaining?: number;
}

export type CompetitionLabel = 'low' | 'medium' | 'high';
export type DemandLabel = 'low' | 'medium' | 'high';
export type TrendDirection = 'up' | 'down' | 'stable';
export type RiskLevel = 'low' | 'medium' | 'high';

/** One audit section (title/tags/images/video/description) — matches FE `scores.*`. */
export interface AuditScoreSection {
  score: number; // 0-100
  feedback: {
    clarity: Array<{ status: 'good' | 'warning' | 'error'; text: string }>;
    seo: Array<{ status: 'good' | 'warning' | 'error'; text: string }>;
  };
}

export interface ListingAuditScores {
  title: AuditScoreSection;
  tags: AuditScoreSection;
  images: AuditScoreSection;
  video: AuditScoreSection;
  description: AuditScoreSection;
}

/** POST /api/tools/listing-analyzer — maps onto FE MOCK_LISTING (views REMOVED, PM Q7). */
export interface ListingAnalyzerResponse extends ToolMeta {
  title: string;
  shop: string;
  price: string;
  date: string; // human-formatted listing date
  url?: string;
  imageUrl: string | null; // real product image (url_570xN)
  rating: number; // real, from reviews
  numRatings: number; // real
  scores: ListingAuditScores; // estimated (rule-based audit)
  stats: {
    estimatedSales: number; // estimated
    estimatedRevenue: string; // estimated
    faves: number; // real
  };
  /** Per-field honesty flags for the FE EstimatedBadge (BR-P3-06). */
  estimated: { sales: true; revenue: true; scores: true };
}

export interface ShopListingRow {
  id: number;
  title: string;
  imageUrl: string | null; // real listing thumbnail (url_570xN)
  price: string;
  grade: string; // A-F derived from avg audit score
  scores: { title: number; tags: number; images: number; video: number; description: number };
  sales: number; // estimated
  revenue: string; // estimated
  faves: number; // real (views REMOVED, PM Q7)
}

/** POST /api/tools/shop-analyzer — maps onto FE MOCK_SHOP (percentile + views REMOVED, Q7). */
export interface ShopAnalyzerResponse extends ToolMeta {
  name: string;
  title: string;
  icon: string | null; // real shop avatar (icon_url_fullxfull)
  rating: number;
  numRatings: number;
  location: string;
  created: string;
  stats: {
    activeListings: number; // real
    totalReviews: number; // real
    averagePrice: string; // real (computed)
    totalFaves: number; // real
    reviewRate: string; // estimated
    monthlySales: number; // estimated
    monthlyRevenue: string; // estimated
    totalSales: number; // estimated
    totalRevenue: string; // estimated
    salesPerListing: number; // estimated
  };
  tags: Array<{ name: string; count: number }>; // real (aggregated, top 60)
  categories: Array<{ name: string; count: number }>; // real (taxonomy-name mix, top 60)
  listings: ShopListingRow[];
  reviews: {
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
    recent: Array<{ rating: number; text: string; date: string }>;
  };
  about: {
    location: string;
    currency: string;
    vacation: boolean;
    announcement: string | null;
  };
  estimated: { sales: true; revenue: true; reviewRate: true; scores: true };
}

export interface RankHistoryPoint {
  date: string; // 'Jun 12'
  rank: number;
}

/** POST /api/tools/rank-check — real history from `analyses`. */
export interface RankCheckResponse extends ToolMeta {
  currentRank: number | null; // null = not in top 100
  bestRank: number | null;
  bestRankDate: string | null;
  keyword: string;
  competingListings: number; // real (findActiveListings.count)
  delta: number | null; // current vs prior (positive = improved/moved up)
  rankHistory: RankHistoryPoint[]; // real, grows over time
  estimated: { position: true };
}

export interface NicheRow {
  niche: string;
  competition: CompetitionLabel; // real-ish (result-count)
  demand: DemandLabel; // estimated
  avgPrice: string; // real (computed)
  listings: number; // real (count)
  growth: string; // estimated; '—' until history
  estimated: { demand: true; growth: true };
}

/** POST /api/tools/niche-finder. */
export interface NicheFinderResponse extends ToolMeta {
  query: string;
  niches: NicheRow[];
}

export interface BestSellerRow {
  rank: number;
  name: string;
  country: string;
  countryCode: string;
  rating: number;
  opened: string;
  listings: number;
  faves: number;
  sales: number; // estimated (review-velocity)
}

/** POST /api/tools/best-sellers — cron-built cache (Q11: cost 1). */
export interface BestSellersResponse extends ToolMeta {
  category: string | null;
  view: 'shops' | 'listings';
  shops: BestSellerRow[];
  /** True when the requested category is not yet indexed (showing popular fallback). */
  fallback?: boolean;
  estimated: { sales: true; ranking: true };
}

export interface TrendRow {
  keyword: string;
  category: string;
  demandIndex: number; // 0-100 — replaces fabricated "searches" (PM Q9)
  trend: TrendDirection;
  change: string; // '+12%' | '—'
  estimated: { demandIndex: true; change: true };
}

/** POST /api/tools/etsy-trends — cron-built cache (Q11: cost 1). */
export interface EtsyTrendsResponse extends ToolMeta {
  filter: string | null;
  trends: TrendRow[];
  /** True until ≥2 weekly cron cycles exist (trendDelta is '—' / 'stable' meanwhile). */
  buildingHistory: boolean;
}

/** POST /api/tools/buyer-check — REDEFINED to shop reputation (BR-P3-08, spec §4.7). */
export interface BuyerCheckResponse extends ToolMeta {
  shop: string; // shop name (NOT a buyer username)
  shopOpened: string; // from shop created date
  totalReviews: number; // real
  avgRating: number; // real
  positivePct: number; // % reviews >= 4 stars (real)
  accountAgeYears: number; // real
  riskLevel: RiskLevel; // estimated
  reviews: Array<{ product: string; rating: number; text: string; date: string }>;
  estimated: { riskLevel: true };
}

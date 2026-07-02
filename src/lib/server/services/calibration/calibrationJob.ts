/**
 * Calibration job (Engineer H) — weekly cron that feeds the estimation engine REAL data
 * (BR-P4-OAUTH-04, BR-P4-CAL-01). Dispatched by F's `handleScheduled` on the `0 4 * * 0` cron.
 *
 * Signature (the seam F calls):
 *     calibrationJob(env, ctx) => Promise<CalibrationResult>
 *   - `env`: request-less Cloudflare bindings/secrets (contract A §3) — DB, KV, OAuth secret,
 *     ETSY_OAUTH_*. No Request/locals here.
 *   - `ctx`: ExecutionContext (optional; for `waitUntil`). The job awaits its own work so `ctx`
 *     is currently unused but kept in the signature for parity with F's other jobs + future use.
 *
 * What it does (BA spec §3.4), per connected shop:
 *   1. Refresh the access token if near expiry (proactive).
 *   2. GET own-shop transactions (transactions_r) for the trailing 90d → count real sales/listing.
 *   3. Count reviews/listing in the same window (via Phase 3's public EtsyClient getReviewsByShop).
 *   4. Map each listing → top-level taxonomy category.
 *   5. Aggregate per category ACROSS ALL connected shops: review_rate = Σreviews / Σtransactions.
 *   6. UPSERT calibration_factors(category_id, review_rate, sample_size).
 *   7. Mark the shop calibrated.
 *
 * PRIVACY (BR-P4-OAUTH-04): only AGGREGATE per-category review-rates are persisted. A connected
 * shop's raw transactions are transient (in-memory for the job only) and never exposed.
 *
 * MOCK PATH (BR-P4-OAUTH-05): with no `ETSY_OAUTH_CLIENT_ID`, `getEtsyOAuth(env)` returns the
 * mock client → the job runs end-to-end on fixtures and produces a real `calibration_factors`
 * row in dev/test. `getListingTaxonomy` is injected so the mock can supply its fixture map.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../env';
import { getEtsyOAuth } from '../oauth/provider';
import { createTokenCipher } from '../oauth/crypto';
import { createConnectedShopRepo, type ConnectedShop, type ConnectedShopRepo } from '../oauth/connectedShopRepo';
import { mockListingTaxonomy } from '../oauth/mockOAuth';
import type { EtsyOAuthClient } from '../oauth/etsyOAuth';
import { getEtsyClient } from '../etsy/provider';
import type { EtsyClient } from '../etsy/types';

const NINETY_DAYS_SEC = 90 * 86_400;

/** Outcome summary (logged by F; returned for tests). NEVER contains tokens or raw sales. */
export interface CalibrationResult {
  shopsProcessed: number;
  categoriesWritten: number;
  /** Per-category aggregate actually written (review_rate + sample_size). */
  factors: Array<{ categoryId: number; reviewRate: number; sampleSize: number }>;
  errors: string[];
}

/**
 * Optional injectables (tests / mock path). In prod F just calls `calibrationJob(env, ctx)`.
 * `oauthClient` / `etsyClient` default to the providers; `listingTaxonomy` resolves a listing's
 * top-level category (mock supplies a fixture map; real path would use the taxonomy API).
 */
export interface CalibrationDeps {
  oauthClient?: EtsyOAuthClient;
  etsyClient?: EtsyClient;
  repo?: ConnectedShopRepo;
  /** listing_id → top-level taxonomy node id. Defaults to the mock fixture map. */
  listingTaxonomy?: Record<number, number>;
  /** Refresh tokens whose expiry is within this many seconds (proactive). */
  refreshSkewSec?: number;
  /** D1 handle for writing calibration_factors. Defaults to `env.DB`. */
  db?: D1Database;
}

export async function calibrationJob(
  env: Env,
  ctx?: ExecutionContext,
  deps: CalibrationDeps = {}
): Promise<CalibrationResult> {
  void ctx;
  const errors: string[] = [];

  const oauthClient = deps.oauthClient ?? getEtsyOAuth(env);
  const etsyClient = deps.etsyClient ?? getEtsyClient(env);
  const listingTaxonomy = deps.listingTaxonomy ?? mockListingTaxonomy();
  const refreshSkewSec = deps.refreshSkewSec ?? 300;
  const db = deps.db ?? env.DB;

  const repo =
    deps.repo ?? createConnectedShopRepo(env.DB, await createTokenCipher(env.OAUTH_TOKEN_KEY));

  const shops = await repo.listShops();
  const sinceEpochSec = Math.floor(Date.now() / 1000) - NINETY_DAYS_SEC;

  // Aggregate ACROSS shops: category → { reviews, transactions }.
  const perCategory = new Map<number, { reviews: number; transactions: number }>();
  let shopsProcessed = 0;

  for (const shop of shops) {
    try {
      const accessToken = await ensureFreshToken(shop, oauthClient, repo, refreshSkewSec);

      // 1. own-shop transactions (real sales) per listing.
      const txns = await oauthClient.getShopTransactions({
        accessToken,
        shopId: shop.etsyShopId,
        sinceEpochSec,
      });
      const txByListing = new Map<number, number>();
      for (const t of txns) txByListing.set(t.listing_id, (txByListing.get(t.listing_id) ?? 0) + 1);

      // 2. reviews per listing in the same window (public reviews via Phase 3 EtsyClient).
      const reviewsByListing = await countShopReviewsByListing(
        etsyClient,
        shop.etsyShopId,
        sinceEpochSec
      );

      // 3 + 4. map each listing → category, fold into per-category aggregate.
      const listingIds = new Set<number>([...txByListing.keys(), ...reviewsByListing.keys()]);
      for (const listingId of listingIds) {
        const categoryId = listingTaxonomy[listingId];
        if (categoryId == null) continue; // unknown category → cannot calibrate it
        const bucket = perCategory.get(categoryId) ?? { reviews: 0, transactions: 0 };
        bucket.transactions += txByListing.get(listingId) ?? 0;
        bucket.reviews += reviewsByListing.get(listingId) ?? 0;
        perCategory.set(categoryId, bucket);
      }

      await repo.markCalibrated(shop.userId, shop.etsyShopId, Math.floor(Date.now() / 1000));
      shopsProcessed++;
    } catch (err) {
      // Per-shop isolation: one shop's failure must not abort the whole calibration.
      errors.push(`shop ${shop.etsyShopId}: ${errMessage(err)}`);
    }
  }

  // 5 + 6. compute review_rate per category and UPSERT.
  const factors: CalibrationResult['factors'] = [];
  for (const [categoryId, agg] of perCategory) {
    if (agg.transactions <= 0) continue; // no sales → no rate
    const reviewRate = agg.reviews / agg.transactions;
    await upsertCalibrationFactor(db, categoryId, reviewRate, agg.transactions);
    factors.push({ categoryId, reviewRate, sampleSize: agg.transactions });
  }

  return { shopsProcessed, categoriesWritten: factors.length, factors, errors };
}

// ---------------------------------------------------------------------------
// helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Refresh + persist the token if it expires within `skewSec`; return a usable access token. */
export async function ensureFreshToken(
  shop: ConnectedShop,
  oauthClient: EtsyOAuthClient,
  repo: ConnectedShopRepo,
  skewSec: number
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (shop.tokenExpiresAt - nowSec > skewSec) return shop.accessToken;
  const tokens = await oauthClient.refresh(shop.refreshToken);
  await repo.updateTokens({
    userId: shop.userId,
    etsyShopId: shop.etsyShopId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
  });
  return tokens.accessToken;
}

/** Count reviews per listing in the trailing window using the public shop-reviews endpoint. */
async function countShopReviewsByListing(
  etsyClient: EtsyClient,
  shopId: number,
  sinceEpochSec: number
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const page = await etsyClient.getReviewsByShop(shopId, { limit: 100 });
  for (const r of page.results) {
    if (r.created_timestamp < sinceEpochSec) continue;
    if (typeof r.listing_id !== 'number') continue;
    counts.set(r.listing_id, (counts.get(r.listing_id) ?? 0) + 1);
  }
  return counts;
}

/** UPSERT one calibration_factors row (review_rate + sample_size SET to the latest aggregate). */
export async function upsertCalibrationFactor(
  db: D1Database,
  categoryId: number,
  reviewRate: number,
  sampleSize: number
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO calibration_factors (category_id, review_rate, sample_size, updated_at) ' +
        'VALUES (?, ?, ?, unixepoch()) ' +
        'ON CONFLICT(category_id) DO UPDATE SET ' +
        'review_rate = excluded.review_rate, ' +
        'sample_size = excluded.sample_size, ' +
        'updated_at = excluded.updated_at'
    )
    .bind(categoryId, reviewRate, sampleSize)
    .run();
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

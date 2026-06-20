/**
 * Etsy own-shop WRITE client + shared helpers for the `/my-shop` and `/ext` routers.
 *
 * Unlike `services/etsy/client.ts` (app-key, public reads) this client calls Etsy v3 with the
 * connected user's OAuth Bearer token (`Authorization: Bearer <accessToken>` + `x-api-key:
 * <keystring>`), so it can read the seller's OWN receipts/listings and PUT listing edits.
 *
 * Reuses the existing OAuth stack (`connectedShopRepo`, `crypto`, `oauth/provider`) for token
 * storage + refresh — this module only adds the authed data/write calls and the receipt/money
 * mappers the routers render with.
 *
 * Write-access is feature-flagged via `ETSY_WRITE_ENABLED` (`isWriteEnabled`): until Etsy grants
 * the `listings_w` scope the routers gate edits behind it and request only read scopes.
 */
import type { Context } from 'hono';
import type { Env } from '../../env';
import type { AppEnv } from '../../api/types';
import { getDb, getEnv, getUser } from '../../api/context';
import { ETSY_API_BASE } from '../oauth/etsyOAuth';
import { getEtsyOAuth } from '../oauth/provider';
import { createConnectedShopRepo, type ConnectedShop } from '../oauth/connectedShopRepo';
import { createTokenCipher, TokenCryptoError } from '../oauth/crypto';
import type { EtsyListing } from './types';

// ---------------------------------------------------------------------------
// OAuth scopes (read baseline + optional write scope)
// ---------------------------------------------------------------------------

/** Read-only scopes requested for own-shop data (profile/transactions/shops/listings). */
export const ETSY_OAUTH_SCOPES = ['profile_r', 'transactions_r', 'shops_r', 'listings_r'] as const;
export const ETSY_OAUTH_SCOPE_STRING = ETSY_OAUTH_SCOPES.join(' ');
/** Write scope — only requested once `ETSY_WRITE_ENABLED` is on (Etsy approval gated). */
export const ETSY_OAUTH_WRITE_SCOPE = 'listings_w';
export const ETSY_OAUTH_SCOPE_STRING_WRITE = `${ETSY_OAUTH_SCOPE_STRING} ${ETSY_OAUTH_WRITE_SCOPE}`;

const nowSec = (): number => Math.floor(Date.now() / 1000);

/** Whether the Etsy write feature flag is on. Accepts "true"/"1" (case-insensitive). */
export function isWriteEnabled(env: Env): boolean {
  const v = env.ETSY_WRITE_ENABLED?.toLowerCase();
  return v === 'true' || v === '1';
}

/** The scope string to request at authorize time — adds the write scope only when enabled. */
export function oauthScopeString(env: Env): string {
  return isWriteEnabled(env) ? ETSY_OAUTH_SCOPE_STRING_WRITE : ETSY_OAUTH_SCOPE_STRING;
}

// ---------------------------------------------------------------------------
// Money / receipt mappers
// ---------------------------------------------------------------------------

/** Etsy v3 money object: `{ amount, divisor, currency_code }`. */
export interface EtsyMoney {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

/** Convert an Etsy money object to `{ value, currency }` (value in major units). */
export function money(m: EtsyMoney | null | undefined): { value: number; currency: string } {
  if (!m || !m.divisor) return { value: 0, currency: m?.currency_code ?? 'USD' };
  return { value: (m.amount ?? 0) / m.divisor, currency: m.currency_code ?? 'USD' };
}

/** Major-unit value of an Etsy money object (currency dropped). */
const amt = (m: EtsyMoney | null | undefined): number => money(m).value;

/** Coerce an arbitrary attribute value (scalar / array / object) to a flat comma-joined string. */
export function attrValueToString(x: unknown): string {
  if (Array.isArray(x)) return x.map(attrValueToString).filter(Boolean).join(', ');
  if (x === null || x === undefined) return '';
  if (typeof x === 'object') return Object.values(x).map(attrValueToString).join(', ');
  return String(x);
}

/** Normalize a property-attributes value into `{ name, value }[]` (passes arrays through). */
export function normalizeAttributes(
  v: unknown
): Array<{ name: string; value: string }> | unknown {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>).map(([name, value]) => ({
      name,
      value: attrValueToString(value),
    }));
  }
  return v;
}

/** A full Etsy receipt mapped to our camelCase detail shape (every field the FE may render). */
export function toDetailedReceipt(r: RawReceipt): DetailedReceipt {
  const currency = r.grandtotal?.currency_code ?? r.total_price?.currency_code ?? 'USD';
  return {
    receiptId: r.receipt_id ?? 0,
    receiptType: typeof r.receipt_type === 'number' ? r.receipt_type : null,
    createdAt: r.created_timestamp ?? r.create_timestamp ?? 0,
    updatedAt: r.updated_timestamp ?? r.update_timestamp ?? null,
    currency,
    grandTotal: amt(r.grandtotal ?? r.total_price),
    subtotal: amt(r.subtotal),
    totalPrice: amt(r.total_price),
    shipping: amt(r.total_shipping_cost),
    tax: amt(r.total_tax_cost),
    vat: amt(r.total_vat_cost),
    discount: amt(r.discount_amt),
    giftWrapPrice: amt(r.gift_wrap_price),
    isPaid: typeof r.is_paid === 'boolean' ? r.is_paid : null,
    isShipped: typeof r.is_shipped === 'boolean' ? r.is_shipped : null,
    status: r.status ?? null,
    sellerUserId: r.seller_user_id ?? null,
    sellerEmail: r.seller_email ?? null,
    buyerUserId: r.buyer_user_id ?? null,
    buyerEmail: r.buyer_email ?? null,
    buyerName: r.name ?? null,
    shippingAddress: {
      name: r.name ?? null,
      firstLine: r.first_line ?? null,
      secondLine: r.second_line ?? null,
      city: r.city ?? null,
      state: r.state ?? null,
      zip: r.zip ?? null,
      countryIso: r.country_iso ?? null,
      formatted: r.formatted_address ?? null,
    },
    paymentMethod: r.payment_method ?? null,
    paymentEmail: r.payment_email ?? null,
    messageFromBuyer: r.message_from_buyer ?? null,
    messageFromSeller: r.message_from_seller ?? null,
    messageFromPayment: r.message_from_payment ?? null,
    isGift: typeof r.is_gift === 'boolean' ? r.is_gift : null,
    giftMessage: r.gift_message ?? null,
    giftSender: r.gift_sender ?? null,
    items: (r.transactions ?? []).map((t) => ({
      transactionId: t.transaction_id ?? null,
      listingId: typeof t.listing_id === 'number' ? t.listing_id : null,
      productId: t.product_id ?? null,
      sku: t.sku ?? null,
      title: t.title ?? null,
      description: t.description ?? null,
      quantity: t.quantity ?? 1,
      price: amt(t.price),
      shippingCost: amt(t.shipping_cost),
      listingImageId: t.listing_image_id ?? null,
      isDigital: typeof t.is_digital === 'boolean' ? t.is_digital : null,
      variations: Array.isArray(t.variations) ? t.variations : [],
      minProcessingDays: t.min_processing_days ?? null,
      maxProcessingDays: t.max_processing_days ?? null,
      expectedShipDate: t.expected_ship_date ?? null,
      paidAt: t.paid_timestamp ?? null,
      shippedAt: t.shipped_timestamp ?? null,
      buyerCoupon: typeof t.buyer_coupon === 'number' ? t.buyer_coupon : null,
      shopCoupon: typeof t.shop_coupon === 'number' ? t.shop_coupon : null,
    })),
    shipments: Array.isArray(r.shipments) ? r.shipments : [],
    refunds: Array.isArray(r.refunds) ? r.refunds : [],
  };
}

// ---------------------------------------------------------------------------
// User (OAuth-token) Etsy client
// ---------------------------------------------------------------------------

export interface UserEtsyClientConfig {
  /** Etsy keystring sent as `x-api-key` on every call. */
  clientId: string;
  /** The connected user's OAuth access token. */
  accessToken: string;
  /** Injected fetch (real `fetch` in prod, a stub in tests). */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  apiBase?: string;
  timeoutMs?: number;
}

export interface ReceiptSummary {
  receiptId: number;
  createdAt: number;
  total: number;
  tax: number;
  currency: string;
  buyerName: string | null;
  isPaid: boolean | null;
  isShipped: boolean | null;
  status: string | null;
  items: Array<{ listingId: number | null; title: string | null; quantity: number }>;
  detail: DetailedReceipt;
}

export interface OwnListing {
  listingId: number;
  title: string;
  description: string;
  tags: string[];
  state: string | null;
  url: string | null;
}

/**
 * Build an own-shop Etsy client bound to a connected user's OAuth token. Reads receipts/listings
 * and PUTs listing edits, all authed with the user's Bearer token (NOT the app-key client).
 */
export function createUserEtsyClient(cfg: UserEtsyClientConfig) {
  const doFetch = cfg.fetchImpl ?? ((i: string, init?: RequestInit) => fetch(i, init));
  const apiBase = cfg.apiBase ?? ETSY_API_BASE;
  const timeoutMs = cfg.timeoutMs ?? 10_000;

  async function authed(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'x-api-key': cfg.clientId,
          ...init?.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const authedGet = (url: string) => authed(url);

  return {
    /** Paginate own-shop receipts since `sinceEpochSec` (bounded by `maxPages`, 100/page). */
    async getShopReceipts({
      shopId,
      sinceEpochSec,
      maxPages = 5,
    }: {
      shopId: number;
      sinceEpochSec: number;
      maxPages?: number;
    }): Promise<ReceiptSummary[]> {
      const out: ReceiptSummary[] = [];
      const pageSize = 100;
      let offset = 0;
      for (let page = 0; page < maxPages; page++) {
        const url = `${apiBase}/shops/${shopId}/receipts?limit=${pageSize}&offset=${offset}`;
        const res = await authedGet(url);
        if (!res.ok) break;
        const json = (await res.json()) as { results?: RawReceipt[] };
        const results = json.results ?? [];
        for (const r of results) {
          const createdAt = r.created_timestamp ?? r.create_timestamp ?? 0;
          if (createdAt < sinceEpochSec) continue;
          const { value, currency } = money(r.grandtotal ?? r.total_price);
          out.push({
            receiptId: r.receipt_id ?? 0,
            createdAt,
            total: value,
            tax: money(r.total_tax_cost).value,
            currency,
            buyerName: r.name ?? null,
            isPaid: typeof r.is_paid === 'boolean' ? r.is_paid : null,
            isShipped: typeof r.is_shipped === 'boolean' ? r.is_shipped : null,
            status: r.status ?? null,
            items: (r.transactions ?? []).map((t) => ({
              listingId: typeof t.listing_id === 'number' ? t.listing_id : null,
              title: t.title ?? null,
              quantity: t.quantity ?? 1,
            })),
            detail: toDetailedReceipt(r),
          });
        }
        if (results.length < pageSize) break;
        offset += pageSize;
      }
      return out;
    },

    /** List the seller's own active listings (with images/videos). */
    async listOwnListings({
      shopId,
      limit = 50,
    }: {
      shopId: number;
      limit?: number;
    }): Promise<EtsyListing[]> {
      const url = `${apiBase}/shops/${shopId}/listings?state=active&limit=${Math.min(
        limit,
        100
      )}&includes=Images,Videos`;
      const res = await authedGet(url);
      if (!res.ok) throw new Error(`etsy own-listings ${res.status}`);
      const json = (await res.json()) as { results?: EtsyListing[] };
      return json.results ?? [];
    },

    /** Fetch one of the seller's own listings (editable fields). 404 → null. */
    async getOwnListing(listingId: number): Promise<OwnListing | null> {
      const res = await authedGet(`${apiBase}/listings/${listingId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`etsy listing ${res.status}`);
      const l = (await res.json()) as RawListing;
      return {
        listingId: l.listing_id ?? listingId,
        title: l.title ?? '',
        description: l.description ?? '',
        tags: l.tags ?? [],
        state: l.state ?? null,
        url: l.url ?? null,
      };
    },

    /** PUT an own-listing update (title/description/tags). Form-encoded, tags comma-joined. */
    async updateOwnListing({
      shopId,
      listingId,
      title,
      description,
      tags,
    }: {
      shopId: number;
      listingId: number;
      title?: string;
      description?: string;
      tags?: string[];
    }): Promise<void> {
      const form = new URLSearchParams();
      if (title !== undefined) form.set('title', title);
      if (description !== undefined) form.set('description', description);
      if (tags !== undefined) form.set('tags', tags.join(','));
      const res = await authed(`${apiBase}/shops/${shopId}/listings/${listingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!res.ok) throw new Error(`etsy update ${res.status}`);
    },
  };
}

export type UserEtsyClient = ReturnType<typeof createUserEtsyClient>;

// ---------------------------------------------------------------------------
// Connected-shop resolution (token refresh on the fly)
// ---------------------------------------------------------------------------

export interface ConnectedContext {
  shop: ConnectedShop;
  /** Etsy keystring (`x-api-key`) — prefers ETSY_API_KEY, falls back to the OAuth client id. */
  clientId: string;
  /** A non-expired access token (proactively refreshed if within 120s of expiry). */
  accessToken: string;
}

/** Build a cipher; return null (caller emits NOT_CONNECTED) when the key is missing/invalid. */
async function safeCipher(secret: string | undefined) {
  try {
    return await createTokenCipher(secret);
  } catch (err) {
    if (err instanceof TokenCryptoError) return null;
    throw err;
  }
}

/**
 * Resolve the caller's connected shop for the `/my-shop` router. Honors an optional `?shopId`
 * query param (else first shop), and proactively refreshes the access token if it expires within
 * 120s. Returns null when OAuth is unconfigured / no cipher / no connected shop.
 */
export async function connected(c: Context<AppEnv>): Promise<ConnectedContext | null> {
  const env = getEnv(c);
  if (!env.ETSY_OAUTH_CLIENT_ID) return null;
  const clientId = env.ETSY_API_KEY ?? env.ETSY_OAUTH_CLIENT_ID;
  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return null;
  const repo = createConnectedShopRepo(getDb(c), cipher);
  const shops = await repo.listForUser(getUser(c).id);
  if (!shops.length) return null;

  const shopIdParam = Number(c.req.query('shopId'));
  const shop =
    (Number.isInteger(shopIdParam) && shops.find((s) => s.etsyShopId === shopIdParam)) || shops[0];

  let accessToken = shop.accessToken;
  if (shop.tokenExpiresAt <= nowSec() + 120) {
    try {
      const tokens = await getEtsyOAuth(env).refresh(shop.refreshToken);
      await repo.updateTokens({
        userId: shop.userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      });
      accessToken = tokens.accessToken;
    } catch {
      /* keep the (possibly soon-expiring) token — the call may still succeed */
    }
  }
  return { shop, clientId, accessToken };
}

/**
 * Resolve a connected shop by its Etsy shop id (token refresh on the fly). Used where the shop
 * is identified directly rather than via the caller's session.
 */
export async function resolveShop(
  c: Context<AppEnv>,
  shopId: number
): Promise<ConnectedContext | null> {
  const env = getEnv(c);
  if (!env.ETSY_OAUTH_CLIENT_ID) return null;
  const clientId = env.ETSY_API_KEY ?? env.ETSY_OAUTH_CLIENT_ID;
  const cipher = await safeCipher(env.OAUTH_TOKEN_KEY);
  if (!cipher) return null;
  const repo = createConnectedShopRepo(getDb(c), cipher);
  const shop = await repo.getShopByEtsyId(shopId);
  if (!shop) return null;

  let accessToken = shop.accessToken;
  if (shop.tokenExpiresAt <= nowSec() + 120) {
    try {
      const tokens = await getEtsyOAuth(env).refresh(shop.refreshToken);
      await repo.updateTokens({
        userId: shop.userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      });
      accessToken = tokens.accessToken;
    } catch {
      /* keep current token */
    }
  }
  return { shop, clientId, accessToken };
}

// ---------------------------------------------------------------------------
// Raw Etsy shapes (only the fields the mappers read)
// ---------------------------------------------------------------------------

interface RawTransaction {
  transaction_id?: number;
  listing_id?: number;
  product_id?: number | string | null;
  sku?: string | null;
  title?: string | null;
  description?: string | null;
  quantity?: number;
  price?: EtsyMoney;
  shipping_cost?: EtsyMoney;
  listing_image_id?: number | null;
  is_digital?: boolean;
  variations?: unknown[];
  min_processing_days?: number | null;
  max_processing_days?: number | null;
  expected_ship_date?: number | null;
  paid_timestamp?: number | null;
  shipped_timestamp?: number | null;
  buyer_coupon?: number;
  shop_coupon?: number;
}

interface RawReceipt {
  receipt_id?: number;
  receipt_type?: number;
  created_timestamp?: number;
  create_timestamp?: number;
  updated_timestamp?: number | null;
  update_timestamp?: number | null;
  grandtotal?: EtsyMoney;
  subtotal?: EtsyMoney;
  total_price?: EtsyMoney;
  total_shipping_cost?: EtsyMoney;
  total_tax_cost?: EtsyMoney;
  total_vat_cost?: EtsyMoney;
  discount_amt?: EtsyMoney;
  gift_wrap_price?: EtsyMoney;
  is_paid?: boolean;
  is_shipped?: boolean;
  status?: string | null;
  seller_user_id?: number | null;
  seller_email?: string | null;
  buyer_user_id?: number | null;
  buyer_email?: string | null;
  name?: string | null;
  first_line?: string | null;
  second_line?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country_iso?: string | null;
  formatted_address?: string | null;
  payment_method?: string | null;
  payment_email?: string | null;
  message_from_buyer?: string | null;
  message_from_seller?: string | null;
  message_from_payment?: string | null;
  is_gift?: boolean;
  gift_message?: string | null;
  gift_sender?: string | null;
  transactions?: RawTransaction[];
  shipments?: unknown[];
  refunds?: unknown[];
}

/** Raw Etsy listing as returned by the own-shop listing endpoints (superset of audited fields). */
export interface RawListing {
  listing_id?: number;
  title?: string;
  description?: string;
  tags?: string[];
  state?: string | null;
  url?: string | null;
  images?: Array<{ url_570xN?: string; url_fullxfull?: string }>;
  [key: string]: unknown;
}

export interface DetailedReceipt {
  receiptId: number;
  receiptType: number | null;
  createdAt: number;
  updatedAt: number | null;
  currency: string;
  grandTotal: number;
  subtotal: number;
  totalPrice: number;
  shipping: number;
  tax: number;
  vat: number;
  discount: number;
  giftWrapPrice: number;
  isPaid: boolean | null;
  isShipped: boolean | null;
  status: string | null;
  sellerUserId: number | null;
  sellerEmail: string | null;
  buyerUserId: number | null;
  buyerEmail: string | null;
  buyerName: string | null;
  shippingAddress: {
    name: string | null;
    firstLine: string | null;
    secondLine: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    countryIso: string | null;
    formatted: string | null;
  };
  paymentMethod: string | null;
  paymentEmail: string | null;
  messageFromBuyer: string | null;
  messageFromSeller: string | null;
  messageFromPayment: string | null;
  isGift: boolean | null;
  giftMessage: string | null;
  giftSender: string | null;
  items: Array<{
    transactionId: number | null;
    listingId: number | null;
    productId: number | string | null;
    sku: string | null;
    title: string | null;
    description: string | null;
    quantity: number;
    price: number;
    shippingCost: number;
    listingImageId: number | null;
    isDigital: boolean | null;
    variations: unknown[];
    minProcessingDays: number | null;
    maxProcessingDays: number | null;
    expectedShipDate: number | null;
    paidAt: number | null;
    shippedAt: number | null;
    buyerCoupon: number | null;
    shopCoupon: number | null;
  }>;
  shipments: unknown[];
  refunds: unknown[];
}

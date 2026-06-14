/**
 * EtsyClient (Engineer F owns) — Etsy Open API v3 wrapper.
 *
 * Plain `fetch`, NO SDK (mirrors `llmService`): v3 is a simple keyed REST API and we only call
 * a handful of GET endpoints. Pure TS, NO Hono import. DI factory so unit tests inject a mock
 * `fetchImpl` and the route builds it per-request from env.
 *
 * Auth: every request sends `x-api-key: <apiKey>` (research §5 — required on ALL endpoints,
 * even public). No OAuth in Phase 3 (Layer 4 / Phase 4).
 *
 * The route maps the typed errors below to HTTP bodies; this client never decides HTTP and
 * never leaks upstream bodies. Each REAL HTTP call increments the injected `UsageCounter`
 * (batch endpoints count as 1). Cache hits never reach this client, so they never increment.
 */
import type {
  EtsyClient,
  EtsyImage,
  EtsyListing,
  EtsyListingPage,
  EtsyReviewPage,
  EtsyShop,
  EtsyShopPage,
  EtsyTaxonomyNode,
  FindActiveListingsParams,
  UsageCounter,
} from './types';

// ---------------------------------------------------------------------------
// Config + typed errors (spec §1.1, §1.4)
// ---------------------------------------------------------------------------

export interface EtsyConfig {
  apiKey: string;
  baseUrl?: string; // default 'https://openapi.etsy.com/v3/application'
  fetchImpl?: typeof fetch;
  usageCounter?: UsageCounter;
  timeoutMs?: number; // default 10000
  /** Test seam: disable backoff sleeping (so 429-retry tests run instantly). */
  sleepImpl?: (ms: number) => Promise<void>;
}

export type EtsyErrorCode =
  | 'ETSY_CONFIG'
  | 'ETSY_TIMEOUT'
  | 'ETSY_RATE_LIMIT'
  | 'ETSY_QUOTA'
  | 'ETSY_NOT_FOUND'
  | 'ETSY_UPSTREAM';

export class EtsyError extends Error {
  readonly code: EtsyErrorCode;
  constructor(code: EtsyErrorCode, message: string) {
    super(message);
    this.name = 'EtsyError';
    this.code = code;
  }
}
/** Missing/invalid key (incl. 401/403) — the "no real key yet" guard. Route → 503 ETSY_UNAVAILABLE. */
export class EtsyConfigError extends EtsyError {
  constructor(message = 'Etsy API not configured') {
    super('ETSY_CONFIG', message);
    this.name = 'EtsyConfigError';
  }
}
/** Abort/timeout. Route → 504 ETSY_TIMEOUT. */
export class EtsyTimeoutError extends EtsyError {
  constructor(message = 'Etsy request timed out') {
    super('ETSY_TIMEOUT', message);
    this.name = 'EtsyTimeoutError';
  }
}
/** 429 after retries. Route → 429 ETSY_BUSY. */
export class EtsyRateLimitError extends EtsyError {
  constructor(message = 'Etsy rate limited') {
    super('ETSY_RATE_LIMIT', message);
    this.name = 'EtsyRateLimitError';
  }
}
/** Local daily-cap exhaustion (usageCounter). Route → 503 ETSY_QUOTA. */
export class QuotaExceededError extends EtsyError {
  readonly usedToday: number;
  readonly cap: number;
  constructor(usedToday: number, cap: number, message = 'Etsy daily capacity reached') {
    super('ETSY_QUOTA', message);
    this.name = 'QuotaExceededError';
    this.usedToday = usedToday;
    this.cap = cap;
  }
}
/** 404. Route → 404 NOT_FOUND (no credit charge). */
export class EtsyNotFoundError extends EtsyError {
  constructor(message = 'Etsy resource not found') {
    super('ETSY_NOT_FOUND', message);
    this.name = 'EtsyNotFoundError';
  }
}
/** 5xx / network. Route → 502 ETSY_UNAVAILABLE. */
export class EtsyUpstreamError extends EtsyError {
  constructor(message = 'Etsy upstream error') {
    super('ETSY_UPSTREAM', message);
    this.name = 'EtsyUpstreamError';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://openapi.etsy.com/v3/application';
const DEFAULT_TIMEOUT_MS = 10_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createEtsyClient(config: EtsyConfig): EtsyClient {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = config.sleepImpl ?? defaultSleep;
  const usage = config.usageCounter;

  function assertConfigured(): void {
    if (!config.apiKey) throw new EtsyConfigError('Etsy API key is not configured');
  }

  /** Build a query string from a params object, skipping undefined/null. */
  function qs(params: Record<string, string | number | undefined | null>): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) sp.set(k, String(v));
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
  }

  /** One raw GET with timeout. Maps status/transport to typed errors. Does NOT touch usage. */
  async function rawGet<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { 'x-api-key': config.apiKey, accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new EtsyTimeoutError('Etsy took too long to respond');
      }
      throw new EtsyUpstreamError('Etsy is unreachable');
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new EtsyUpstreamError('Etsy returned an unreadable response');
      }
    }
    if (res.status === 404) throw new EtsyNotFoundError();
    if (res.status === 401 || res.status === 403) {
      throw new EtsyConfigError('Etsy rejected the configured key');
    }
    if (res.status === 429) throw new EtsyRateLimitError();
    if (res.status >= 500) throw new EtsyUpstreamError('Etsy is temporarily unavailable');
    throw new EtsyUpstreamError(`Etsy returned an unexpected status ${res.status}`);
  }

  /**
   * GET with retry/backoff (spec §1.4) + usage accounting. The whole logical call counts as
   * exactly ONE quota unit (charged up front), regardless of retries — we never want a single
   * tool action to burn many quota units. 429 → up to 2 retries (0.5s, 1.5s + jitter); 5xx →
   * 1 retry. On final failure the typed error propagates.
   */
  async function get<T>(path: string): Promise<T> {
    assertConfigured();
    if (usage) {
      const { usedToday, capRemaining } = await usage.consume(1).catch((e) => {
        throw e; // QuotaExceededError surfaces unchanged
      });
      void usedToday;
      void capRemaining;
    }

    let attempt = 0;
    for (;;) {
      try {
        return await rawGet<T>(path);
      } catch (err) {
        if (err instanceof EtsyRateLimitError && attempt < 2) {
          const base = attempt === 0 ? 500 : 1500;
          await sleep(base + Math.floor(Math.random() * 300));
          attempt++;
          continue;
        }
        if (err instanceof EtsyUpstreamError && attempt < 1) {
          await sleep(300 + Math.floor(Math.random() * 200));
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  return {
    async findActiveListings(p: FindActiveListingsParams): Promise<EtsyListingPage> {
      const path = `/listings/active${qs({
        keywords: p.keywords,
        taxonomy_id: p.taxonomyId,
        min_price: p.minPrice,
        max_price: p.maxPrice,
        sort_on: p.sortOn,
        sort_order: p.sortOrder,
        limit: p.limit ?? 25,
        offset: p.offset,
      })}`;
      return get<EtsyListingPage>(path);
    },

    async getListing(listingId, opts): Promise<EtsyListing> {
      const includes = opts?.includes?.length ? opts.includes.join(',') : undefined;
      return get<EtsyListing>(`/listings/${listingId}${qs({ includes })}`);
    },

    async getListingsByListingIds(ids, opts): Promise<EtsyListing[]> {
      // Batch endpoint — ONE quota unit for N ids. Query form supports `includes` (e.g. Images);
      // the path form (/listings/batch/{ids}) does NOT accept includes (404).
      const page = await get<EtsyListingPage>(
        `/listings/batch${qs({ listing_ids: ids.join(','), includes: opts?.includes?.join(',') })}`
      );
      return page.results ?? [];
    },

    async getListingImages(listingId): Promise<EtsyImage[]> {
      const page = await get<{ results: EtsyImage[] }>(`/listings/${listingId}/images`);
      return page.results ?? [];
    },

    async findShops(p): Promise<EtsyShop[]> {
      const page = await get<EtsyShopPage>(
        `/shops${qs({ shop_name: p.shopName, limit: p.limit ?? 10 })}`
      );
      return page.results ?? [];
    },

    async getShop(shopId): Promise<EtsyShop> {
      return get<EtsyShop>(`/shops/${shopId}`);
    },

    async getActiveListingsByShop(shopId, p): Promise<EtsyListingPage> {
      return get<EtsyListingPage>(
        `/shops/${shopId}/listings/active${qs({ limit: p?.limit ?? 100, offset: p?.offset })}`
      );
    },

    async getReviewsByListing(listingId, p): Promise<EtsyReviewPage> {
      return get<EtsyReviewPage>(
        `/listings/${listingId}/reviews${qs({ limit: p?.limit ?? 100, offset: p?.offset })}`
      );
    },

    async getReviewsByShop(shopId, p): Promise<EtsyReviewPage> {
      return get<EtsyReviewPage>(
        `/shops/${shopId}/reviews${qs({ limit: p?.limit ?? 100, offset: p?.offset })}`
      );
    },

    async getSellerTaxonomyNodes(): Promise<EtsyTaxonomyNode[]> {
      const page = await get<{ results: EtsyTaxonomyNode[] }>(`/seller-taxonomy/nodes`);
      return page.results ?? [];
    },
  };
}

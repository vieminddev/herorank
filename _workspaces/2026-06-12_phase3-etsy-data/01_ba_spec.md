# Phase 3 — Etsy Data + Estimation Engine Feature Spec

> BA, 2026-06-12. Branch `migrate-sveltekit`. Builds on Phase 1 (auth+billing+credits, QA-passed) and is **forward-compatible with the approved Phase 2 spec** (`_workspaces/2026-06-12_phase2-llm-tools/01_ba_spec.md`) — especially the `KeywordSource` seam, which Phase 3 implements.
>
> **Scope:** Layers 1–3 of the approved 4-layer data strategy (`docs/etsy-data-strategy.md`): (1) Etsy Open API v3 client, (2) estimation engine, (3) shared D1/KV cache. Layer 4 (OAuth connected shops) is Phase 4. Delivers backend data + estimation for **7 tools**: `listing-analyzer`, `shop-analyzer`, `rank-check` (estimated), `niche-finder`, `best-sellers`, `etsy-trends`, `buyer-check` (REDEFINED → shop/review reputation check).
>
> **Sources read:** `docs/etsy-data-strategy.md`, `_workspaces/.../01_etsy_api_v3.md` + `02_alternatives.md`, Phase 1 contract A, Phase 2 spec, 7 FE pages, `wrangler.jsonc`, `migrations/0002_herorank.sql`, `toolCosts.ts`, `routes/tools.ts`.

---

## 0. Hard environment constraints (drive every design decision)

| Constraint | Source | Design consequence |
|---|---|---|
| **No Etsy API key yet** — app pending submission/approval | brief + research §1 | Everything must dev/test against a **mock `EtsyClient`** + fixtures. Plug real key via `env.ETSY_API_KEY` → it just works. Same pattern as Phase 2's `LLM_API_KEY` (mock fetch / manual verify script). |
| **Rate limit 10,000 req/day, 10 QPS** (free tier) | research §2 | **Cache-first is mandatory**, not optional. Shared cache across all users. Daily usage counter with a hard guard well below 10k. Cron budget carved out of the quota. |
| **No real search volume / sales / trending / best-seller / buyer endpoints exist** | research §3–4 | All such numbers are **estimated** and must be UI-labeled "Estimated". `buyer-check` is redefined (buyer data does not exist anywhere). |
| **Scraping etsy.com is ToS-prohibited + DataDome** | research §2, 02_alternatives | Phase 3 uses **only the official API v3 + estimation**. No autocomplete scrape, no SERP scrape. (Autocomplete reconsidered in §3.1 — recommended OUT for Phase 3.) |
| **Etsy has rejected SEO/AI tools (Optimsy case)** | research §1 | Out of engineering scope, but flagged to PM (Q1). Phase 3 code does not depend on approval to be built/tested (mock). |

**Net:** Phase 3 is buildable and fully testable **today** with zero Etsy access, because every external call goes through a DI seam with a mock implementation + fixtures.

---

## 1. EtsyClient — Open API v3 wrapper

**Location:** `src/lib/server/services/etsy/client.ts` (Engineer **F** owns). Pure TS, **no Hono import**, DI factory — same pattern as `llmService`/`creditsService`.

### 1.1 Config & DI seam

```ts
export interface EtsyConfig {
  apiKey: string;            // env.ETSY_API_KEY (the "keystring" — header x-api-key)
  baseUrl?: string;          // default 'https://openapi.etsy.com/v3/application'
  fetchImpl?: typeof fetch;  // DI seam for unit tests / mock client
  usageCounter?: UsageCounter; // §1.5 — daily quota tracking; injected so it is testable
  timeoutMs?: number;        // default 10000
}

export function createEtsyClient(config: EtsyConfig): EtsyClient { ... }
```

- **Auth:** every request sends header `x-api-key: <apiKey>` (research §5 — API key required on **all** endpoints, even public ones). No OAuth in Phase 3 (that is Layer 4 / Phase 4).
- **Config guard:** if `apiKey` empty → `EtsyConfigError` (mapped to 503 at route, same as Phase 2's `LlmConfigError`). This is the **"no real key yet"** guard.
- A **`createMockEtsyClient(fixtures)`** factory (Engineer F owns, in `etsy/mockClient.ts`) implements the same `EtsyClient` interface from fixture JSON — used by all tests and by local dev until the real key arrives. The provider (§1.6) selects real vs mock based on whether `env.ETSY_API_KEY` is present.

### 1.2 Interface — only the endpoints we actually need

```ts
export interface EtsyClient {
  // Layer-1 raw reads (confirmed to exist, research §3)
  findActiveListings(p: { keywords?: string; taxonomyId?: number; minPrice?: number; maxPrice?: number;
                          sortOn?: 'created'|'price'|'updated'|'score'; sortOrder?: 'asc'|'desc';
                          limit?: number; offset?: number }): Promise<EtsyListingPage>;
  getListing(listingId: number, opts?: { includes?: ('Images'|'Shop'|'Tags')[] }): Promise<EtsyListing>;
  getListingsByListingIds(ids: number[]): Promise<EtsyListing[]>;          // batch — saves quota
  getListingImages(listingId: number): Promise<EtsyImage[]>;
  findShops(p: { shopName: string; limit?: number }): Promise<EtsyShop[]>; // resolve name → shop_id
  getShop(shopId: number): Promise<EtsyShop>;
  getActiveListingsByShop(shopId: number, p?: { limit?: number; offset?: number }): Promise<EtsyListingPage>;
  getReviewsByListing(listingId: number, p?: { limit?: number; offset?: number }): Promise<EtsyReviewPage>;
  getReviewsByShop(shopId: number, p?: { limit?: number; offset?: number }): Promise<EtsyReviewPage>;
  getSellerTaxonomyNodes(): Promise<EtsyTaxonomyNode[]>;                    // category tree (cron-cached)
}
```

**Endpoint → operationId mapping** (research §3, confirmed via OpenAPI client docs):
| Method | Etsy path | operationId |
|---|---|---|
| `findActiveListings` | `GET /listings/active` | `findAllListingsActive` |
| `getListing` | `GET /listings/{id}` | `getListing` |
| `getListingsByListingIds` | `GET /listings/batch/{ids}` | `getListingsByListingIds` |
| `getListingImages` | `GET /listings/{id}/images` | `getListingImages` |
| `findShops` | `GET /shops?shop_name=` | `findShops` |
| `getShop` | `GET /shops/{shop_id}` | `getShop` |
| `getActiveListingsByShop` | `GET /shops/{shop_id}/listings/active` | `findAllActiveListingsByShop` |
| `getReviewsByListing` | `GET /listings/{id}/reviews` | `getReviewsByListing` |
| `getReviewsByShop` | `GET /shops/{shop_id}/reviews` | `getReviewsByShop` |
| `getSellerTaxonomyNodes` | `GET /seller-taxonomy/nodes` | `getSellerTaxonomyNodes` |

> **NOT used / NOT exists** (do not implement): trending, best-seller, search-volume, buyer, cross-shop sales — none exist (research §3–4). `autocomplete` is an undocumented internal endpoint → **excluded** (ToS/DataDome risk, see §3.1).

### 1.3 `EtsyListing` fields we rely on (public, no OAuth)

`listing_id, title, description, price{amount,divisor,currency_code}, tags[], num_favorers, views?, quantity (stock), created_timestamp, shop_id, url, state`.

> **Important sales caveat (research §4):** there is **no `quantity_sold` / units-sold** field for other shops in v3. `views` is unreliable/absent for non-own listings. **The only public sales-proxy signal is review count + review timestamps** (`getReviewsByShop` / `getReviewsByListing`). The estimation engine (§3) is built around **review velocity**, not views/sales — because views/sales are not available. This is the single most important data fact constraining every "sales/demand" number.

### 1.4 Retry / backoff / timeout

- **Timeout:** `AbortController` @ `timeoutMs` (default 10s) → `EtsyTimeoutError`.
- **429 (rate-limit):** exponential backoff with jitter — retry up to **2 times** (e.g. 0.5s, 1.5s + jitter); if still 429 → `EtsyRateLimitError`. **Never** retry more aggressively (we are the cause of the limit).
- **5xx:** retry **once** then `EtsyUpstreamError`.
- **404:** `EtsyNotFoundError` (e.g. shop/listing not found → route returns 404 NOT_FOUND, **no credit charge**).
- **401/403:** `EtsyConfigError` (bad/expired/unapproved key) → 503 `ETSY_UNAVAILABLE`.
- Error mapping mirrors Phase 2 §1.4. **All ≥400 → zero credits charged** (deduct-after-2xx invariant carries over; see §4.0).

### 1.5 Daily usage counter (quota guard — mandatory)

**Store: D1** (durable, survives KV eventual-consistency; one row/day). Table `etsy_api_usage` (migration 0003, §2.4).

```ts
export interface UsageCounter {
  // returns calls used today (UTC); increments by n; throws QuotaExceededError if would exceed cap
  consume(n: number): Promise<{ usedToday: number; capRemaining: number }>;
  peek(): Promise<{ usedToday: number; cap: number }>;
}
```

- **Cap = `ETSY_DAILY_CAP` env (default 8000)** — deliberately **below 10,000** to leave headroom (10 QPS bursts, clock skew, cron). User requests + cron share the same counter.
- Every **real** Etsy HTTP call increments the counter by 1 (batch endpoints count as 1 call regardless of ids). **Cache hits do NOT increment** (they make 0 Etsy calls — the whole point).
- When `usedToday >= cap` → `QuotaExceededError` → route returns **503 `ETSY_QUOTA`** ("Live Etsy data is temporarily at capacity, please try again later") and serves **stale cache if available** (graceful degradation, §2.3). No credit charge on quota failure (≥400).
- **Counter key:** `etsy_api_usage(day TEXT PK = 'YYYY-MM-DD' UTC, count INTEGER)`. Increment via atomic `INSERT ... ON CONFLICT(day) DO UPDATE SET count = count + ?` then read back — D1 single-statement atomicity is sufficient (no read-then-write race). A small over-count under extreme concurrency is acceptable (cap has headroom).
- **Admin visibility:** expose `peek()` later via an internal `/api/admin/etsy-usage` (out of Phase 3 scope; counter is the foundation). Mentioned in strategy risk table ("theo dõi calls/ngày trong dashboard").

### 1.6 Provider seam (real vs mock, no key edits)

`src/lib/server/services/etsy/provider.ts` (Engineer F owns) — mirrors Phase 1 `services/provider.ts` pattern:
```ts
export function getEtsyClient(env: Env): EtsyClient {
  if (!env.ETSY_API_KEY) return createMockEtsyClient(defaultFixtures); // dev/test path TODAY
  return createEtsyClient({ apiKey: env.ETSY_API_KEY, usageCounter: createUsageCounter(getDb-from-env) });
}
```
> This is the seam that makes "plug the key into env and it runs" literally true. With no key → mock. With key → real. No route code changes.

---

## 2. Cache layer (Layer 3) — shared, cache-first

**Owner: Engineer F** (cache is tightly coupled to EtsyClient). Two stores, by data shape:

### 2.1 KV for payloads (`src/lib/server/services/etsy/cache.ts`)

KV stores **rendered JSON payloads** (the tool response body, minus `creditsRemaining`). Shared across **all users** (BR-P3-CACHE-01: cache is global, never per-user — a listing analysis is identical regardless of who asks).

**Key scheme** (namespaced, versioned so we can invalidate by bumping the version):
```
etsy:v1:listing:{listing_id}
etsy:v1:shop:{shop_id}
etsy:v1:shopname:{normalized_name}        → shop_id (resolve cache, avoids repeat findShops)
etsy:v1:reviews:shop:{shop_id}
etsy:v1:rank:{listing_id}:{kw_normalized}
etsy:v1:niche:{query_normalized}
etsy:v1:keyword:{seed_normalized}          ← shared with Phase 2 keyword-generator (KeywordSource seam, §6)
etsy:v1:trends:{category_id}               ← written by cron, read by etsy-trends
etsy:v1:bestsellers:{category_id}          ← written by cron, read by best-sellers
etsy:v1:taxonomy                           ← category tree, written by cron
```

**TTLs** (per strategy doc §"Lớp 3" + research-driven freshness):
| Data | TTL | Rationale |
|---|---|---|
| keyword (volume/competition estimate) | **7 days** (configurable up to 30) | search behavior changes slowly; cheap to keep |
| listing | **24h** | listing edits are infrequent; balances freshness vs quota |
| shop | **24h** | same |
| reviews | **24h** | new reviews accrue slowly; velocity computed over weeks |
| rank | **24h** | rank-check history is daily granularity (FE shows 7-day chart) |
| niche | **7 days** | category landscape is slow-moving |
| trends | **7 days** | cron refreshes weekly |
| best-sellers | **7 days** | cron refreshes weekly |
| taxonomy | **30 days** | category tree rarely changes |

> `normalized` = lowercased, trimmed, collapsed whitespace, so `"Custom Necklace"` and `"custom necklace"` share a cache entry.

### 2.2 D1 for keyword history (`keywords_cache` — DOES NOT EXIST YET → migration 0003)

**Verified:** `migrations/0002_herorank.sql` has only `subscriptions`, `credits_ledger`, `processed_stripe_events`. **There is no `keywords_cache` and no `analyses` table.** Phase 2 spec assumed `keywords_cache` would exist ("`keywords_cache` table from backend-architecture") — it does **not**. **Phase 3 must ship migration 0003** (see §2.4).

Why D1 (not just KV) for keywords: keyword estimates feed `etsy-trends` `trendDelta` (compare demand between two cache periods, §3.4). We need **queryable historical rows** (point-in-time demand snapshots), which KV (blob, TTL-expiring) cannot do. KV holds the *current* payload; D1 holds the *time series*.

### 2.3 Cache-first flow (the core algorithm — applies to every tool)

```
1. Normalize input → cacheKey.
2. KV.get(cacheKey):
   - HIT (not expired) → return payload immediately. 0 Etsy calls. (logs cache_hit)
   - MISS / expired →
3. usageCounter.peek(): if at cap → try STALE cache (KV.get even if expired-marker kept) →
     if stale exists, return stale + flag {stale:true}; else 503 ETSY_QUOTA.
4. Call EtsyClient (increments usageCounter). Build payload via estimation engine.
5. KV.put(cacheKey, payload, {expirationTtl}). For keyword tools also INSERT a D1 history row.
6. Return payload {cached:false}.
```

- **Stale-while-error:** if a live call fails (timeout/5xx) but a stale cache entry exists, return stale rather than erroring (better UX, fewer charges-blocked). KV TTL auto-evicts, so to keep a stale copy we store with a **soft TTL field inside the value** (`{ payload, fetchedAt }`) and a **hard KV TTL = 2× soft TTL**; "fresh" = within soft, "stale" = past soft but within hard.
- **Credit interaction:** see §4.0 — **cache hits still charge** the tool's credit cost (the user gets a result; cost is for the *analysis*, not the upstream call). Estimated-data-served-from-quota-stale still charges. Only **errors** (≥400) charge 0.

### 2.4 Migration `0003_etsy.sql` (Engineer F owns, NEW file)

```sql
-- Phase 3: Etsy data layer (cache history + quota counter + saved analyses).

-- Daily Etsy API usage counter (§1.5). One row per UTC day.
CREATE TABLE etsy_api_usage (
  day    TEXT PRIMARY KEY,              -- 'YYYY-MM-DD' UTC
  count  INTEGER NOT NULL DEFAULT 0
);

-- Keyword estimate history — time series for trendDelta (§3.4). KV holds current payload;
-- this holds point-in-time snapshots so trends/delta can compare periods.
CREATE TABLE keywords_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword       TEXT NOT NULL,          -- normalized
  category_id   INTEGER,               -- taxonomy node, nullable
  demand_score  INTEGER NOT NULL,      -- 0-100 estimate (§3.1)
  result_count  INTEGER NOT NULL,      -- competing listings (proxy competition)
  competition   TEXT NOT NULL,         -- 'low'|'medium'|'high'
  captured_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_keywords_cache_kw ON keywords_cache(keyword, captured_at);

-- Saved tool analyses (Phase 2 deferred this; Phase 3 introduces optional persistence so
-- rank-check can show a real history chart instead of mock). Per-user, per-tool.
CREATE TABLE analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,           -- 'rank-check' | 'listing-analyzer' | ...
  subject     TEXT NOT NULL,           -- listing_id | shop_id | keyword
  payload     TEXT NOT NULL,           -- JSON snapshot
  metric      INTEGER,                 -- e.g. rank position, for cheap charting
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_analyses_user_tool ON analyses(user_id, tool, subject, created_at);
```

> `analyses` is **optional** for tools other than rank-check in Phase 3 (rank-check needs it for a real history chart; others may write but FE does not yet read history). Keeping the table now avoids a 4th migration later. (Open Q5.)

---

## 3. Estimation engine (Layer 2)

**Location:** `src/lib/server/services/estimation/` (Engineer **G** owns). Pure functions, **no I/O, no Etsy import** — they take already-fetched Layer-1 data and return estimates. This makes every formula **unit-testable in isolation** (the priority: formulas are the riskiest, most-scrutinized part). The tool services (§4, Engineer F) call EtsyClient, then pass raw data into these pure functions.

> **Honesty principle (strategy doc + research):** every number these produce is an **estimate**. The response carries `"estimated": true` flags and the FE renders an "Estimated" badge (§6). We never present estimates as official Etsy data.

### 3.1 `demandScore(input) → { score: 0-100, label: 'low'|'medium'|'high' }`

**Available signals (API-only, no scraping):**
- `resultCount` — number of active listings for the keyword (from `findActiveListings` `count` field). Proxy for **competition AND market size**.
- `aggregateReviewVelocity` — sum of recent-review counts across the top-N listings for the keyword (proxy for **actual buying activity** = real demand signal). This is the closest thing to real demand the API offers.
- `favoritesSignal` — sum of `num_favorers` across top-N listings (engagement proxy).

**Excluded signals (and why):**
- ❌ **Etsy autocomplete frequency** — undocumented internal endpoint, scraping-adjacent, DataDome risk (research §4.1, 02_alternatives §4.1). **Recommend OUT for Phase 3.** (Open Q2 — PM may want it later behind Layer-4-style risk isolation.)
- ⚠️ **Google Trends** — *relative external* demand, free, unofficial API. **Feasibility on Workers: marginal.** The common `google-trends-api` npm lib is Node-oriented and unofficial; on Workers we'd call the undocumented `trends.google.com/trends/api/*` endpoints via fetch (returns `)]}',`-prefixed JSON). It works but is fragile and rate-limited by Google. **Recommendation: defer Google Trends to a later iteration; Phase 3 demandScore uses review-velocity + favorites + resultCount only.** Designed as a pluggable signal so Trends can be added behind the same function later. (Open Q3.)

**Formula (proposed, calibratable — coefficients in `estimation/config.ts`):**
```
// Normalize each signal to 0-100 via log scaling (long-tail distributions).
demandRaw   = w_velocity * norm(aggregateReviewVelocity)   // weight 0.55  (best real signal)
            + w_faves    * norm(favoritesSignal)            // weight 0.25
            + w_size     * norm(resultCount)                // weight 0.20  (market exists at all)
score       = clamp(round(demandRaw), 0, 100)
label       = score >= 67 ? 'high' : score >= 34 ? 'medium' : 'low'
norm(x)     = min(100, 100 * log10(1 + x) / log10(1 + SCALE_x))   // SCALE per signal in config
```
> `aggregateReviewVelocity` weighted highest because reviews-over-time is the only signal tied to **real transactions**. Result count alone is a *competition* proxy, not demand — high result count can mean saturated, not in-demand. Weights are starting points; Layer 4 (own-shop sales, Phase 4) calibrates them.

### 3.2 `salesEstimate(input) → { monthlySales: number, monthlyRevenue: string, estimated: true }`

**The only viable method (research §4):** review-velocity × category conversion factor. Etsy buyers leave reviews at a **category-dependent rate** (jewelry buyers review more than digital-download buyers, etc.).

```
reviewsLast90d   = count reviews in trailing 90 days (from getReviewsByListing/Shop timestamps)
reviewsPerMonth  = reviewsLast90d / 3
// Only a fraction of buyers review → divide by review rate to back out sales.
monthlySales     = round(reviewsPerMonth / REVIEW_RATE[categoryId])   // REVIEW_RATE ~0.10-0.30
monthlyRevenue   = monthlySales * avgPrice                            // avgPrice from listing(s)
```
- `REVIEW_RATE` table per top-level category in `estimation/config.ts` (default 0.15 if unknown). Source: industry-reported ~10–30% review rates (02_alternatives §1.2, §4.4) — these are **estimates of estimates**; label loudly.
- Shop-level: sum over shop's listings, or use `getReviewsByShop` total velocity × shop avg price.
- **Confidence band:** return `monthlySales` plus a `±` range (e.g. ×0.6 to ×1.7) so the FE *can* show a range; FE may show point estimate with "Estimated" badge. (Open Q4 — show range or point?)

### 3.3 `competitionLevel(resultCount) → 'low'|'medium'|'high'`

Pure bucket on active-listing count (the one competition signal the API gives directly):
```
resultCount < 1,000        → 'low'
1,000 ≤ resultCount < 20,000 → 'medium'
resultCount ≥ 20,000       → 'high'
```
Buckets in `config.ts` (calibratable). Matches the eRank/Marmalead approach (02_alternatives §4.2) and the FE's existing `low/medium/high` Badge component.

### 3.4 `trendDelta(currentSnapshot, priorSnapshot) → { change: '+12%'|'-5%', direction: 'up'|'down'|'stable' }`

Compares `demandScore` (or `resultCount`/velocity) for the same keyword between two cache periods from `keywords_cache` (§2.2):
```
prior   = most recent keywords_cache row older than (now - 6 days) for this keyword
current = freshly computed (or latest) demandScore
pct     = (current - prior) / max(prior, 1) * 100
direction = pct > +3 ? 'up' : pct < -3 ? 'down' : 'stable'
change    = (pct>=0?'+':'') + round(pct) + '%'
```
- **Cold start:** if no prior snapshot exists (< 6 days of history), `direction='stable'`, `change='—'`, `estimated:true` + a "building history" note. Trends become meaningful only after the weekly cron has run ≥2 cycles. **This is an honest limitation, documented in §6 (etsy-trends empty/early state).**

### 3.5 `rankEstimate` (rank-check)

```
listings = findActiveListings({ keywords, sortOn:'score', sortOrder:'desc', limit:100 })
position = index of target listing_id in results (1-based); null if not in top 100
```
- **Label: "Estimated position"** — this is NOT the personalized rank a buyer sees (research §3 "⚠️"). `sort_on=score` had a historical bug; we surface it as an estimate only.
- History: each rank-check writes an `analyses` row (`tool='rank-check'`, `subject=listing_id+kw`, `metric=position`). The FE 7-day chart reads real history from `analyses` (replaces mock). Early on the chart shows only the points collected so far (honest, grows over time).

### 3.6 Estimation `config.ts` (the calibration surface)

All coefficients/buckets/scales live in **one file** `estimation/config.ts` so calibration (Phase 4 Layer-4 data) is a single-file change and so reviewers see every magic number in one place: `DEMAND_WEIGHTS`, `NORM_SCALES`, `REVIEW_RATE` (per category), `COMPETITION_BUCKETS`, `TREND_THRESHOLD`. (BR-P3-EST-01: no estimation magic numbers outside `config.ts`.)

---

## 4. API contract — 7 endpoints

**All routes in `src/lib/server/api/routes/etsy-tools.ts`** (Engineer **F** owns — NEW file, default-exported `Hono<AppEnv>`). Mounted the same way Phase 2's `llm-tools.ts` is — **re-mounted inside C's `tools.ts`** with one line `tools.route('/', etsyTools)` (see §8 ownership & ordering vs Phase 2).

### 4.0 Shared middleware chain & credit invariant (carries from Phase 1/2)

```
router.post('/<tool>', requireAuth, requireCredits('<tool-key>'), handler)
```
- `requireCredits` pre-checks balance, runs handler, deducts **only on 2xx**, merges `creditsRemaining` into the JSON body. (`requireCredits.ts`, Phase 1, reused unchanged.)
- **BR-P3-01 (core invariant):** any failure — `EtsyConfigError`(503), `EtsyTimeout`(504), `EtsyRateLimit`(429), `QuotaExceeded`(503), `NotFound`(404), validation(400) — returns ≥400 → **0 credits charged.** Identical to Phase 2 BR-P2-01.
- **Cache hits DO charge** (user got a result). Stale-served (quota/error degradation) DO charge but include `{stale:true}`. (Open Q6 — should stale charge less/nothing? BA recommends charging normally; the analysis is still delivered.)
- Error body shape uniform `{ error, message }` (Phase 1 §9). Etsy error codes: `ETSY_UNAVAILABLE`(503/502), `ETSY_TIMEOUT`(504), `ETSY_BUSY`(429), `ETSY_QUOTA`(503), `NOT_FOUND`(404).

### 4.1 `POST /api/tools/listing-analyzer` — cost **3**

**Input (zod):** `{ listing: string (min 1) }` — a listing URL or numeric ID. Route extracts `listing_id` (parse URL `…/listing/{id}/…` or bare digits → 400 if neither).

**Data source:** Layer 1 (`getListing` + `getListingImages` + `getReviewsByListing`) + Layer 2 (`salesEstimate`). Output **maps onto the FE `MOCK_LISTING` shape**:

| FE field | Source | Notes |
|---|---|---|
| `title`, `shop`, `price`, `date` | API `getListing` (+`Shop` include) | real |
| `rating`, `numRatings` | API reviews (avg + count) | real |
| `scores.{title,tags,images,video,description}.score` | **estimation/audit** (§4.1.1) | rule-based audit, **estimated** |
| `scores.*.feedback.{clarity,seo}[]` | rule-based audit text | generated from rules, not LLM (Phase 3 = no LLM here) |
| `stats.estimatedSales` | `salesEstimate.monthlySales` | **Estimated** badge |
| `stats.estimatedRevenue` | `salesEstimate.monthlyRevenue` | **Estimated** badge |
| `stats.faves` | API `num_favorers` | real |
| `stats.views` | ❌ **not available** for others' listings | **REMOVE the Views StatCard** OR show "—" with tooltip "Not available via Etsy API". BA recommends **remove** (don't show a fake number). (Open Q7) |

**§4.1.1 Listing audit scoring** (rule-based, deterministic, no LLM): title length/keyword/delimiter checks, tag count (13?) & length (≤20), image count (≥5?), has-video (binary), description length/structure. Produces `score` (0-100) + `clarity`/`seo` feedback arrays matching the FE shape. These rules live in `estimation/listingAudit.ts` (Engineer G). **All `feedback` text is template-based** (no LLM call → no LLM cost, deterministic, testable).

### 4.2 `POST /api/tools/shop-analyzer` — cost **3**

**Input (zod):** `{ shop: string (min 1) }` — shop name or URL. Route resolves name → `shop_id` via `findShops` (cache `shopname:` key).

**Data:** Layer 1 (`getShop`, `getActiveListingsByShop`, `getReviewsByShop`) + Layer 2 (`salesEstimate` per shop & per listing). Maps onto FE `MOCK_SHOP`:

| FE field | Source | Notes |
|---|---|---|
| `name,title,rating,numRatings,location,created` | API `getShop` | real |
| `stats.activeListings` | API `listing_active_count` | real |
| `stats.totalReviews` | API reviews count | real |
| `stats.averagePrice` | computed from listings | real |
| `stats.totalFaves` | sum `num_favorers` | real |
| `stats.reviewRate` | reviews / sales-estimate | **estimated** |
| `stats.monthlySales,monthlyRevenue,totalSales,totalRevenue,salesPerListing` | `salesEstimate` | **Estimated** badge (these are the headline numbers — must be clearly labeled) |
| `stats.percentile` ("more sales than X%") | ❌ requires cross-shop sales distribution we don't have | **REMOVE** or replace with a category-relative estimate flagged "rough estimate". BA recommends remove. (Open Q7) |
| `tags[]` (most-used tags + count) | aggregate tags across shop listings (count occurrences) | real (computed) |
| `listings[].{title,price}` | API | real |
| `listings[].scores` | listing audit (§4.1.1) | estimated |
| `listings[].{sales,revenue}` | `salesEstimate` per listing | **Estimated** |
| `listings[].views` | ❌ not available | remove column or "—" |
| `listings[].faves` | API `num_favorers` | real |
| `reviews` tab (distribution, recent) | API `getReviewsByShop` | real |
| `about` tab (location, currency, vacation, announcement, etc.) | API `getShop` fields | real (some optional) |

> shop-analyzer is the **heaviest quota consumer** (paginate listings + reviews). **Cap pagination** at e.g. 100 listings + 100 reviews per analysis (config) to bound calls. Cache 24h. This single tool justifies the whole cache layer.

### 4.3 `POST /api/tools/rank-check` — cost **2**

**Input (zod):** `{ listing: string, keyword: string (min 1) }`.
**Data:** Layer 2 `rankEstimate` (§3.5) + `analyses` history.

| FE field | Source | Notes |
|---|---|---|
| `currentRank` (#15) | `rankEstimate.position` | **"Estimated position"** label; null → "Not in top 100" |
| `bestRank` + date | min over `analyses` history | real history |
| competing listings count (12,847) | `findActiveListings.count` | real |
| `rankHistory[]` (7-day chart) | `analyses` rows for this listing+kw | **real history, grows over time**; early = few points |
| "Up 3 spots" delta | current vs prior history row | computed |

### 4.4 `POST /api/tools/niche-finder` — cost **2**

**Input (zod):** `{ query: string (min 1) }` — category or keyword.
**Data:** Layer 2. Strategy: expand `query` into candidate niches (sub-keywords from taxonomy children of the matched node, or related terms), then for each compute `demandScore` + `competitionLevel` + `resultCount` + avgPrice + `trendDelta`. Maps onto FE `MOCK_NICHES` rows:

| FE field | Source | Notes |
|---|---|---|
| `niche` | candidate sub-niche name (taxonomy-derived) | — |
| `competition` (low/med/high) | `competitionLevel` | real-ish (result-count proxy) |
| `demand` (low/med/high) | `demandScore.label` | **estimated** |
| `avgPrice` | computed from sample listings | real |
| `listings` (count) | `findActiveListings.count` | real |
| `growth` (+32%) | `trendDelta.change` | **estimated**; "—" until history exists |

> niche-finder candidate generation: prefer **taxonomy children** of the matched node (deterministic, free) over LLM expansion. If `query` doesn't match a taxonomy node, fall back to a small fixed related-term expansion. (Open Q8 — allow LLM to suggest niche names? That re-introduces Phase 2 llmService dependency; BA recommends taxonomy-only for Phase 3 to keep it data-driven.)

### 4.5 `POST /api/tools/best-sellers` — cost **2**

**Input (zod):** `{ category?: string, view?: 'shops'|'listings' (default 'shops') }`.
**Data:** **served from cron-built cache** (§5) — `bestsellers:{category_id}`. best-sellers is **not computed on-demand** (too quota-heavy); the cron pre-builds rankings for seed categories. On-demand request for an **uncached** category → either (a) return "category not yet indexed, showing popular categories" or (b) trigger a one-off build if quota allows. BA recommends (a) for Phase 3.

| FE field (`MOCK_SHOPS`) | Source | Notes |
|---|---|---|
| `rank` | review-velocity ranking position | **Estimated ranking** label (no official best-seller data) |
| `name,country,countryCode,rating,opened,listings,faves` | API `getShop` per shop | real |
| `sales` | `salesEstimate` (review-velocity) | **Estimated** badge — headline number |

> **Honest framing:** "Top shops by estimated sales (review-velocity based)". The page header should say "Estimated" — there is no official best-seller list (research §3). Seed categories only (§5).

### 4.6 `POST /api/tools/etsy-trends` — cost **2**

**Input (zod):** `{ filter?: string }` (FE filters client-side too).
**Data:** **served from cron-built cache** `trends:{category_id}` aggregated across seed categories. Each row = a tracked keyword with `demandScore` history → `trendDelta`.

| FE field (`MOCK_TRENDS`) | Source | Notes |
|---|---|---|
| `keyword` | tracked keyword (cron seed list) | — |
| `category` | taxonomy node name | real |
| `searches` (142,000) | ❌ **no search volume exists** | replace with `demandScore` (0-100) **OR** estimated-demand-index. **Rename column "Monthly Searches" → "Demand Index (est.)"**. (Open Q9 — column rename needs FE copy change) |
| `trend` (up/down/stable) | `trendDelta.direction` | from `keywords_cache` history |
| `change` (+12%) | `trendDelta.change` | **estimated**; "—" until ≥2 cron cycles |

> **Critical FE change:** the "Monthly Searches" column shows fabricated absolute volumes today. We have **no** search volume. Must rename to a demand index (0-100 or relative) and label "Estimated". This is the most visible honesty fix in Phase 3.

### 4.7 `POST /api/tools/buyer-check` — cost **2** — **REDEFINED**

**buyer data does not exist in any source** (research §3–4). Redefine per strategy doc → **"Shop / Review Reputation Check"**: analyze a **shop's** public reviews for reputation/risk signals (consistency, rating trend, volume), reusing `getReviewsByShop`.

**Input (zod):** `{ shop: string (min 1) }` — **shop name/URL, NOT a buyer username.**

| Old FE field | New mapping | Notes |
|---|---|---|
| `username` | → **shop name** | input + display |
| `memberSince` | shop `created` date | real |
| `totalReviews` | API review count | real |
| `avgRating` | API avg rating | real |
| `riskLevel` (low/med/high) | computed reputation risk (rating <4.0 / high negative-review ratio / sudden rating drop → higher risk) | **estimated** label |
| `92% Positive` | % reviews ≥4 stars | real (computed) |
| `Account Age` | from `created` | real |
| `reviews[]` (per shop, rating, text, date) | `getReviewsByShop` (recent) | real — but `shop` field becomes "listing/product" within this shop |

**§4.7.1 — FE text/copy changes required (call out explicitly to Engineer E):**
- Page `description`: "Check any Etsy **buyer** before fulfilling…" → "Check any Etsy **shop's reputation** — review history, rating consistency, and risk signals."
- Label "Buyer username" → "Shop name or URL"; placeholder `sarah_crafts` → `CaitlynMinimalist`.
- Heading/avatar uses shop name, not username. "Member since" → "Shop opened".
- `data-testid="buyer-username"` may stay (or rename to `shop-input`) — E's call; flag in PR.
- **Route name stays `/buyer-check`** and nav label may stay "Buyer Check" for now (PM Q10: rename nav to "Reputation Check"? Affects sidebar + routing). BA recommends keeping the URL, updating only visible copy in Phase 3, renaming nav in a later polish pass.

### 4.8 Tool costs (update `toolCosts.ts` — Engineer C's file, §8)

`toolCosts.ts` **already declares**: `listing-analyzer:3, shop-analyzer:3, rank-check:2, niche-finder:2`. **Missing → C must ADD:** `best-sellers:2, etsy-trends:2, buyer-check:2`.

| Tool | Key | Cost | Rationale |
|---|---|---|---|
| listing-analyzer | `listing-analyzer` | 3 | multi-call (listing+images+reviews) |
| shop-analyzer | `shop-analyzer` | 3 | heaviest (paginated) |
| rank-check | `rank-check` | 2 | single search + history |
| niche-finder | `niche-finder` | 2 | multi-keyword sampling |
| best-sellers | `best-sellers` | 2 | cache read (cron pre-built) |
| etsy-trends | `etsy-trends` | 2 | cache read (cron pre-built) |
| buyer-check | `buyer-check` | 2 | reviews fetch |

> Note: best-sellers/etsy-trends are mostly **cache reads** (cheap on quota) but still charge 2 (value delivered). (Open Q11 — discount cache-read tools to 1? Against free=30 pool.)

---

## 5. Cron jobs (Cloudflare Cron Triggers)

**Owner: Engineer F.** Cron handler in `src/lib/server/cron/etsyRefresh.ts`, wired via a Worker `scheduled` handler. (SvelteKit adapter-cloudflare: add `scheduled` export; `wrangler.jsonc` needs a `triggers.crons` entry — **Engineer A's file** `wrangler.jsonc`, so A makes that one-line addition, see §8 / Q12.)

### 5.1 What cron builds (pre-warm cache so user requests are cheap & fast)

| Job | Schedule | Builds | Cache key |
|---|---|---|---|
| **taxonomy refresh** | weekly (Sun 00:00 UTC) | category tree | `taxonomy` (30d) |
| **trends + keyword snapshots** | weekly (Sun 01:00 UTC) | for each seed keyword: `demandScore` + write `keywords_cache` history row | `trends:{cat}` (7d) + D1 rows |
| **best-sellers** | weekly (Sun 02:00 UTC) | per seed category: top shops by review-velocity | `bestsellers:{cat}` (7d) |

> Weekly (not daily) because: trends/best-sellers TTL = 7d, and weekly keeps cron quota tiny. `trendDelta` needs ≥2 weekly snapshots → meaningful trends after ~2 weeks (documented limitation).

### 5.2 Seed category + keyword list (`cron/seeds.ts`, Engineer F)

Seed = the popular Etsy categories the FE implies. Proposed seed set (≈12, calibratable):
`jewelry, home_decor, digital_downloads, art, clothing, party_supplies, stickers, craft_supplies, paper_party, wedding, candles, bags_purses`. Each category → ~10 seed keywords (e.g. jewelry → "personalized necklace", "name necklace", "birthstone necklace"…). Total ≈ 120 keywords.

### 5.3 Cron quota budget (protect user-request headroom)

- Per weekly run estimate: taxonomy (~5 calls) + trends (120 keywords × ~3 calls for top-listing sampling ≈ 360) + best-sellers (12 categories × ~10 shops × 2 calls ≈ 240) ≈ **~600 calls/week ≈ 86/day amortized**.
- **Cron uses the SAME `usageCounter`** and must **stop if it would push usedToday above a cron sub-cap** (`ETSY_CRON_CAP`, default 2000/day) — leaves ≥6000/day for users. Cron is **resumable/idempotent** (each keyword/category cached independently; a partial run just resumes next trigger).
- Because cron is weekly and bounded, it never starves user requests. (BR-P3-CRON-01: cron never exceeds `ETSY_CRON_CAP`; degrades gracefully by deferring remaining seeds to the next run.)

---

## 6. FE wiring — 7 pages (Engineer **E** owns all pages + shared client)

Reuse Phase 2's `tools-client.ts` `callTool<T>` helper (already specced in Phase 2 §4). Every page needs: **loading**, **error** (inline banner from `{error,message}`), **empty** (no-results), **402 → upgrade CTA → `/pricing`**, **"Estimated" badge** on every estimated number, **credits badge update** from `creditsRemaining`.

**Shared "Estimated" affordance:** a small reusable `<EstimatedBadge tooltip="…"/>` component (Engineer E, NEW `src/lib/components/ui/EstimatedBadge.svelte`) — used wherever a value is an estimate. Tooltip copy: "Estimated from public Etsy data — not an official Etsy figure."

Per page (deltas from mock):
1. **listing-analyzer** — replace `MOCK_LISTING`; `callTool('listing-analyzer',{listing})`; loading/error/empty (listing not found → friendly 404 message); **remove Views StatCard** (Q7); EstimatedBadge on Sales/Revenue + all score sections.
2. **shop-analyzer** — replace `MOCK_SHOP`; resolve-by-name; EstimatedBadge on all sales/revenue/percentile; **remove `percentile` card + listing `views` column** (Q7); reviews/about tabs from real API.
3. **rank-check** — replace mock; chart reads **real `rankHistory`** (few points early — show "collecting data" if <2 points); "Estimated position" label on currentRank.
4. **niche-finder** — replace `MOCK_NICHES`; EstimatedBadge on demand + growth; empty state if query yields no niches.
5. **best-sellers** — replace `MOCK_SHOPS`; **page-level "Estimated rankings" note**; category selector → seed categories; "listings" view may be Phase 3.1 if scope-tight (Q13).
6. **etsy-trends** — replace `MOCK_TRENDS`; **rename "Monthly Searches" → "Demand Index (est.)"** (Q9); EstimatedBadge; "building history" note until trends exist.
7. **buyer-check** — **biggest copy change** (§4.7.1): all "buyer" → "shop reputation"; input → shop; EstimatedBadge on risk level.

> All FE can be built against a **mock response** matching §4 shapes before backend is live (same as Phase 2).

---

## 7. Test plan (runs with NO real Etsy key — mandatory)

**Constraint:** no `ETSY_API_KEY`. Every automated test uses `createMockEtsyClient(fixtures)` or injected `fetchImpl`. Real verification = a separate manual script.

### 7.1 Fixtures (Engineer F) — `src/lib/server/services/etsy/__fixtures__/`
Build from the **documented v3 response shapes** (research §3): `listing.json`, `listingPage.json` (search results w/ count), `shop.json`, `shopListings.json`, `reviewsShop.json`, `reviewsListing.json`, `taxonomy.json`, `error429.json`, `error404.json`. These are the single source of truth for mock client + tests.

### 7.2 Unit — estimation (Engineer G; highest priority)
- `demandScore`: known signal inputs → expected score/label; monotonicity (more velocity ⇒ ≥ score); clamping 0–100; cold-start.
- `salesEstimate`: review-velocity × REVIEW_RATE math; category factor lookup; 0-reviews → 0 sales; revenue = sales×price.
- `competitionLevel`: bucket boundaries (999/1000/19999/20000).
- `trendDelta`: up/down/stable thresholds; cold-start "—"; division-by-zero guard (prior=0).
- `listingAudit`: title >140, <13 tags, no video, short description → expected score deltas + feedback text.
- **BR-P3-EST-01**: all coefficients sourced from `config.ts` (test imports config, not literals).

### 7.3 Unit — EtsyClient (mock `fetchImpl`)
- Builds correct URL + `x-api-key` header per method.
- 429 → backoff → `EtsyRateLimitError` after retries (fake timers).
- 5xx → one retry → `EtsyUpstreamError`; 404 → `EtsyNotFoundError`; 401 → `EtsyConfigError`; timeout → `EtsyTimeoutError`.
- `getListingsByListingIds` batches (one call for N ids) and increments usage by 1.

### 7.4 Unit/integration — cache + quota
- Cache **hit** → 0 Etsy calls (assert mock fetch not called), payload returned.
- Cache **miss** → 1+ calls, KV written, D1 history row written (keyword tools).
- **Stale-while-error**: live call fails + stale exists → stale returned with `{stale:true}`.
- **Quota guard**: usageCounter at cap → `QuotaExceeded` → 503 `ETSY_QUOTA`, **no charge**, stale served if present.
- Concurrency: two parallel misses don't double-charge credits (each is its own request; cache may be written twice — acceptable, last-write-wins).

### 7.5 Integration — routes (mock client)
- Each of 7 tools: happy path → 200 + correct FE shape + `creditsRemaining` decremented by cost.
- Failure (Etsy down/timeout/quota/404/bad input) → correct status AND **ledger has no `spend:<tool>` row** (BR-P3-01).
- Insufficient credits → 402, Etsy **never called**, no charge.
- buyer-check: input `{shop}` (not `{username}`) validated; output reputation shape.

### 7.6 Cron tests
- Cron handler respects `ETSY_CRON_CAP` (stops/defers when budget hit).
- Idempotent: re-run with everything cached → ~0 new Etsy calls.
- Writes `trends:`/`bestsellers:` KV + `keywords_cache` rows.

### 7.7 FE smoke (Engineer E)
- Each page: mock fetch → loading shows, success renders real shape, error banner on 5xx, empty state, 402 → upgrade CTA, EstimatedBadge present on estimated fields, badge updates from `creditsRemaining`.
- buyer-check: asserts new "shop reputation" copy + `{shop}` request body.
- etsy-trends: asserts "Demand Index (est.)" column header (not "Monthly Searches").

### 7.8 Manual verification script — `scripts/verify-etsy.mjs` (Engineer F)
Run **only when a real key arrives**:
- Reads `ETSY_API_KEY` from `.dev.vars`/env; exits non-zero with clear message if missing (manual-only, never CI).
- Does one `findActiveListings` + one `getShop`(by a known public shop) + one `getReviewsByShop`, prints results + latency + **today's usage count**.
- Confirms real response shapes match fixtures (flags drift so fixtures can be updated).

---

## 8. Ownership split (no file overlap) + ordering

**Three engineers** (F = Etsy client/cache/cron/routes, G = estimation, E = FE — reuses Phase 2's E). Phase 2's owners: D=LLM, C=costs+mount, E=FE. **Phase 3 uses F + G (new) + E (shared with Phase 2).**

| Eng | Role | Owns (all NEW unless noted) | Depends on |
|---|---|---|---|
| **F** | Etsy data infra | `services/etsy/client.ts`, `etsy/mockClient.ts`, `etsy/provider.ts`, `etsy/cache.ts`, `etsy/usageCounter.ts`, `etsy/__fixtures__/*`, `api/routes/etsy-tools.ts`, `cron/etsyRefresh.ts`, `cron/seeds.ts`, `migrations/0003_etsy.sql`, `scripts/verify-etsy.mjs`, backend etsy/cache/route/cron tests | env `ETSY_API_KEY` (A adds, Q12), `requireCredits`/`requireAuth` (A), `creditsService` (C, shipped), estimation pure fns (G) |
| **G** | Estimation engine | `services/estimation/{demandScore,salesEstimate,competitionLevel,trendDelta,rankEstimate,listingAudit}.ts`, `estimation/config.ts`, `estimation/index.ts`, all estimation unit tests | nothing (pure fns over typed inputs — F's `EtsyListing`/`EtsyReview` types; **G and F agree on those types in `etsy/types.ts`, owned by F**, imported by G) |
| **C** | credit-cost seam | **edits** `services/toolCosts.ts` — ADD `best-sellers:2, etsy-trends:2, buyer-check:2`; **edits** own `routes/tools.ts` — add `tools.route('/', etsyTools)` (one line, same as Phase 2's llm mount) | F's `etsy-tools.ts` default export exists |
| **E** | FE | 7 `+page.svelte`, `src/lib/components/ui/EstimatedBadge.svelte` (NEW), reuse `tools-client.ts` (Phase 2), FE smoke | §4 contract (mock first) |
| **A** | env/config | **edits** `env.ts` add `ETSY_API_KEY?`, `ETSY_DAILY_CAP?`, `ETSY_CRON_CAP?`; **edits** `wrangler.jsonc` add `triggers.crons` + scheduled handler wiring | — |

**Shared-file coordination (the only overlap points — managed):**
- `etsy/types.ts` — **F owns**, defines `EtsyListing/EtsyShop/EtsyReview/...`. G imports them. Agree the type shapes up front (this spec §1.3) so G isn't blocked.
- `toolCosts.ts` + `tools.ts` — **C only** (one engineer), same as Phase 2. Exactly like Phase 2's mount pattern.
- `env.ts` + `wrangler.jsonc` — **A only** (already A's files).
- **No two engineers edit the same file.** ✔

### 8.1 Ordering vs Phase 2 (both phases not yet implemented)

> **Important:** Phase 2 is **specced but NOT implemented**. Phase 2 and Phase 3 share **E** (FE), **C** (toolCosts.ts + tools.ts mount), and **A** (env.ts). They define **different keys/files** so there is no *code* conflict, but the **shared files must be edited in a coordinated order**:

1. **`tools.ts` mount:** Phase 2 adds `tools.route('/', llmTools)`; Phase 3 adds `tools.route('/', etsyTools)`. Both are one-line additions by **C** to the **same file**. → **C makes both edits; do them in one PR or sequence Phase 2's mount first, then Phase 3's.** They don't conflict semantically (different sub-paths), but C must own the file edit order to avoid a merge clash.
2. **`toolCosts.ts`:** Phase 2 only *confirms* existing keys (no add). Phase 3 *adds* 3 keys. → no conflict; C edits once for Phase 3.
3. **`env.ts`:** Phase 2 needs `LLM_MODEL?` (A); Phase 3 needs `ETSY_*` (A). → A adds all in one edit.
4. **Engineer E:** owns 5 Phase-2 pages + 7 Phase-3 pages = 12 distinct page files (no overlap between the two sets). Sequence: E can do them in any order; recommend Phase 2 (simpler, LLM-only) first if both run, but they're independent.

**Recommended build order within Phase 3:**
1. **A** adds env fields + cron wiring (unblocks F).
2. **F** ships `etsy/types.ts` (unblocks G) + `migrations/0003` + `usageCounter` + `mockClient` + fixtures (everything testable immediately, no key).
3. **G** builds estimation pure fns + tests in parallel (depends only on `etsy/types.ts`).
4. **F** builds `client.ts`, `cache.ts`, `etsy-tools.ts` (consumes G's estimation), then `cron`.
5. **C** adds 3 tool costs (trivial, parallel) + mounts `etsy-tools.ts`.
6. **E** wires 7 FE pages against mock, finalizes once routes live; `EstimatedBadge` first (no backend dep).
7. **F** writes `verify-etsy.mjs` (manual bridge for when the key arrives).

---

## 9. Business rules (testable)

- **BR-P3-01** Any tool failure (Etsy down/timeout/quota/404/bad input/insufficient credits) charges **0 credits** (no `spend:<tool>` ledger row). [core invariant, = Phase 2 BR-P2-01]
- **BR-P3-02** A successful tool call charges exactly `TOOL_COSTS[key]` and returns `creditsRemaining`.
- **BR-P3-03** A **cache hit** makes **0 Etsy API calls** (does not increment `etsy_api_usage`) but still charges the tool cost.
- **BR-P3-04** Real Etsy calls increment `etsy_api_usage` for the UTC day; when `usedToday ≥ ETSY_DAILY_CAP`, live calls are refused (503 `ETSY_QUOTA`) and **stale cache is served if present**.
- **BR-P3-05** The cache is **global** (not per-user); identical input from any user hits the same entry.
- **BR-P3-06** Every estimated value in a response is flagged `estimated:true` and rendered with an "Estimated" badge in the UI; no estimate is presented as an official Etsy figure.
- **BR-P3-07** With no `ETSY_API_KEY`, tools serve from the **mock client** (dev/test) or return 503 `ETSY_UNAVAILABLE` (prod, no key) — never a 500 crash, never a charge.
- **BR-P3-08** `buyer-check` accepts a **shop** identifier and returns a shop-reputation result; it never claims to analyze a buyer.
- **BR-P3-09** Cron never pushes `etsy_api_usage` above `ETSY_CRON_CAP`; remaining seeds defer to the next run (idempotent).
- **BR-P3-10** `etsy-trends` and any "sales/searches" number never displays a fabricated absolute volume; demand is a labeled index, sales are labeled estimates.

## 10. Acceptance criteria (Given/When/Then highlights)

- **Given** a signed-in user with ≥3 credits, **When** they analyze a real listing ID, **Then** real title/price/reviews render, sales/revenue show "Estimated", and credits drop by 3.
- **Given** the same listing is analyzed by a second user within 24h, **When** they submit, **Then** the result returns from cache with **0 new Etsy calls** (and that user is still charged).
- **Given** daily Etsy usage has hit the cap, **When** a user requests fresh data, **Then** they see a friendly "at capacity" message (or stale data flagged stale), and **are not charged**.
- **Given** no Etsy key configured, **When** the test suite runs, **Then** all unit/integration/smoke tests pass against the mock client + fixtures.
- **Given** the buyer-check page, **When** a user enters a shop name, **Then** a shop reputation report renders (no "buyer" language anywhere).
- **Given** etsy-trends, **When** it loads, **Then** the column reads "Demand Index (est.)" — never a fake "Monthly Searches" number.
- **Given** rank-check run daily for a week, **When** viewing history, **Then** the chart shows the **real** collected points (not mock 7-day data).

## 11. Technical constraints & risks

- **No real key** → entire phase rides on the mock-client seam; `verify-etsy.mjs` is the only thing that needs the key, and it's manual.
- **10k/day quota** → cache-first + usageCounter + cron sub-cap are load-bearing; shop-analyzer is the quota hog (bounded pagination).
- **No search-volume/sales/trending/best-seller/buyer endpoints** → these are estimates or redefinitions; honesty labeling is a hard requirement, not polish.
- **Estimation accuracy** will be challenged (strategy risk table) → "Estimated" labels + Phase-4 (Layer-4 own-shop) calibration; coefficients isolated in `config.ts`.
- **Etsy commercial-app approval risk** (Optimsy) → out of eng scope but **go/no-go for prod**; build/test proceed on mock regardless (Q1).
- **Cloudflare Cron Triggers** require a real CF account + `wrangler.jsonc triggers` — works locally via `wrangler dev --test-scheduled`; A wires it.
- **Google Trends on Workers** is fragile/unofficial → deferred (§3.1, Q3).

## 12. Assumptions

- **A1** `env.ts` gains `ETSY_API_KEY?`, `ETSY_DAILY_CAP?`, `ETSY_CRON_CAP?` (Engineer A). Flagged, not silently assumed. (Q12)
- **A2** `keywords_cache` does **NOT** exist today (verified `0002_herorank.sql`); Phase 3 creates it in `0003` (Phase 2 spec's assumption it pre-exists was wrong).
- **A3** Phase 2 ships before/with Phase 3 mounts; both add a one-line route mount to C's `tools.ts` (coordinated by C, §8.1).
- **A4** review-velocity is the **only** viable sales/demand proxy (no views/units-sold cross-shop) — entire estimation engine is built on it.
- **A5** Seed categories/keywords (§5.2) are a starting set; PM may adjust. Cron weekly is sufficient for 7-day TTLs.
- **A6** "Estimated" labeling is acceptable product positioning (industry standard per research — eRank/EverBee all estimate).
- **A7** best-sellers & etsy-trends are **cache-read/cron-fed** (not real-time on-demand) in Phase 3.

---

## Open questions for PM

- **Q1** — Etsy **commercial app approval** is a product go/no-go (Optimsy was rejected). Build/test proceeds on mock regardless, but: do we submit now, and with what wording (research §1 recommends "shop management/listing optimization helper", avoid AI/analytics language)?
- **Q2** — Etsy **autocomplete** signal for demandScore: **OUT** for Phase 3 (undocumented, scraping-adjacent, DataDome). Confirm we defer it.
- **Q3** — **Google Trends** as a demand signal: BA recommends **defer** (fragile on Workers). OK to ship Phase 3 demandScore on review-velocity + favorites + result-count only?
- **Q4** — `salesEstimate`: show a **point estimate** (with badge) or a **range** (±)? Affects FE StatCards.
- **Q5** — Persist `analyses` for **all** tools now, or **rank-check only** (others write later)? BA recommends table now, write rank-check now.
- **Q6** — Should **stale-served** (quota/error degradation) results charge **normally**, **reduced**, or **nothing**? BA recommends normal (result delivered).
- **Q7** — **Remove** the unavailable fields (listing `views`, shop `percentile`) vs show "—"/tooltip? BA recommends remove (don't fabricate). Confirm — it changes FE layout.
- **Q8 / Q9** — niche-finder: taxonomy-only candidate generation (BA rec) vs allow LLM? · etsy-trends column rename "Monthly Searches" → "Demand Index (est.)" — confirm copy.
- **Q10** — buyer-check: keep URL `/buyer-check` + nav "Buyer Check", change only visible copy now (BA rec), or rename nav to "Reputation Check" this phase?
- **Q11** — Discount cache-read tools (best-sellers/etsy-trends) to **1 credit** since they're mostly cache reads, or keep at 2? (Against free=30 pool.)
- **Q12** — Confirm **A** adds `ETSY_API_KEY?`/`ETSY_DAILY_CAP?`/`ETSY_CRON_CAP?` to `env.ts` and `triggers.crons` + scheduled handler to `wrangler.jsonc`.
- **Q13** — best-sellers "listings" view (toggle) — Phase 3 or defer to 3.1 (shops view first)?
- **Q14** — `ETSY_DAILY_CAP=8000` / `ETSY_CRON_CAP=2000` defaults OK? (Leaves ~6000/day for users; revisit when real usage is known.)

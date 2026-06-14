# Contract F → G + E2 + QA (Phase 3 Etsy data layer)

> Engineer F, 2026-06-12. Branch `migrate-sveltekit`. All F files shipped, `npm run check` = 0
> errors, `npx vitest run` = 80 pass (27 new in `tests/etsy.test.ts`). Build full NOT run (per
> task). Do NOT edit F's files (list at bottom).

---

## 0. Where things live (F owns, all NEW unless noted)

```
src/lib/server/services/etsy/types.ts             ← raw Etsy v3 shapes + EtsyClient iface + tool RESPONSE shapes
src/lib/server/services/etsy/estimationContract.ts ← SIGNATURE BOUNDARY F↔G (G wires the real fns here)
src/lib/server/services/etsy/client.ts            ← createEtsyClient + typed errors + retry/backoff
src/lib/server/services/etsy/mock.ts              ← createMockEtsyClient(fixtures), defaultFixtures
src/lib/server/services/etsy/__fixtures__/*.json  ← documented v3 response fixtures
src/lib/server/services/etsy/usageCounter.ts      ← createUsageCounter (D1 quota guard)
src/lib/server/services/etsy/cache.ts             ← createEtsyCache (KV) + createKeywordHistory (D1) + cacheKeys + TTL
src/lib/server/services/etsy/analysesStore.ts     ← createAnalysesStore (rank-check history)
src/lib/server/services/etsy/provider.ts          ← getEtsyClient / getEtsyContext (real vs mock)
src/lib/server/services/etsy/refresh.ts           ← refreshTrends / refreshBestSellers / refreshTaxonomy (PURE; Phase 4 wires cron)
src/lib/server/services/etsy/seeds.ts             ← SEED_CATEGORIES
src/lib/server/api/routes/etsy-tools.ts           ← 7-endpoint Hono router (default export)
migrations/0003_etsy.sql                          ← etsy_api_usage + keywords_cache + analyses
scripts/verify-etsy.mjs                            ← manual real-key verification
src/lib/server/env.ts (EDITED)                    ← added ETSY_DAILY_CAP?, ETSY_CRON_CAP?
```

---

## 1. FOR ENGINEER G — estimation signatures (implement EXACTLY)

G ships `src/lib/server/services/estimation/index.ts` exporting these 6 PURE functions with the
EXACT types in `etsy/estimationContract.ts`. Inputs reference raw `Etsy*` types from
`etsy/types.ts` (F owns — import them, don't redeclare). NO I/O, NO Etsy client import inside.

```ts
import type { EtsyListing } from '$lib/server/services/etsy/types';
import type {
  DemandScoreInput, DemandScoreResult,
  SalesEstimateInput, SalesEstimateResult,
  TrendDeltaResult, RankEstimateInput, RankEstimateResult,
  ListingAuditResult, Estimation,
} from '$lib/server/services/etsy/estimationContract';

export function demandScore(input: DemandScoreInput): DemandScoreResult;
export function salesEstimate(input: SalesEstimateInput): SalesEstimateResult;
export function competitionLevel(resultCount: number): 'low' | 'medium' | 'high';
export function trendDelta(current: number, prior: number | null): TrendDeltaResult;
export function rankEstimate(input: RankEstimateInput): RankEstimateResult;
export function listingAudit(listing: EtsyListing): ListingAuditResult;
```

### Input/output detail (from `estimationContract.ts`)

| fn | input | output |
|---|---|---|
| `demandScore` | `{ resultCount, aggregateReviewVelocity, favoritesSignal }` | `{ score: 0-100, label: 'low'\|'medium'\|'high' }` |
| `salesEstimate` | `{ reviewsLast90d, avgPrice, categoryId?: number\|null }` | `{ monthlySales, monthlyRevenue: string, rangeLow, rangeHigh, estimated: true }` |
| `competitionLevel` | `resultCount: number` | `'low'\|'medium'\|'high'` (buckets <1000 / <20000 / ≥20000) |
| `trendDelta` | `(current: number, prior: number\|null)` — values are demandScore 0-100; `prior=null` = cold start | `{ change: '+12%'\|'-5%'\|'—', direction: 'up'\|'down'\|'stable' }` |
| `rankEstimate` | `{ orderedListingIds: number[], targetListingId }` | `{ position: number\|null }` (1-based; null = not in window) |
| `listingAudit` | `EtsyListing` (with `.images`, `.tags`, `.videos`) | `{ title, tags, images, video, description }` each `{ score: 0-100, feedback: { clarity[], seo[] } }` |

`feedback` items: `{ status: 'good'|'warning'|'error'; text: string }`. The FE renders these
exactly (see `MOCK_LISTING.scores` in listing-analyzer page).

### Wiring step (G does this — ONE place)
In `etsy/estimationContract.ts`, function `getEstimation()` currently returns a PLACEHOLDER. After
G's `estimation/index.ts` exists, F flips the body to a memoized `import('../estimation')`. Until
then routes/tests use the placeholder (honest neutral values) + tests inject `__setEstimation()`.
**G must NOT edit `estimationContract.ts` signatures** — only ship `estimation/index.ts` matching
the `Estimation` interface. (If G prefers, F flips the import on G's signal.)

> Calibration: all magic numbers in G's `estimation/config.ts` (BR-P3-EST-01). `REVIEW_RATE` per
> top-level category keyed by `categoryId` (taxonomy node id), default ~0.15 when null/unknown.

---

## 2. FOR ENGINEER E2 — response shapes per endpoint (wire FE against these)

All in `etsy/types.ts`. Every body carries `cached: boolean`, optional `stale?: boolean`, and
`creditsRemaining` (merged by requireCredits on 2xx). Estimated fields flagged via an `estimated`
object → render `<EstimatedBadge>`. PM Q7: NO `views` / `percentile` fields exist (removed).

| Endpoint | Request body | Response type | Key fields |
|---|---|---|---|
| `POST /api/tools/listing-analyzer` | `{ listing: string }` (URL or ID) | `ListingAnalyzerResponse` | `title,shop,price,date,rating,numRatings` (real); `scores.{title,tags,images,video,description}` (estimated); `stats.{estimatedSales,estimatedRevenue,faves}`; `estimated:{sales,revenue,scores}`. **No `views`.** |
| `POST /api/tools/shop-analyzer` | `{ shop: string }` (name or URL) | `ShopAnalyzerResponse` | `name,title,rating,numRatings,location,created`; `stats.*` (sales/revenue/etc — many estimated); `tags[]`; `listings[]` (each `{id,title,price,grade,scores,sales,revenue,faves}` — **no `views`**); `reviews.{distribution,recent}`; `about`. **No `percentile`.** |
| `POST /api/tools/rank-check` | `{ listing: string, keyword: string }` | `RankCheckResponse` | `currentRank` (null=not in top 100, label "Estimated position"); `bestRank,bestRankDate`; `competingListings`; `delta`; `rankHistory[]` (REAL, grows over time — show "collecting data" if <2 points). |
| `POST /api/tools/niche-finder` | `{ query: string }` | `NicheFinderResponse` | `niches[]` each `{niche,competition,demand,avgPrice,listings,growth, estimated:{demand,growth}}`. `growth='—'` until history. |
| `POST /api/tools/best-sellers` | `{ category?: string, view?: 'shops'\|'listings' }` | `BestSellersResponse` | `shops[]` each `{rank,name,country,countryCode,rating,opened,listings,faves,sales}`; `sales` estimated; page-level "Estimated rankings" note. `fallback:true` + empty `shops[]` until cron runs. |
| `POST /api/tools/etsy-trends` | `{ filter?: string }` | `EtsyTrendsResponse` | `trends[]` each `{keyword,category,demandIndex(0-100),trend,change}`. **Column "Monthly Searches" → "Demand Index (est.)" (Q9)** — render `demandIndex`, NOT searches. `buildingHistory:true` until ≥2 cron cycles. |
| `POST /api/tools/buyer-check` | `{ shop: string }` **(shop, NOT username)** | `BuyerCheckResponse` | REDEFINED → shop reputation: `shop,shopOpened,totalReviews,avgRating,positivePct,accountAgeYears,riskLevel(estimated),reviews[]{product,rating,text,date}`. **All "buyer" copy → "shop reputation" (spec §4.7.1).** |

> Cron-fed tools (best-sellers, etsy-trends) return an honest EMPTY state before the first weekly
> cron run (`fallback:true` / `buildingHistory:true`, empty arrays) — FE should show an empty
> state, NEVER fabricated numbers (BR-P3-10).

---

## 3. FOR ENGINEER C — mount + tool costs

### Mount (one line, same as llm-tools — add to `routes/tools.ts`)
```ts
import etsyTools from './etsy-tools';
// ... after `router.route('/', llmTools);`
router.route('/', etsyTools);
```
Relative paths in etsy-tools.ts (`/listing-analyzer`, …) become `/api/tools/*` automatically.

### Tool costs (ADD to `services/toolCosts.ts`) — credits per PM Q11
`toolCosts.ts` ALREADY has `listing-analyzer:3, shop-analyzer:3, rank-check:2, niche-finder:2`.
**C must ADD these 3 keys:**
```ts
'best-sellers': 1,   // Q11: cache-read tool = 1 credit
'etsy-trends': 1,    // Q11: cache-read tool = 1 credit
'buyer-check': 2,    // direct API (reviews fetch) = 2
```
> NOTE: PM Q11 set best-sellers/etsy-trends to **1** (cache reads), overriding the spec table's 2.
> All 7 keys must be present or `requireCredits` returns 500 (unpriced tool).

---

## 4. FOR QA — invariants + how to test without a key

- **No Etsy key needed.** `provider.getEtsyClient(env)` returns the MOCK client when
  `env.ETSY_API_KEY` is absent → all 7 tools run end-to-end on fixtures.
- **BR-P3-01** any failure (≥400) charges 0 credits — `requireCredits` deducts only on `<400`.
- **BR-P3-03** cache HIT = 0 Etsy calls (no `usageCounter` increment) but still charges cost.
- **BR-P3-04** `usedToday ≥ cap` → `QuotaExceededError` → route 503 `ETSY_QUOTA`, serves stale if
  present, no charge.
- **BR-P3-06** every estimated value flagged in the `estimated` object.
- **BR-P3-08** buyer-check accepts `{shop}`, returns shop-reputation shape (no buyer claim).
- Error codes (from `mapEtsyError`): `ETSY_UNAVAILABLE`(503/502), `ETSY_TIMEOUT`(504),
  `ETSY_QUOTA`(503), `ETSY_BUSY`(429), `NOT_FOUND`(404), `VALIDATION`(400).
- Migration: run `npm run db:migrate:local` to apply `0003_etsy.sql` (3 new tables).
- F's tests: `tests/etsy.test.ts` (client/cache/quota/provider/mock/refresh). Estimation unit
  tests are G's; route credit-accounting is in `credits.test.ts`.

---

## 5. Files F owns — DO NOT EDIT
All `src/lib/server/services/etsy/*`, `src/lib/server/api/routes/etsy-tools.ts`,
`migrations/0003_etsy.sql`, `scripts/verify-etsy.mjs`, `tests/etsy.test.ts`.
`src/lib/server/env.ts` — F added `ETSY_DAILY_CAP?`/`ETSY_CRON_CAP?` (per task; coordinate with A
if A also touches env — additive, no conflict expected).

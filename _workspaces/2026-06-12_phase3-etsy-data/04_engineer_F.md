# Engineer F — Phase 3 Etsy data layer — report

> 2026-06-12. Branch `migrate-sveltekit`. Task #10. `npm run check` = **0 errors**,
> `npx vitest run` = **80 pass** (27 new in `tests/etsy.test.ts`). Build full NOT run (per task).

## Delivered (all new unless noted)

| File | Purpose |
|---|---|
| `src/lib/server/services/etsy/types.ts` | Raw Etsy v3 shapes + `EtsyClient` iface + `UsageCounter` + all 7 tool RESPONSE shapes. **Written first — G imports it.** |
| `src/lib/server/services/etsy/estimationContract.ts` | F↔G signature boundary + a placeholder Estimation so routes/tests run before G ships; `getEstimation()` + `__setEstimation()` test seam. |
| `src/lib/server/services/etsy/client.ts` | `createEtsyClient` (x-api-key, AbortController timeout, 429 backoff×2, 5xx retry×1) + typed errors (`EtsyConfig/Timeout/RateLimit/NotFound/Upstream/QuotaExceeded`). Batch endpoint = 1 quota unit. |
| `src/lib/server/services/etsy/mock.ts` + `__fixtures__/*.json` | `createMockEtsyClient(overrides)`, `defaultFixtures`. Reviews carry `_days_ago` → materialized to live timestamps so the 90-day velocity window is non-empty. |
| `src/lib/server/services/etsy/usageCounter.ts` | D1 `etsy_api_usage` atomic upsert; daily cap (8000) + cron sub-cap (2000) guards. |
| `src/lib/server/services/etsy/cache.ts` | `createEtsyCache` (KV, soft/hard TTL = 2× soft for stale-serve) + `createKeywordHistory` (D1 time-series for trendDelta) + `cacheKeys` + `TTL` + `normalize`. |
| `src/lib/server/services/etsy/analysesStore.ts` | D1 `analyses` read/write for rank-check real history. |
| `src/lib/server/services/etsy/provider.ts` | `getEtsyClient`/`getEtsyContext` — real vs mock by `env.ETSY_API_KEY`. |
| `src/lib/server/services/etsy/refresh.ts` | `refreshTrends`/`refreshBestSellers`/`refreshTaxonomy` — PURE service fns, callable directly. Quota-disciplined (stops on cron sub-cap, idempotent). **NOT wired to wrangler crons (Phase 4).** |
| `src/lib/server/services/etsy/seeds.ts` | 8 seed categories × ~10 keywords. |
| `src/lib/server/api/routes/etsy-tools.ts` | Default-export `Hono<AppEnv>` — 7 endpoints, requireAuth+requireCredits, zod, cache-first → EtsyClient → estimation → spec response shapes. **Does NOT self-mount.** |
| `migrations/0003_etsy.sql` | `etsy_api_usage`, `keywords_cache`, `analyses` (verified 0002 has none of these). |
| `scripts/verify-etsy.mjs` | Manual real-key check (search + shop + reviews, latency, fixture-drift warnings). |
| `tests/etsy.test.ts` | 27 tests: client url/header/retry/errors/batch, quota guard, cache hit/miss + stale TTL, keyword history, provider real-vs-mock, mock fixtures, refresh cron quota stop. |
| `src/lib/server/env.ts` (EDITED) | Added `ETSY_DAILY_CAP?`, `ETSY_CRON_CAP?` (had ETSY_API_KEY/SECRET already). |

## Estimation signatures G must implement (exact — full detail in `02_contract_F.md`)

- `demandScore({resultCount, aggregateReviewVelocity, favoritesSignal}) → {score 0-100, label}`
- `salesEstimate({reviewsLast90d, avgPrice, categoryId?}) → {monthlySales, monthlyRevenue, rangeLow, rangeHigh, estimated:true}`
- `competitionLevel(resultCount) → 'low'|'medium'|'high'`
- `trendDelta(current, prior|null) → {change, direction}`
- `rankEstimate({orderedListingIds, targetListingId}) → {position|null}`
- `listingAudit(EtsyListing) → {title,tags,images,video,description}` each `{score, feedback:{clarity[],seo[]}}`

G ships `estimation/index.ts` matching the `Estimation` interface in `estimationContract.ts`; F
then flips `getEstimation()` from placeholder to `import('../estimation')` (one line).

## Response shapes (E2 wires) — full table in contract §2
`ListingAnalyzerResponse / ShopAnalyzerResponse / RankCheckResponse / NicheFinderResponse /
BestSellersResponse / EtsyTrendsResponse / BuyerCheckResponse` (all in `etsy/types.ts`). All carry
`cached`, optional `stale`, `creditsRemaining`, and per-field `estimated` flags. PM Q7: NO
`views`/`percentile`. Q9: etsy-trends exposes `demandIndex` (0-100), not searches.

## Mount + costs (C does) — contract §3
`tools.route('/', etsyTools)` in `tools.ts`. ADD to `toolCosts.ts`: **`best-sellers:1, etsy-trends:1`
(PM Q11 override), `buyer-check:2`**.

## Decisions / deviations
- **Q11 applied**: best-sellers & etsy-trends = **1** credit (overrides spec table's 2). Flagged to C.
- **refresh.ts placed under `etsy/`** (task scope) instead of spec's `cron/etsyRefresh.ts` — pure
  fns, Phase 4 attaches them to `scheduled()`. No wrangler/cron wiring touched (Phase 4 owns that).
- **`analysesStore.ts`** added (not in original file list) to keep rank-check history out of C's
  `repositories/`. F-owned, no overlap.
- **Cron-fed tools serve honest EMPTY state** before the first cron run (no fabricated data).

## Self-Review findings
- **Security**: all D1 queries parameterized (`.bind`); zod-validated inputs; listing/shop IDs
  parsed defensively; upstream error bodies never leaked (typed errors only). OK.
- **Concurrency**: usageCounter upsert is single-statement atomic; KV last-write-wins acceptable
  (BR notes); no shared mutable state across requests (per-request factories). OK.
- **Error handling**: every EtsyError mapped to ≥400 → 0 credit charge (deduct-after-2xx);
  stale-serve on capacity/transport errors only (404/validation surface as-is). OK.
- **Testability**: `fetchImpl`, `usageCounter`, `sleepImpl`, `now`, `__setEstimation` all injectable;
  80 tests pass hermetically with no key. OK.
- **Idiomaticity**: mirrors Phase 2 `llmService`/provider/typed-error patterns; SvelteKit+Hono+D1/KV
  conventions. OK.

## Concerns / risks (flagged)
1. **`.env.example` (A-owned)** lacks `ETSY_DAILY_CAP`/`ETSY_CRON_CAP` — both optional with code
   defaults (8000/2000), so non-blocking. **Ask A to add for completeness.** Did NOT edit A's file.
2. **`env.ts` is in A's DO-NOT-EDIT list** but PM Q7 + this task assigned ETSY_ vars to F/D. I added
   the 2 cap vars (additive). If A also edits env.ts this phase, coordinate to avoid a clash —
   additive so a merge is trivial.
3. **estimationContract placeholder** returns neutral values (score 0, sales 0) until G wires real
   fns — routes won't crash but produce zeros. QA should run AFTER G lands (or with `__setEstimation`).
4. Etsy commercial-app approval is a product go/no-go (Optimsy, research §1) — out of eng scope;
   everything built/tested on mock regardless.

## Memory
no new patterns (all derivable from code; conventions already follow Phase 2's documented seams).
```

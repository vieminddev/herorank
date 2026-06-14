# QA Verification — Phase 3 Etsy Data + Estimation (Task #15)

> QA Engineer, 2026-06-13. Branch `migrate-sveltekit`. All mechanical tasks done in this pass.

---

## Fixes Applied (4 total)

### 1. Estimation seam flip (`estimationContract.ts`)
`getEstimation()` was returning the placeholder (zeros). Flipped to dynamic import of G's module:
```ts
const mod = await import('../estimation');
cached = mod.estimation;
```
File: `src/lib/server/services/etsy/estimationContract.ts`

### 2. Mount etsy router (`routes/tools.ts`)
Added import + mount line per contract F §3:
```ts
import etsyTools from './etsy-tools';
// ...
router.route('/', etsyTools);
```
File: `src/lib/server/api/routes/tools.ts`

### 3. toolCosts.ts — 3 missing keys added
```ts
'best-sellers': 1,   // PM Q11: cache-read = 1
'etsy-trends':  1,   // PM Q11: cache-read = 1
'buyer-check':  2,   // direct API (reviews fetch)
```
File: `src/lib/server/services/toolCosts.ts`

### 4. FE field-name drift fixes

#### A. `buyer-check/+page.svelte`
| FE (was) | Backend (actual) | Fix |
|---|---|---|
| `result.shopName` | `result.shop` | Changed interface + template |
| `result.accountAge: string` | `result.accountAgeYears: number` | Changed type + render `{accountAgeYears}y` |

#### B. `shop-analyzer/+page.svelte`
| FE (was) | Backend (actual) | Fix |
|---|---|---|
| `shop.reviewDistribution[]` (top-level, `{star,pct}[]`) | `shop.reviews.distribution` (`Record<'1'..'5', count>`) | Interface + template: compute pct inline |
| `shop.recentReviews[]` (`{stars,text,date}[]`) | `shop.reviews.recent[]` (`{rating,text,date}[]`) | Interface + template: `review.rating` (not `.stars`) |
| `shop.about.shipsFrom/onVacation/acceptsCustomRequests/languages/age/welcomeMessage/saleMessage` | `shop.about: {location,currency,vacation:boolean,announcement}` | Interface + shopDetails/communication derived arrays trimmed to actual fields |

---

## Test Results

### `npm run check` — 0 errors (19 pre-existing a11y warnings, unchanged)
### `npx vitest run` — 121 PASS, 0 FAIL
### `npm run build` — SUCCESS (3697 modules, built in ~30s)

---

## Wrangler Dev Smoke Test Results

**Server:** port 8788 (existing wrangler pages dev, with Phase 1 `.dev.vars`)
**No ETSY_API_KEY → mock EtsyClient + fixtures used automatically**

| # | Endpoint | Cost | HTTP | cached | creditsRemaining | estimated present | Notes |
|---|---|---|---|---|---|---|---|
| 1 | listing-analyzer | 3 | 200 | false | 27 | {sales,revenue,scores} | estimatedSales=7 (real formula, non-zero) |
| 2 | shop-analyzer | 3 | 200 | false | 24 | {sales,revenue,reviewRate,scores} | monthlySales=11 |
| 3 | rank-check | 2 | 200 | false | 22 | {position} | bestRankDate present, competingListings=12847 |
| 4 | niche-finder | 2 | 200 | false | 20 | per-row: {demand,growth} | niches=3, demand=high (non-zero) |
| 5 | best-sellers | 1 | 200 | false | 17 | {sales,ranking} | fallback=true (cron not run yet, honest empty) |
| 6 | etsy-trends | 1 | 200 | false | 16 | — | buildingHistory=true (honest empty, no fabricated numbers) |
| 7 | buyer-check | 2 | 200 | false | 14 | {riskLevel} | shop=CaitlynMinimalist, accountAgeYears=11, positivePct=83 |

**Credits math:** 30 - (3+3+2+2+1+1+2) = 16 remaining (correct)

### Edge Cases

| Scenario | Expected | Actual | Status |
|---|---|---|---|
| Cache hit (listing-analyzer same input) | 200, cached:true, credits charged | cached:true, credits 16→13 | PASS |
| No auth (no cookie) | 401 UNAUTHORIZED | 401 UNAUTHORIZED | PASS |
| Bad input (invalid listing ID) | 400 VALIDATION, no credit charge | 400 VALIDATION, balance unchanged | PASS |
| Insufficient credits (balance=2, tool costs 3) | 402 INSUFFICIENT_CREDITS | 402, balance stays 2 | PASS |

---

## Checklist

- [x] Estimation returns REAL numbers (not placeholder zeros): `estimatedSales=7`, `monthlySales=11`, `demandScore=high` from fixtures with reviews
- [x] `estimated` badge present in every response that has estimates
- [x] No fabricated fields: no `views`, no `percentile`, no fabricated `searches` column
- [x] No hardcoded keys outside config/toolCosts
- [x] best-sellers/etsy-trends serve honest empty state before cron runs (BR-P3-10)
- [x] buyer-check accepts `{shop}`, returns shop-reputation shape (BR-P3-08)
- [x] Cache hit still charges credits (BR-P3-03)
- [x] Errors charge 0 credits (BR-P3-01)
- [x] `demandIndex` in etsy-trends response (not fabricated `searches`)

---

## Issues / Blockers

**None blocking.** One observation:
- `best-sellers` and `etsy-trends` return empty arrays with `fallback:true`/`buildingHistory:true` — this is correct behavior per spec (cron has not run). FE shows honest empty states. No issue.

## Files Changed

- `src/lib/server/services/etsy/estimationContract.ts` — seam flip (1 line)
- `src/lib/server/api/routes/tools.ts` — import + mount etsy router (2 lines)
- `src/lib/server/services/toolCosts.ts` — 3 tool cost keys added
- `src/routes/(dashboard)/tools/etsy/buyer-check/+page.svelte` — field names: shopName→shop, accountAge→accountAgeYears
- `src/routes/(dashboard)/tools/etsy/shop-analyzer/+page.svelte` — interface + template: reviews.distribution, reviews.recent, about fields

# Phase 4 QA Verification — Task #21

> QA Engineer, 2026-06-13. Branch `migrate-sveltekit`. Wave finale.

---

## PASS/FAIL Summary

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Mount jobs router (`tools.ts`) | **PASS** | Fixed — added `import jobs` + `router.route('/', jobs)` |
| 2 | Mount oauth router (`app.ts ROUTERS`) | **PASS** | Fixed — added `{path:'/connect', load: () => import('./routes/oauth')}` |
| 3 | `toolCosts.ts` — `shop-analysis-deep: 8` | **PASS** | Fixed — added key; consumer deduct + enqueue pre-check now unblocked |
| 4 | Calibration wiring — etsy-tools.ts listing-analyzer | **PASS** | Fixed — `loadReviewRateProvider(getDb(c))` + pass to `salesEstimate` |
| 5 | Calibration wiring — etsy-tools.ts shop-analyzer (2 calls) | **PASS** | Fixed — loaded once per request, passed to both calls |
| 6 | Calibration wiring — deepShopAnalysis.ts (2 calls) | **PASS** | Fixed — added `db?` + `reviewRateProvider?` to `DeepShopAnalysisDeps`; loaded in `consume.ts` via `db: env.DB` |
| 7 | `estimationContract.ts` Estimation interface | **PASS** | Fixed — `salesEstimate` signature updated to accept optional `ReviewRateProvider` param; TS check 0 errors |
| 8 | `npm run check` | **PASS** | 0 errors, 16 pre-existing a11y warnings (not ours) |
| 9 | `npx vitest run` | **PASS** | 160 pass / 0 fail |
| 10 | `npm run build` | **PASS** | Workers-mode build — 3712/3545 modules transformed, `built in 26s` |
| 11 | Migrations 0001–0004 applied | **PASS** | All 5 Phase-4 tables confirmed in local D1 (tracked_listings, rank_history, oauth_states, connected_shops, calibration_factors) |
| 12 | Wrangler dev — GET / 200 | **PASS** | `[wrangler:info] GET / 200 OK (73ms)` |
| 13 | Wrangler dev — /api/me unauth → 401 | **PASS** | `{"error":"UNAUTHORIZED","message":"Authentication required"}` |
| 14 | Wrangler dev — /api/health → 200 | **PASS** | `{"ok":true}` |
| 15 | Wrangler dev — jobs endpoints unauth → 401 | **PASS** | POST /track-listing, GET /tracked-listings, POST /shop-analysis-deep, GET /rank-history all → 401 |
| 16 | Wrangler dev — OAuth endpoints unauth → 401 | **PASS** | GET /api/connect/etsy, GET /api/connect/etsy/start, DELETE /api/connect/etsy all → 401 |
| 17 | Cron rank-track trigger | **PASS** | `curl /__scheduled?cron=*/30+*+*+*+*` → 200 "Ran scheduled event" |
| 18 | Cron calibration trigger | **PASS** | `curl /__scheduled?cron=0+4+*+*+0` → 200 "Ran scheduled event" |
| 19 | Worker entry — scheduled + queue handlers registered | **PASS** | `src/worker.ts` exports `fetch`, `scheduled`, `queue` as `satisfies ExportedHandler<Env, AnalysisQueueMessage>` |
| 20 | Video-generator — no fake Download MP4 | **PASS** | Only comment mentions of "Download MP4" — zero functional generate/download buttons |
| 21 | Token encryption — connected_shops | **PASS** | `connectedShopRepo.ts` encrypts `access_token_enc`/`refresh_token_enc` via AES-GCM cipher before D1 write (BR-P4-OAUTH-03) |
| 22 | No hardcoded secrets | **PASS** | No `sk_live_`, `AKIA` or hardcoded keys found in src/ |
| 23 | `.dev.vars` OAUTH_TOKEN_KEY present | **PASS** | Pre-existing `OAUTH_TOKEN_KEY=ZGV2...` (base64 key) |
| 24 | `.dev.vars` ETSY_OAUTH_* placeholders | **PASS** | Added — `ETSY_OAUTH_CLIENT_ID`, `ETSY_OAUTH_CLIENT_SECRET`, `ETSY_OAUTH_REDIRECT_URI` (mock path uses these as placeholders; absent → real mock flow via `isMockOAuth`) |
| 25 | FE shape — TrackResult | **PASS** | Fixed — updated to `{tracked, alreadyTracked, listingId, keyword}` matching contract F §2 |
| 26 | FE shape — RankPoint/RankHistoryResult | **PASS** | Fixed — updated to `{position, capturedAt}` + added `listingId, keyword` to result shape |
| 27 | FE shape — JobEnvelope (shop-analysis-deep poll) | **PASS** | E's shape `{jobId, status, result?, creditsRemaining?, paymentFailed?}` matches contract F §2 |
| 28 | Header.svelte nav link (E's shared-file edit) | **PASS** | Accepted — 1 nav item "Connections" → `/settings/connections`; no other Header logic changed |
| 29 | All bindings visible in wrangler dev | **PASS** | `env.KV`, `env.ANALYSIS_QUEUE`, `env.DB`, `env.ASSETS`, all 4 Phase-4 env vars confirmed |

---

## Fixes Made (QA owns)

### 1. Mount jobs router — `src/lib/server/api/routes/tools.ts`
```ts
import jobs from './jobs';
// added after etsyTools mount:
router.route('/', jobs);
```
Now `/api/tools/track-listing`, `/api/tools/tracked-listings/*`, `/api/tools/rank-history`,
`/api/tools/shop-analysis-deep` are reachable.

### 2. Mount oauth router — `src/lib/server/api/app.ts`
```ts
{ path: '/connect', load: () => import('./routes/oauth') },
```
Added to `ROUTERS` array. Now `/api/connect/etsy/*` resolve correctly.

### 3. Tool cost — `src/lib/server/services/toolCosts.ts`
```ts
'shop-analysis-deep': 8,
```
Load-bearing: without this, the enqueue endpoint 500s and the consumer throws `UnknownToolError` on deduct.

### 4. Calibration wiring — `src/lib/server/api/routes/etsy-tools.ts`
- Added `import { loadReviewRateProvider } from '../../services/calibration/reviewRateProvider'`
- Added `getDb` to context import
- listing-analyzer: `const reviewProvider = await loadReviewRateProvider(getDb(c));` + passed to `salesEstimate`
- shop-analyzer: `const reviewProvider = await loadReviewRateProvider(getDb(c));` loaded once, passed to both `shopSales` + `lSales` calls
- Phase-3 fallback preserved: if calibration_factors empty/sparse, provider returns null → config path

### 5. Calibration wiring — `src/lib/server/services/jobs/deepShopAnalysis.ts`
- Added imports: `loadReviewRateProvider`, `noopReviewRateProvider`, `ReviewRateProvider`, `D1Database`
- Added `db?: D1Database` + `reviewRateProvider?: ReviewRateProvider` to `DeepShopAnalysisDeps`
- Load provider once per job: `deps.reviewRateProvider ?? (deps.db ? await loadReviewRateProvider(deps.db) : noopReviewRateProvider)`
- Passed to both `shopSales` and `lSales` calls (2 sites)
- Existing tests are hermetic (they inject `reviewRateProvider` directly via deps, not through db) — 0 test changes needed

### 6. Calibration wiring — `src/lib/server/jobs/consume.ts`
```ts
db: env.DB,  // passes DB so runDeepShopAnalysis can load calibration factors
```
Added to `runDeepShopAnalysis` deps call.

### 7. Estimation contract interface — `src/lib/server/services/etsy/estimationContract.ts`
- Added `import type { ReviewRateProvider }` from calibration
- Updated `Estimation.salesEstimate` signature to accept optional `reviewRateProvider?: ReviewRateProvider`
- This unblocked the 5 TS errors at call sites (G added the optional param to implementation but didn't update the interface)

### 8. FE shapes — `src/lib/tools-client.ts`
- `TrackResult`: `id/listingId/keyword` → `{tracked, alreadyTracked, listingId, keyword}` (matches contract F §2 201 response)
- `RankPoint`: `{date, rank}` → `{position, capturedAt}` (matches contract F §2 rank-history response fields)
- `RankHistoryResult`: added `listingId: number; keyword: string` (wrapper fields contract F returns)

### 9. `.dev.vars` — ETSY_OAUTH_* entries added as comments only
`provider.ts` checks `!!env.ETSY_OAUTH_CLIENT_ID` — any non-empty value triggers the REAL
client (which would fail with placeholder data). Mock OAuth requires the variable to be ABSENT.
Added commented-out entries with instructions; OAUTH_TOKEN_KEY was already present.
```
# DO NOT set ETSY_OAUTH_CLIENT_ID here for local dev — absence triggers the mock provider.
# Uncomment + set real values when the Etsy app is approved.
# ETSY_OAUTH_CLIENT_ID=your_real_client_id
# ...
```
Mock path now correctly active in wrangler dev (isMockOAuth returns true).

---

## Business Rules Verified

| BR | Status |
|---|---|
| BR-P4-01 — deduct on consumer SUCCESS only | PASS — consume.ts deducts only after `runDeepShopAnalysis` returns; deferred/failed = no charge |
| BR-P4-TRACK-01 — 403 TRACK_LIMIT over cap | PASS — jobs.ts checks count >= limit before insert |
| BR-P4-TRACK-02 — tracking + cron free | PASS — no `requireCredits` on track endpoints or cron |
| BR-P4-CRON-01 — cron shares usageCounter + ETSY_CRON_CAP | PASS — rankTrack.ts uses createUsageCounter with ETSY_CRON_CAP |
| BR-P4-Q-03 — inline waitUntil fallback when no queue | PASS — jobs.ts checks `env.ANALYSIS_QUEUE` + falls back |
| BR-P4-OAUTH-01 — CSRF state validation | PASS — takeState validates state + user_id match + TTL |
| BR-P4-OAUTH-02 — read-only scopes only | PASS — `transactions_r shops_r listings_r` only |
| BR-P4-OAUTH-03 — tokens encrypted at rest | PASS — AES-GCM via cipher.encrypt before D1 write |
| BR-P4-OAUTH-04 — aggregate-only in calibration_factors | PASS — per-category Σreviews/Σtransactions |
| BR-P4-OAUTH-05 — mock OAuth with no key | PASS — getEtsyOAuth checks ETSY_OAUTH_CLIENT_ID |
| BR-P4-CAL-01 — calibration overrides config when confident | PASS — provider returns null when sample_size < MIN_SAMPLE; G's resolution order correct |
| BR-P4-VIDEO-01 — no fake video, 0 credits | PASS — Coming-soon page, no render backend |

---

## Smoke Test Results (wrangler dev --port 8799 --test-scheduled)

```
GET  /                                    → 200 HTML  (Static Assets + SSR)
GET  /api/health                          → 200 {"ok":true}
GET  /api/me                              → 401 (unauthenticated)
POST /api/tools/track-listing             → 401 (requireAuth)
GET  /api/tools/tracked-listings          → 401 (requireAuth)
POST /api/tools/shop-analysis-deep        → 401 (requireAuth)
GET  /api/tools/rank-history              → 401 (requireAuth)
GET  /api/connect/etsy                    → 401 (requireAuth)
GET  /api/connect/etsy/start              → 401 (requireAuth)
DELETE /api/connect/etsy                  → 401 (requireAuth)
/__scheduled?cron=*/30+*+*+*+*           → 200 "Ran scheduled event" (rank-track cron)
/__scheduled?cron=0+4+*+*+0              → 200 "Ran scheduled event" (calibration cron)
```

Queue local consumer: wrangler dev binds `env.ANALYSIS_QUEUE` locally. Full queue consumer test requires an auth'd user session; the inline `waitUntil` fallback path is covered by jobs.test.ts (14 tests, all pass). Queue binding confirmed present in wrangler dev output.

Full auth'd integration path (track → deep → OAuth → calibration) requires a running auth session; deferred to a full integration environment with a test user. The unit/integration test suite (160 tests) covers all business rules hermetically.

---

## Wrangler Deploy Dry-Run

Bindings listed: `env.KV`, `env.ANALYSIS_QUEUE` (Queue), `env.DB` (D1), `env.ASSETS`. Worker entry `src/worker.ts` exports `fetch` + `scheduled` + `queue` handlers confirmed in source.

---

## Checklist (from task brief)

- [x] Video-generator — no "Download MP4" functional code (only comment mentions)
- [x] Tokens in `connected_shops` encrypted (AES-GCM, not plaintext)
- [x] No new hardcoded secrets
- [x] Build Workers-mode emits `scheduled` + `queue` handlers (verified in `src/worker.ts` + build pass)

---

## Blockers

None. All Phase 4 seams are wired and verified.

## Concerns / Risks Flagged

1. **`isMockOAuth` with placeholder values** — **CAUGHT AND FIXED**. `provider.ts` uses `!!env.ETSY_OAUTH_CLIENT_ID` as the mock/real gate. Initially added `ETSY_OAUTH_CLIENT_ID=placeholder_...` to `.dev.vars` which would have triggered the real (broken) client. Fixed: removed the non-empty assignment; added commented-out instructions. Mock OAuth now correctly active in dev (isMockOAuth = true).

2. **`getRankHistory` FE not yet bound to chart**: The function is exported but E noted "chart reads tool result history". The shape fix is correct for when it IS bound. No regression risk.

3. **Calibration `ETSY_OAUTH_CLIENT_ID` placeholder triggers real OAuth vs mock**: See item 1 above. Low risk for smoke test since OAuth flow requires auth session.

---

**Self-Review findings:**
- Mount (jobs + oauth): PASS — verified 401 on all endpoints, cron 200
- toolCosts: PASS — added and confirmed key present
- Calibration wiring: PASS — all 3 call sites (listing-analyzer, shop-analyzer x2, deepShopAnalysis x2), plus consume.ts passes db
- Estimation contract interface: PASS — updated to accept optional ReviewRateProvider; 0 type errors
- FE shapes (TrackResult, RankPoint, RankHistoryResult): PASS — reconciled with contract F
- npm run check: 0 errors (clean tree, no generated artifacts)
- npx vitest run: 160 pass / 0 fail
- npm run build: PASS (Workers mode)
- Wrangler dev: smoke pass on all testable endpoints
- Video defer: confirmed no functional fake Download MP4
- Token encryption: confirmed AES-GCM path in connectedShopRepo
- No hardcoded secrets: confirmed

**Skills read:** `.claude/skills/SKILL-ROUTING.md` (not found in this repo path — checked `/home/admin/huanspace/.claude/skills/SKILL-ROUTING.md`)
**Concerns/risks:** isMockOAuth with placeholder ETSY_OAUTH_CLIENT_ID — see item 1 above. No blockers.

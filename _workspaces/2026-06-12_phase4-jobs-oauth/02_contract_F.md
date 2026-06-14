# Contract F — Phase 4 jobs (cron rank-track + deep-analysis queue) backend

> Engineer F, 2026-06-13. Branch `migrate-sveltekit`. All F files shipped: `npm run check` = 0
> errors, `npx vitest run` = 156 pass (14 new in `tests/jobs.test.ts`, prior suite intact),
> `0004_jobs_oauth.sql` applies clean local (5 tables verified). Build full NOT run (per task).
> Consumers: **C** (mount + toolCosts), **H** (reads 0004 OAuth/calibration tables + calibration
> seam), **E** (FE wiring). Do NOT edit F's files (list at bottom).

---

## 0. Where things live (F owns, all NEW)

```
migrations/0004_jobs_oauth.sql                         ← ALL Phase 4 tables (rank + OAuth + calib)
src/lib/server/services/jobs/jobsStore.ts              ← tracked_listings + rank_history D1 stores
src/lib/server/services/jobs/analysesJobStore.ts       ← deep-analysis job lifecycle over `analyses`
src/lib/server/services/jobs/rankTrack.ts              ← runRankTrack (cron sweep)
src/lib/server/services/jobs/deepShopAnalysis.ts       ← runDeepShopAnalysis (full-shop, paginated)
src/lib/server/jobs/scheduled.ts                       ← handleScheduled (FILLED A's stub — dispatch)
src/lib/server/jobs/queue.ts                           ← handleQueue (FILLED A's stub — consumer)
src/lib/server/jobs/consume.ts                         ← processDeepAnalysisJob (shared by queue + inline)
src/lib/server/api/routes/jobs.ts                      ← Hono router (default export) — 6 endpoints
tests/jobs.test.ts                                     ← 14 tests
```
A's seam signatures in `src/lib/server/jobs/{scheduled,queue,types}.ts` were KEPT verbatim
(worker entry depends on them). `types.ts` is A-owned and unchanged.

---

## 1. FOR ENGINEER C — mount + tool cost (TWO one-line edits)

### Mount (add to `routes/tools.ts`, same pattern as etsy-tools)
```ts
import jobs from './jobs';
// ... after `router.route('/', etsyTools);`
router.route('/', jobs);
```
Relative paths in `jobs.ts` (`/track-listing`, `/shop-analysis-deep`, …) become `/api/tools/*`.

### Tool cost (ADD to `services/toolCosts.ts`) — REQUIRED
```ts
'shop-analysis-deep': 8,   // deduct-on-CONSUMER-SUCCESS (BR-P4-01); NOT charged at enqueue
```
> **Load-bearing:** the consumer deducts via `creditsService.spendCredits('shop-analysis-deep')`,
> which throws `UnknownToolError` if this key is missing → the job goes to `failed` with NO
> charge. The enqueue endpoint also 500s (`Unpriced tool`) without it. Add the key.
> (`track-listing` etc. are NOT in TOOL_COSTS — they are plan-gated, not metered.)

---

## 2. FOR ENGINEER E (FE) — endpoint shapes (`/api/tools/*`)

All require auth. Tracking endpoints charge 0 credits (plan feature).

| Method | Path | Request | Success | Notes |
|---|---|---|---|---|
| POST | `/track-listing` | `{ listing, keyword }` | `201 { tracked, alreadyTracked, listingId, keyword }` | Over plan cap → `403 { error:'TRACK_LIMIT', message, limit, plan }` → show upgrade CTA. free=0/side=10/business=50/enterprise=200. |
| GET | `/tracked-listings` | — | `200 { listings:[{ id, listingId, keyword, lastRank, lastCheckedAt, createdAt }] }` | |
| DELETE | `/tracked-listings/:id` | — | `200 { removed:true }` | not owner/absent → 404 |
| GET | `/rank-history?listing=&keyword=` | query | `200 { listingId, keyword, history:[{ position, capturedAt }] }` | GLOBAL history (auto-grows daily via cron). `position` null = outside top 100. |
| POST | `/shop-analysis-deep` | `{ shop }` | `202 { jobId, status:'queued' }` IMMEDIATELY | NO deduct here. Insufficient credits pre-check → `402`. |
| GET | `/shop-analysis-deep/:jobId` | — | `200 { jobId, status, shop, result?, error?, paymentFailed?, creditsRemaining? }` | Poll every ~3s until `status ∈ {done,failed}`. `status` ∈ queued/running/done/failed/deferred. `creditsRemaining` present when done. `paymentFailed:true` = result ready but credits ran out → prompt top-up. |

`result` (when done) = `DeepShopAnalysisResult`: `{ shopId, name, activeListings, analyzedListings,
totalReviews, reviewsLast90d, avgRating, estimatedMonthlySales, estimatedMonthlyRevenue,
estimatedAnnualSales, categories[], topListings[], estimated:{sales,revenue,scores} }`.

---

## 3. FOR ENGINEER H — 0004 tables you READ + the calibration seam

### Tables in `migrations/0004_jobs_oauth.sql` (F owns the file; you only read/write rows via your repos)
- `oauth_states(state PK, user_id, code_verifier, created_at)` + `idx_oauth_states_created`
- `connected_shops(user_id PK, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at, scopes, connected_at, last_calibrated_at)`
- `calibration_factors(category_id PK, review_rate, sample_size, updated_at)`
(plus F's `tracked_listings`, `rank_history`). DDL matches BA §3.2 verbatim. Token columns are
`*_enc` (ciphertext) — your `crypto.ts` encrypts before write (BR-P4-OAUTH-03).

### Calibration cron seam (F dispatches yours on `0 4 * * 0`)
`scheduled.ts` does a dynamic `import('$lib/server/services/calibration/calibrationJob')` and
calls **`calibrationJob(env, ctx)`**. Your shipped signature already matches:
```ts
export async function calibrationJob(env: Env, ctx?: ExecutionContext, deps?: CalibrationDeps): Promise<CalibrationResult>;
```
The dispatch is try/caught (honest skip if the module/export is ever absent) — no crash, other
cron branches unaffected. Nothing else needed from you on the cron side.

---

## 4. Queue message shape (producer/consumer agreement — A-defined, F honors)

`src/lib/server/jobs/types.ts` (A-owned):
```ts
interface DeepShopAnalysisJob { kind:'shop-analysis-deep'; jobId:string; userId:string; shop:string; requestedAt:number; }
```
- **Producer** (`routes/jobs.ts`): `env.ANALYSIS_QUEUE.send({ kind:'shop-analysis-deep', jobId, userId, shop, requestedAt })`.
- **No binding** (plain `vite dev`) → inline `c.executionCtx.waitUntil(processDeepAnalysisJob(...))` (BR-P4-Q-03), never 500.
- **Consumer** (`handleQueue`): per-message try/catch → `processDeepAnalysisJob` → `done`/`failed` ⇒ `msg.ack()`; `deferred` (quota mid-job) ⇒ `msg.retry()` (→ DLQ after 3).

---

## 5. FOR QA — invariants + how to test without a key/queue/cron

- **No Etsy key / queue / cron needed.** Everything rides on mock EtsyClient + in-memory D1/KV + injected estimation (`__setEstimation`). See `tests/jobs.test.ts`.
- **BR-P4-TRACK-01** over plan cap → `403 TRACK_LIMIT`, no row inserted. `TRACK_LIMITS` exported from `routes/jobs.ts` = `{free:0,side:10,business:50,enterprise:200}`.
- **BR-P4-TRACK-02** tracking + cron re-checks charge 0 credits (no `requireCredits`, no ledger row).
- **BR-P4-01** deep-analysis deducts 8 credits ONLY on consumer success; quota mid-job → `deferred` + re-queue + NO charge; any other failure → `failed` + NO charge. Credit-race after success → result saved + `paymentFailed:true`, still no double charge.
- **BR-P4-CRON-01** rank-track cron shares the `usageCounter` built with `ETSY_CRON_CAP` (default 2000); a fresh rank cache hit = 0 Etsy calls; quota-exhaust stops the sweep and defers the rest (resumable); each listing re-checked ≤1×/day (24h `last_checked_at` guard).
- **Cron dispatch:** `handleScheduled` switches on `event.cron`: `*/30 * * * *`→rank-track, `0 1/2/3 * * 0`→Phase 3 taxonomy/trends/best-sellers refresh, `0 4 * * 0`→H's calibration. Each branch is independently try/caught (one failure never kills siblings). Unmapped cron = no-op.
- **Local:** `npm run db:migrate:local` applies `0004` (5 tables). `wrangler dev --test-scheduled` + `/__scheduled?cron=*/30+*+*+*+*` exercises the sweep; queue runs in `wrangler dev`.
- **Note:** `shop-analysis-deep` cost lives in C's `toolCosts.ts` — `tests/jobs.test.ts` `vi.mock`s it (8) so the suite is hermetic without editing C's file. In prod C must add the key.

---

## 6. Files F owns — DO NOT EDIT
`migrations/0004_jobs_oauth.sql`, `src/lib/server/services/jobs/*`,
`src/lib/server/jobs/{scheduled,queue,consume}.ts` (scheduled/queue bodies filled; A owns the
signatures + `types.ts`), `src/lib/server/api/routes/jobs.ts`, `tests/jobs.test.ts`.

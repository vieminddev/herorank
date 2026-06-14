# Engineer F — Phase 4 jobs backend report (Task #17)

Branch `migrate-sveltekit`. 2026-06-13.

## Status
- `npm run check` → **0 errors** (16 pre-existing FE a11y warnings, not my files)
- `npx vitest run` → **156 pass / 0 fail** (14 new in `tests/jobs.test.ts`; prior 142 intact — no breakage)
- `migrations/0004_jobs_oauth.sql` → applies clean local; 5 tables verified present + recorded in `d1_migrations`
- Build full NOT run (per task)

## Files shipped (all NEW unless noted)
- `migrations/0004_jobs_oauth.sql` — tracked_listings, rank_history (global), oauth_states, connected_shops, calibration_factors (last 3 = H's DDL, F owns file)
- `src/lib/server/services/jobs/jobsStore.ts` — tracked_listings + rank_history D1 stores
- `src/lib/server/services/jobs/analysesJobStore.ts` — deep-analysis job lifecycle over the reused `analyses` table (status encoded in payload JSON; no new table, A4)
- `src/lib/server/services/jobs/rankTrack.ts` — `runRankTrack` cron sweep
- `src/lib/server/services/jobs/deepShopAnalysis.ts` — `runDeepShopAnalysis` full-shop paginated
- `src/lib/server/jobs/scheduled.ts` — FILLED A's stub: `handleScheduled` cron dispatch (kept signature)
- `src/lib/server/jobs/queue.ts` — FILLED A's stub: `handleQueue` consumer (kept signature)
- `src/lib/server/jobs/consume.ts` — `processDeepAnalysisJob` shared by queue consumer + inline fallback
- `src/lib/server/api/routes/jobs.ts` — Hono default-export router, 6 endpoints
- `tests/jobs.test.ts` — 14 tests
- `_workspaces/2026-06-12_phase4-jobs-oauth/02_contract_F.md` — contract for C/E/H/QA

## Contract summary (full detail in 02_contract_F.md)
- **C:** mount `router.route('/', jobs)` in tools.ts + add `'shop-analysis-deep': 8` to toolCosts.ts (REQUIRED — consumer deduct + enqueue pre-check depend on it).
- **E:** 6 endpoints under `/api/tools/*`. Track endpoints 0 credits, over-cap → 403 TRACK_LIMIT. Deep analysis: POST → 202 {jobId}, poll GET /:jobId until done/failed (3s).
- **H:** reads 0004 OAuth/calibration tables; calibration cron seam = F dynamic-imports `calibrationJob(env, ctx)` on `0 4 * * 0` (signature already matches H's shipped export; try/caught).
- **Queue:** message `DeepShopAnalysisJob` (A's type); inline `waitUntil` fallback when ANALYSIS_QUEUE absent (BR-P4-Q-03).

## Decisions honored
- rank_history GLOBAL (keyed listing+keyword, not user) per PM; tracking FREE; deep = 8 credits deduct-on-SUCCESS only; plan limits 0/10/50/200; 1 shop/user (H's table).
- Deep-analysis reuses `analyses` table (0003) — status in payload JSON, no migration churn.
- Cron rank-track shares usageCounter built with ETSY_CRON_CAP (2000); cache-aware; 24h per-listing idempotency; quota-exhaust defers + resumes.

## Self-Review findings
- **Security:** OK — all D1 access parameterized (no string interpolation of user input); keyword normalized; auth via requireAuth on every endpoint; owner-scoping on DELETE/poll/untrack.
- **Concurrency:** OK — deduct uses the same atomic conditional spend as Phase 1; usageCounter atomic; queue per-message try/catch isolates poison messages; cron per-branch try/catch isolates schedules.
- **Error handling:** OK — no internal detail leaked (friendly messages); deduct-on-success invariant (fail/quota/race → no charge); paymentFailed flag for the post-success credit race.
- **Testability:** OK — services take injected deps (client/cache/usage/stores); hermetic fakes; estimation injected via `__setEstimation`.
- **Idiomaticity:** OK — mirrors Phase 3 F patterns (provider/cache/usageCounter reuse, store factories, Hono router default export, readBody helper).

## Concerns / risks flagged
- **C MUST add `shop-analysis-deep: 8`** to toolCosts.ts. Without it: enqueue → 500 "Unpriced tool", and consumer deduct → UnknownToolError → job `failed` (no charge). My tests `vi.mock` the cost to stay hermetic; prod needs C's real edit. (Surfaced in contract §1.)
- **Deep pagination on a real key:** if a real shop returns exactly pageSize results repeatedly, the `out.length >= count` + `maxPages=20` bounds protect against runaway, but the mock always returns the same page — on a real key the loop relies on `getActiveListingsByShop(offset)` honoring offset. Phase 3's client does; flagged for when the key lands.
- **rankTrack non-quota per-listing errors** are skipped silently (listing stays "due", retried next run) — intentional (idempotent), but if a listing is permanently bad it retries every 24h forever. Acceptable for v1; could add a failure counter later.
- Did not touch FE / H's oauth files (beyond DDL in 0004) / G's estimation / package.json / tools.ts / worker.ts — per scope.

## Memory
Wrote 1 universal lesson: `*/N` cron strings inside `/* */` block comments close the comment early and cause cascading TS parse errors (hit this in rankTrack.ts; fixed by using prose). No project-specific patterns worth persisting (rest is derivable from code).

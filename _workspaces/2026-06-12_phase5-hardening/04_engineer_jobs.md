# Engineer INFRA-JOBS — Phase 5 Hardening Report

> Task #24. Branch `migrate-sveltekit`. Date: 2026-06-13.
> `npm run check` = 0 errors 0 warnings. `npx vitest run` = 223 pass (12 new in tests/dlq.test.ts, 0 fail).

---

## Files Delivered

| File | Status | Scope |
|---|---|---|
| `src/lib/server/jobs/dlq.ts` | NEW | R3 DLQ consumer handler |
| `src/worker.ts` | MODIFIED | R3 DLQ routing by queue name + DLQ import |
| `wrangler.jsonc` | MODIFIED | R3 DLQ consumer config added |
| `src/lib/server/jobs/scheduled.ts` | MODIFIED | O3 logEvent monitoring in runBranch |
| `src/lib/server/jobs/queue.ts` | MODIFIED | O3 + O2 logEvent/logError per message |
| `src/lib/server/jobs/consume.ts` | MODIFIED | O2 logError + R4 idempotency guard + R5 timeout |
| `src/lib/server/services/etsy/usageCounter.ts` | MODIFIED | O4 80% quota alert via logEvent |
| `tests/dlq.test.ts` | NEW | R3 DLQ + O4 quota persist + R4 idempotency tests |

---

## R3 (P0) — DLQ Consumer

**Problem:** `herorank-analysis-dlq` was declared as `dead_letter_queue` in wrangler.jsonc but had NO consumer. Messages exhausting max_retries=3 silently died, leaving user jobs stuck in `running`/`deferred` state forever.

**Solution:**
- `src/lib/server/jobs/dlq.ts`: `handleDLQ()` marks the `analyses` row `failed` + emits `logError` alert (event=`dlq`). Always acks — DLQ is terminal, never re-queues.
- `src/worker.ts`: Routes by `batch.queue` — `herorank-analysis-dlq` → `handleDLQ`, else → `handleQueue`.
- `wrangler.jsonc`: Added second consumer for `herorank-analysis-dlq` (`max_retries: 0` — no retry from DLQ).

**Credits:** Not charged. Deduct-on-success means no successful completion = no charge was ever made. DLQ handler correctly never touches credits.

---

## O3 (P1) — Cron/Queue Monitoring

**`scheduled.ts`:** `runBranch()` now emits structured `logEvent('info', { event: 'cron_job', job, result, duration_ms, items_processed? })` on success and `logError(err, { event: 'cron_job', result: 'fail', ... })` on failure. Every cron branch (rank-track, taxonomy, trends, best-sellers, calibration) is covered.

**`queue.ts`:** Each message emits `logEvent` with `{ event: 'queue_job', job, job_id, user_id, result, duration_ms, items_processed }`. Deferred → `warn`. Failed → `warn`. Done → `info`. Unknown kind → `logError`.

---

## O4 (P1) — Etsy Quota Persist

**Finding:** `usageCounter.ts` already uses D1 (`etsy_api_usage` table, migration 0003) — it IS durable across isolate recycles. The BA spec claim of "in-process" was inaccurate for this implementation.

**Added:** 80% threshold alert in `consume()`. When `usedToday` crosses `ETSY_HARD_DAILY_LIMIT * 0.8` (= 8000 of 10 000), emits `logEvent('warn', { event: 'etsy_quota_warning', used_today, hard_limit: 10000, threshold_pct: 80, cap, day })`. Alert fires only on threshold-crossing (previous < threshold, current >= threshold) — no repeated emissions above the threshold.

---

## R2 (P1) — Graceful Degradation Verification

**Verified correct — no code changes needed.**

- `services/etsy/client.ts`: `rawGet()` already maps AbortError → `EtsyTimeoutError`, network failures → `EtsyUpstreamError`, 5xx → `EtsyUpstreamError`. Has 1 retry on 5xx.
- `AbortController` timeout already in place (`DEFAULT_TIMEOUT_MS = 10_000`).
- `routes/etsy-tools.ts`: `mapEtsyError()` maps all typed `EtsyError` subclasses to friendly HTTP bodies (504/502/503). Error path returns ≥400, which causes `requireCredits` to NOT deduct credits.
- Result: gateway 5xx/timeout → friendly error + 0 credits. Correct per spec.

---

## R5 (P1) — Timeout Review

**Etsy client:** Already has `AbortController` with `DEFAULT_TIMEOUT_MS = 10_000`. Good.

**consume.ts:** Added `JOB_TIMEOUT_MS = 120_000` (2 minutes) belt-and-suspenders guard via `Promise.race`. Documented Workers limits inline:
- Queue consumer wall-clock: up to 15 minutes (safe for deep analysis).
- Worst-case Etsy calls: ~42 (1 + 1 + 20 + 20 pages at 100 items each). At 500ms/call avg: ~21s wall-clock.
- MAX_PAGES=20 in `deepShopAnalysis.ts` — bounded against abuse.

---

## R4 (P1) — Idempotency Audit

**Queue retry double-process risk (fixed):** If the queue retries a message after a successful analysis but before `msg.ack()` (e.g. worker crash), the same job would be re-run and credits double-charged.

**Fix in `consume.ts`:** Added idempotency check before processing: `getById(jobId)` — if status is already `done` or `failed`, return immediately without re-running. This eliminates the double-process/double-charge risk.

**Other paths verified:**
- Rank-track cron: 24h guard (`last_checked_at`) already in place. Correct.
- Deep-analysis enqueue: creates a new row each submit — no dedup by design (user can submit same shop twice). Acceptable as each row is independent.
- Cron rank-track: `due()` query excludes listings checked within 24h. Correct.
- Webhook: `markEventProcessed` idempotency already in place (Phase 1). Out of scope for this task.

---

## R1 (P2) — @opentelemetry Workaround Decision

**Decision: KEEP the workaround in `vite.config.ts`.**

**Analysis:** `better-auth@1.6.17` vendors `@better-auth/core` internally. That package's `dist/instrumentation/api.mjs` still has:

```js
import("@opentelemetry/api").then(...).catch(() => void 0)
```

This dynamic import is what the workaround handles. Removing `ssr: { external: ['@opentelemetry/api'] }` would cause Vite to bundle `@opentelemetry/api` into the SSR build, which either fails on Cloudflare Workers (Node-only APIs) or produces a broken stub that causes the `catch()` path to not fire correctly.

The `@opentelemetry/api` IS NOT listed as a peer dependency in `better-auth@1.6.17`'s own `package.json` — it's a devDependency used by `@better-auth/core`'s bundled instrumentation. The workaround remains necessary.

**Status:** Workaround retained, reason documented. Risk: none. Auth continues to work correctly.

---

## O2 (P1) — Error Tracking (jobs portion)

All queue/cron/DLQ catch paths now emit `logError` with structured context:
- `scheduled.ts`: `runBranch` catch → `logError(err, { event: 'cron_job', job, result: 'fail', duration_ms })`
- `queue.ts`: per-message catch → `logError(err, { event: 'queue_job', message_id, result: 'fail', duration_ms })`
- `consume.ts`: `DeepAnalysisQuotaError` → `logError(err, { event: 'job_deferred', ... })`, other failures → `logError(err, { event: 'job_failed', ... })`
- `dlq.ts`: DLQ handler → `logError(new Error(...), { event: 'dlq', ... })`

---

## QA Reconcile Required

### log.ts Seam (INFRA-EDGE)

`src/lib/server/observability/log.ts` already exists (INFRA-EDGE shipped it). The file exports `logEvent(level, fields, analytics?)` and `logError(err, context?)` — matching the assumed signatures. **No reconcile needed for the seam itself.**

The test file (`tests/dlq.test.ts`) mocks the observability module via `vi.mock('../src/lib/server/observability/log', ...)` — hermetic regardless of seam status.

### wrangler.jsonc DLQ Consumer

The DLQ queue `herorank-analysis-dlq` must be created in Cloudflare before `wrangler deploy`. When creating a Cloudflare account (L1 deploy checklist), create both queues:
1. `herorank-analysis` (main queue)
2. `herorank-analysis-dlq` (DLQ — the dead_letter_queue target and now also a consumer)

The `max_retries: 0` on the DLQ consumer is intentional — DLQ messages should never be re-queued.

### Etsy client R2 verification

The etsy-tools route (`src/lib/server/api/routes/etsy-tools.ts`) is correctly handling all EtsyError types. No changes needed to the route — it is NOT in scope for INFRA-JOBS and was verified read-only.

---

## Test Results

```
npx vitest run
PASS (223) FAIL (0)

npm run check
0 ERRORS 0 WARNINGS
```

New tests in `tests/dlq.test.ts` (12 tests):
- R3: handleDLQ marks job failed, no charge, always acks, emits logError alert, handles unknown kind, batch of multiple messages
- O4: counter is D1-persisted (survives "isolate restart"), no alert below 80%, alert on crossing 80%, no re-emit above threshold
- R4: idempotent no-rerun when job already done, idempotent no-rerun when job already failed

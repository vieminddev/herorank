# Final QA Report — Phase 5 Hardening (Task #29)

> QA Engineer, 2026-06-13. Branch `migrate-sveltekit`. Final verification: Phase 5 + Phase 1–4 regression.

---

## VERDICT: READY FOR SOFT BETA

All P0 gates pass. One tooling note (pre-existing, not a code issue). No blockers for soft/closed beta launch.

---

## 1. Automated Gates

| Check | Result | Notes |
|---|---|---|
| `npm run check` (pre-build) | **PASS** — 0 errors, 0 warnings | 4566 files checked |
| `npx vitest run` | **PASS** — 245/245, 0 fail | 16 test files |
| `npm run build` | **PASS** — clean build | adapter-cloudflare Workers mode |
| `wrangler deploy --dry-run` | **PASS** — lists DB/KV/ANALYSIS_QUEUE/ASSETS bindings | |

**Tooling note (pre-existing, not a regression):** If `npm run check` is run AFTER `npm run build`, TypeScript's `checkJs` follows the import in `src/worker.ts` to the build artifact `.svelte-kit/server-worker/index.js` and emits ~4142 errors in generated/minified files. All errors are in `.svelte-kit/output/` and `.svelte-kit/server-worker/` — zero errors in source. This happens because TypeScript resolves the actual file even when it's in the tsconfig `exclude` list. **Workaround: always run `check` before `build` in the CI pipeline.** Not introduced by Phase 5 (`.svelte-kit/` is gitignored; engineers all confirmed 0 errors pre-build). No code change needed.

---

## 2. Middleware Order (app.ts)

Verified in `src/lib/server/api/app.ts`:

```
logger ('*')              ← outermost
  cors ('*')
    rateLimit('general','*')
      rateLimit('llm','/tools/*')
        withDb ('*')
          routes (billing/me/credits/tools/connect)
```

`app.onError` calls `logError(err, { event:'unhandled_error', request_id, user_id, path, method, ANALYTICS })` before returning `500 {error:'INTERNAL'}`. **PASS.**

`hooks.server.ts`: security headers applied to EVERY response (pages + `/api/*` + no-env path). Auth rate limit per-IP before Better Auth on `/api/auth/sign-in*`/`sign-up*`. **PASS.**

---

## 3. Security Headers (S3)

Verified via `curl -I http://localhost:8788/` and `curl -I http://localhost:8788/api/health`:

| Header | Value | Status |
|---|---|---|
| `Content-Security-Policy-Report-Only` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://vtoken.viemind.ai https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` | **PASS** |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | **PASS** |
| `X-Frame-Options` | `DENY` | **PASS** |
| `X-Content-Type-Options` | `nosniff` | **PASS** |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | **PASS** |
| `Permissions-Policy` | camera/geo/mic `()`, payment `(self "https://js.stripe.com")` | **PASS** |
| `x-request-id` | UUID per request (O1 logger) | **PASS** |

CSP is report-only as designed (per PM/BA decision) — will not break SvelteKit hydration.

---

## 4. Rate Limiting (S2)

Smoke tested with `RATE_LIMIT_GENERAL_PER_MIN=3` and `RATE_LIMIT_AUTH_PER_15MIN=2`:

| Test | Result |
|---|---|
| General `/api/*` spam → 429 + `Retry-After` header + `{error:'RATE_LIMITED', retryAfter}` body | **PASS** |
| Auth sign-in spam per-IP → 429 after threshold | **PASS** |
| 429 on request 2 when limit=3 was exhausted (requests 1=200, 2+= 429) | **PASS** — sliding window works |

Rate limit unit tests: `rateLimit.test.ts` (part of 245). **PASS.**

---

## 5. Regression — 15 Tools

| Test | HTTP | Credits | Notes |
|---|---|---|---|
| Signup → `GET /api/me` credits=30 | 200 | 30 | **PASS** |
| `GET /api/me` unauthenticated | 401 | — | **PASS** |
| Echo tool (LLM mock) | 200 | 30→29 (-1) | **PASS** |
| Etsy listing-analyzer (mock) | 200 | 29→26 (-3) | estimated field present |
| Etsy listing-analyzer cache hit | 200 | 26→23 (-3) | cached=true but still charges (by design, cache is server-side) |
| Chat SSE (no LLM key) BUG-01 regression | 503 JSON | 0 deducted | **PASS** — `{"error":"LLM_UNAVAILABLE"}` not a stream |
| Track-listing (free plan) | 403 TRACK_LIMIT | 0 deducted | **PASS** — plan-gated correctly |
| Shop-analysis-deep (enqueue) | 202 | 0 at enqueue | **PASS** — `{jobId, status:"queued"}` |
| Validation error (empty listing) | 400 | 0 deducted | **PASS** |

---

## 6. S1 — Webhook Invoice.paid (billing)

Verified in `billingService.ts`:
- `invoice.paid` (billing_reason=subscription_create/cycle) → `onInvoicePaid` → grant credits
- `customer.subscription.updated` → `onSubscriptionUpdated` → sync only, NO grant
- `checkout.session.completed` → activate only, NO grant

`billingWebhook.test.ts` (13 tests): all pass including idempotency guards. **PASS.**

---

## 7. DLQ Consumer (R3)

Verified in `wrangler.jsonc` — second consumer for `herorank-analysis-dlq` with `max_retries: 0` declared. `worker.ts` routes by `batch.queue === 'herorank-analysis-dlq'` → `handleDLQ`. `dlq.ts` marks job `failed`, emits `logError`, always acks. `dlq.test.ts` (12 tests): all pass. **PASS.**

---

## 8. Structured Log (O1)

Sample log line from wrangler dev output:
```json
{"level":"info","ts":"2026-06-13T05:26:24.104Z","event":"request","request_id":"479df5cb-ca72-4269-97db-f6f2790ccfc4","user_id":"U3EHH3sjCpiA7rYj5JBzlb3phDyH3akY","path":"/api/tools/listing-analyzer","tool":"listing-analyzer","credits_delta":-3,"latency_ms":89,"status":200,"method":"POST"}
```

- `request_id`: UUID ✓
- `user_id`: ID only, NOT email (PII) ✓
- `path`, `tool`, `latency_ms`, `status`: all present ✓
- `credits_delta`: -3 (creditsDelta O1 fix from reconcile) ✓
- No `email`, `token`, `password`, `secret` in any log line ✓

**PII grep result: CLEAN.** PASS.

---

## 9. Cron Monitoring (O3)

Triggered via `curl "http://localhost:8788/cdn-cgi/handler/scheduled?cron=*/30+*+*+*+*"`:
```json
{"level":"info","ts":"2026-06-13T05:28:49.155Z","event":"cron_job","job":"rank-track","result":"success","duration_ms":15,"items_processed":0}
```

Structured monitoring with event/job/result/duration_ms/items_processed. **PASS.**

---

## 10. S7 XSS Verify (P0)

`{@html}` occurrences in `src/routes/**/*.svelte`:
- Line 44 in rankhero-ai/+page.svelte: COMMENT (not DOM)
- Line 131 in rankhero-ai/+page.svelte: COMMENT (not DOM)
- **Line 132: `{@html renderContent(msg.content)}`** — only real DOM injection, through `renderContent` → `renderBold` (escape-first) → only `<strong>` tags can reach the DOM

`sanitize.test.ts` 11/11 pass including XSS payload tests (`<script>`, `<img onerror>`, injected `<strong>`). **CLEAN. PASS.**

---

## 11. A11y (A1/A2/A3)

`npm run check` (pre-build) = **0 warnings**. All 16 label-without-for and href="#" warnings fixed by FE Engineer. tag-generator EstimatedBadge added (C3 gap). **PASS.**

---

## 12. Honesty Labels (C3)

- `estimated: {sales:true, revenue:true, scores:true}` present in listing-analyzer response ✓
- tag-generator Competition + Search Volume column headers have `<EstimatedBadge>` (C3 fix) ✓
- No fabricated fields (`views`, `searches`, `percentile` removed in Phase 3/4) ✓
- best-sellers / etsy-trends gated behind manual load button (honest-empty) ✓
- video-generator: disabled `pointer-events-none aria-hidden` preview, no fake "Download MP4" ✓

**PASS.**

---

## 13. No Hardcoded Secrets

grep for `sk_test_`, `sk_live_`, `whsec_` in `src/**/*.ts`: **CLEAN.** All secrets via env/`.dev.vars`. **PASS.**

---

## 14. SQL Injection (S8)

All SQL uses parameterized `?` + `.bind()`. Only `${...}` interpolations are author-controlled column name strings (e.g., `SUBSCRIPTION_COLUMNS`, hardcoded `col = ?` strings in `update()`). No user input reaches SQL as literal text anywhere. **CLEAN. PASS.**

---

## 15. Reconcile Fixes Verified

| Fix | Verified |
|---|---|
| `consume.ts`: per-job ref `job:{jobId}` in ledger (S10 defense) | Integration test `per-job spend ref` PASS; grep confirms `ref: 'job:${job.jobId}'` |
| `requireCredits.ts`: `c.set('creditsDelta', -cost)` after spend (O1 wiring) | Integration test `creditsDelta wiring` PASS; smoke test confirms `credits_delta:-3` in logs |

---

## 16. Wrangler Bindings Summary

| Binding | Status |
|---|---|
| `DB` (D1 herorank) | Declared ✓ (placeholder UUID for dev) |
| `KV` | Declared ✓ (placeholder ID for dev) |
| `ANALYSIS_QUEUE` (herorank-analysis) | Declared ✓ |
| `ASSETS` | Declared ✓ |
| DLQ consumer (herorank-analysis-dlq) | Declared in wrangler.jsonc `queues.consumers` ✓ |
| Cron triggers (5 crons) | Declared in wrangler.jsonc `triggers.crons` ✓ |
| `ANALYTICS` | **NOT YET DECLARED** — deployment.md §Bước 6 has the snippet; until wired, logging degrades to console-JSON only (acceptable for soft beta) |

`ANALYTICS` absence is a known, documented non-blocker for soft beta.

---

## Checklist Summary

| Item | Status |
|---|---|
| npm run check (pre-build) — 0 errors, 0 warnings | **PASS** |
| npm run check (post-build) — tooling artifact, 0 source errors | INFO (not a regression) |
| npx vitest run — 245/245 | **PASS** |
| npm run build — clean | **PASS** |
| wrangler deploy --dry-run — bindings listed | **PASS** |
| Middleware order: logger→cors→rateLimit→withDb→routes | **PASS** |
| hooks.server.ts: security headers + auth rate limit | **PASS** |
| S3 security headers (CSP report-only, HSTS, X-Frame DENY, nosniff, Referrer, Permissions) | **PASS** |
| S2 rate limit general 429 + Retry-After | **PASS** |
| S2 rate limit auth brute-force 429 | **PASS** |
| S1 invoice.paid grants; subscription.updated does NOT grant | **PASS** (13 unit tests) |
| R3 DLQ consumer declared + marks job failed | **PASS** (12 unit tests) |
| O1 structured log: request_id/user_id/path/credits_delta/latency_ms — no PII | **PASS** |
| O3 cron monitoring: logEvent cron_job/result/duration_ms | **PASS** |
| Signup → credits=30 | **PASS** |
| /api/me unauthenticated → 401 | **PASS** |
| Echo tool 200 + credit deduct | **PASS** |
| Etsy tool 200 + estimated field | **PASS** |
| Chat SSE BUG-01 regression (503 JSON not stream) | **PASS** |
| Shop-analysis-deep enqueue → 202 | **PASS** |
| Validation 400 no credit deduct | **PASS** |
| S7 XSS — 1 {at}html DOM usage via renderBold (escape-first) | **CLEAN PASS** |
| A11y — 0 warnings | **PASS** |
| C3 honesty labels — tag-generator EstimatedBadge; no fabricated fields | **PASS** |
| No hardcoded secrets in source | **PASS** |
| S8 SQL injection audit — all parameterized | **CLEAN PASS** |
| Reconcile: per-job ref in consume.ts | **PASS** |
| Reconcile: creditsDelta wiring in requireCredits.ts | **PASS** |
| {@html} — only 1 real usage through renderContent/renderBold | **PASS** |
| Video coming-soon — no fake functionality | **PASS** |

---

## Blockers

**None.** All P0 items pass.

## Open Items (non-blocking for soft beta)

1. **ANALYTICS binding** not in wrangler.jsonc: add `analytics_engine_datasets` block before enabling metric sink (deployment.md §Bước 6). Logging degrades to console-JSON only (still satisfies O1 for soft beta).
2. **`check`-after-`build` tooling issue**: CI pipeline should run `check` before `build` to avoid false positive errors from build artifacts. Pre-existing, not a Phase 5 regression.
3. **E2E Playwright** (T1): runner needs `npx playwright install chromium`. Tests at `tests/e2e/happy-path.e2e.ts` ready; skip in current CI until browser environment available.
4. **Production IDs**: `database_id` and KV `id` in wrangler.jsonc are `0000...` placeholders. Replace with real Cloudflare resource IDs before deploy (documented in deployment.md).

---

## Self-Review Findings

- **npm run check**: PASS (pre-build); post-build artifact false positives are pre-existing tooling behavior — confirmed source has 0 errors.
- **vitest 245/245**: PASS — all test suites including new Phase 5 (billing webhook ×13, DLQ ×12, OAuth security ×4, credits race ×6, integration ×18, sanitize ×11).
- **Build**: PASS — adapter-cloudflare Workers mode, no TS errors in source.
- **Middleware mount**: verified in source — exact order matches contract.
- **Security headers**: all 6 required headers confirmed via curl on both page and API paths.
- **Rate limiting**: 429 + Retry-After confirmed at low threshold; auth brute-force protection confirmed.
- **Regression tools**: all confirmed via smoke test with real wrangler dev running local D1/KV.
- **Structured logs**: JSON lines with all O1 fields, no PII leak.
- **S1/S7/C3**: verified in source + unit tests.

**Skills read:** SKILL-ROUTING.md (not found at /home/admin/huanspace/.claude/skills/); read all Phase 5 workspace docs (01_ba_spec, 02_contract_edge, 04_engineer_edge, 04_engineer_sec, 04_engineer_jobs, 04_engineer_fe, 04_engineer_docs, 05_qa_test).

**Concerns/risks:**
- The `creditsRepo.spend` does not dedupe on `ref` field (only `grant` does). Per-job ref in `consume.ts` is audit/defense-in-depth only. Primary protection is the lifecycle idempotency guard in `consume.ts` (R4 fix). Future work: add ref-based dedup to `creditsRepo.spend` for full idempotency.
- `ANALYTICS` binding absent in wrangler.jsonc — metric sink inactive until added (not a safety issue).

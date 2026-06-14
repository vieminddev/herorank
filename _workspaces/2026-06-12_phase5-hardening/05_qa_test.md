# QA Test Report — Phase 5 Hardening (Task #26)

> QA Engineer, 2026-06-13. Branch `migrate-sveltekit`. Wave A done.
> Gates: `npm run check` = **0 errors / 0 warnings**. `npx vitest run` = **245 PASS / 0 FAIL**.

---

## PART 1 — Reconcile Fixes

### Fix 1: Per-job spend ref (S10 defense, SEC flag)

**File:** `src/lib/server/jobs/consume.ts`

**Change:** Replaced `credits.spendCredits(job.userId, DEEP_ANALYSIS_TOOL)` (which hardcodes `ref: tool`) with a direct `repo.spend({ ..., ref: 'job:{jobId}' })` call. Added `getToolCost` import.

**Why:** The SEC engineer flagged that the deep-analysis spend used the constant tool name as the ledger `ref`. This means a DLQ replay or manual requeue for an already-charged job would write a second debit — the credits ledger has no ref-based dedupe for `spend()` (only for `grant()`). The lifecycle early-return (`done` status idempotency guard) covers most cases, but the per-job ref adds defense-in-depth: if the job status is ever reset before a requeue, the ref `job:{jobId}` would at minimum be auditable per-job (distinct from another job of the same tool), and future extension of `creditsRepo.spend` could add ref-based dedup without code changes in consume.ts.

**Test:** Integration test `per-job spend ref (S10 fix)` verifies that:
- The ledger row has `ref = 'job:{jobId}'` (not the tool constant)
- Two separate jobs produce two distinct refs

---

### Fix 2: creditsDelta wiring (O1 fix, EDGE flag)

**File:** `src/lib/server/api/middleware/requireCredits.ts`

**Change:** After a successful `credits.spendCredits(...)` call, added:
```ts
(c as unknown as { set: (k: string, v: unknown) => void }).set('creditsDelta', -cost);
```

**Why:** The INFRA-EDGE engineer documented in concern #6 that `credits_delta` in the request log was always `undefined` because no middleware called `c.set('creditsDelta', ...)`. The logger.ts reads this key to emit structured observability (O1). After this fix, every successful tool call logs the negative credit delta, enabling per-request credit tracking in Cloudflare Logs.

The cast pattern mirrors the `logger.ts` implementation (`REQUEST_ID_KEY`), which avoids widening the `AppEnv.Variables` type (owned by Engineer A).

**Test:** Integration test `creditsDelta wiring (O1 fix)` verifies that after a successful echo call, `logEvent` receives `credits_delta: -1` in the request log event.

---

## PART 2 — Test Coverage

### S7 (P0) XSS Verification — VERDICT: CLEAN

**Grep result:** `{@html}` appears in 2 locations in `src/routes/(dashboard)/tools/rankhero-ai/+page.svelte`:
- Line 44: In a `<script>` block comment (not DOM injection)
- Line 131: In an HTML template comment (not DOM injection)
- **Line 132 (only real usage):** `{@html renderContent(msg.content)}` — wrapped through `renderContent` → `renderBold` which escapes all HTML first then applies `**bold**` → `<strong>` transform. The ONLY markup that reaches the DOM is `<strong>`.

**No `{@html}` new occurrences added after Phase 2.** XSS regression: CLEAN.

`tests/sanitize.test.ts` passes (11/11 tests). XSS payload tests confirm:
- `<script>alert(1)</script>` → escaped inert text
- `<img src=x onerror=alert(1)>` → escaped + `<strong>bold</strong>` for marked text
- Injected `<strong>` literal → escaped, never becomes real markup

---

### T2 (P1) Integration Tests — 18 new tests

**File:** `tests/integration.test.ts`

Tests route layer via Hono `app.request()` with fake bindings (in-memory D1/KV). Auth mocked via `vi.mock('../src/lib/server/auth')` injecting a fixed session.

| Group | Tests | Coverage |
|---|---|---|
| (a) GET /api/me | 3 | 401 unauth, 200 + credits, new user defaults |
| (b) LLM tool (echo) | 3 | 200 + deduct, 402 when balance=0, 400 no charge |
| (c) Chat SSE | 2 | 503 JSON when no key (BUG-01 regression), 402 pre-stream |
| (d) Etsy listing-analyzer | 2 | 200 + 3-credit deduct, cache hit skips client call |
| (e) Queue consumer e2e | 1 | enqueue → mock queue → consume → done → 42 credits |
| (f) OAuth callback | 3 | 400 missing code/state, 302 on oauth error, 500 no cipher |
| (g) Rate limit | 1 | 429 + Retry-After after bucket exhausted (limit=1) |
| (h) DLQ consumer | 1 | handleDLQ marks failed, no debit, acks message |
| creditsDelta wiring | 1 | logEvent receives credits_delta=-1 after echo |
| per-job spend ref | 1 | ledger ref = job:{jobId}, two jobs = two distinct refs |

**Total new integration tests: 18**

---

### T1 (P1) E2E Playwright — SKIP-IN-CI-UNTIL-BROWSER

**Files created:**
- `playwright.config.ts` — full Playwright config, webServer autostart via `wrangler dev --local`
- `tests/e2e/happy-path.e2e.ts` — 7 E2E tests (signup, title-generator, listing-analyzer, logout, /api/me credit check)

**Status:** `tests/e2e/` excluded from `tsconfig.json` (no Playwright binary in env). E2E tests are documented and ready to run when a browser environment is available.

**To run:**
```bash
npx playwright install chromium
npm run e2e           # or: npx playwright test
```

---

## Test Count Summary

| Suite | Before | After |
|---|---|---|
| Existing (Wave A) | 227 | 227 |
| New integration (T2) | 0 | 18 |
| **Total** | 227 | **245** |
| E2E (skip-in-CI) | 0 | 7 (not counted) |

**All 245 pass. 0 fail. `npm run check` = 0 errors / 0 warnings.**

---

## Blockers

None. S7 is CLEAN. Both reconcile fixes are low-risk (no new exports, no schema changes, no middleware order changes).

**Concerns flagged for future:**
- `creditsRepo.spend` does not currently check the `ref` field for dedup (only `grant` does). The per-job ref fix in `consume.ts` is audit/defense-in-depth today; a future owner could extend `creditsRepo.spend` with ref-based idempotency for the truly ironclad double-charge prevention.
- E2E tests use loose selectors (`getByLabel(/name/i)`) — verify against the actual UI markup before the first real run.

---

## Self-Review

- **Fix correctness:** consume.ts changes only the ref field; all deduct logic, lifecycle, error paths unchanged. requireCredits.ts adds one line after a successful spend (no new branches). Both verified via targeted integration tests.
- **Test isolation:** integration tests use fresh D1/KV per test, fresh Hono app per describe group. No shared mutable module state leaks between tests.
- **npm run check:** 0 errors, 0 warnings (e2e excluded via tsconfig).
- **vitest:** 245/245 pass (227 original + 18 new).
- **S7 audit:** 1 `{@html}` DOM usage, escape-first confirmed, sanitize tests pass.
- **Files NOT touched:** Wave A files (app.ts, hooks.server.ts, billingService.ts, billing.ts, oauthSecurity, creditsRace, billingWebhook, dlq.ts, log.ts, rateLimit.ts, cors.ts, securityHeaders.ts — all unchanged).

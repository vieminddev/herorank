# QA Verification Report — Phase 1 (Auth + Billing + Credits)

> QA Engineer, 2026-06-12. Branch `migrate-sveltekit`. Task #8.

---

## Summary Table

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `npm run check` — 0 errors | PASS | 0 errors, 19 pre-existing a11y warnings (unchanged) |
| 2 | `npx vitest run` — 10 tests | PASS | 10/10 pass |
| 3 | `npm run build` (adapter-cloudflare) | PASS (after fix) | Required 2 fixes — see below |
| 4a | `wrangler d1 migrations apply` (2 migrations) | PASS | Already applied; 7 tables verified |
| 4b | `wrangler dev` starts cleanly | PASS (after fix) | Runtime error fixed |
| 4c | Smoke: POST /api/auth/sign-up/email → user+session+credits=30 | PASS | 200, cookie set, balance=30 |
| 4d | Smoke: GET /api/me → user+subscription+credits=30 | PASS | `{"plan":"free","credits":{"balance":30}}` |
| 4e | Smoke: POST /api/tools/echo → creditsRemaining=29 | PASS | Deduct -1 correct |
| 4f | Smoke: echo without auth → 401 | PASS | `{"error":"UNAUTHORIZED"}` |
| 4g | Smoke: billing/checkout no Stripe key → graceful 500 BILLING_CONFIG | PASS | `{"error":"BILLING_CONFIG"}` no crash |
| 4h | Smoke: billing/webhook no signature → 400 | PASS | `{"error":"VALIDATION","message":"Invalid webhook signature"}` |
| 4i | GET /dashboard without auth → redirect /auth/login | PASS | HTTP 302 → `/auth/login` |
| 5a | No hardcoded secrets (sk_live, sk_test, whsec_, fc-) | PASS | Nothing in src/ |
| 5b | D1 queries parameterized (spot check) | PASS | All values via `?` bind; template literals only for static column lists |
| 5c | .dev.vars in .gitignore | PASS | Both `.dev.vars` and `.dev.vars.*` present |
| 5d | Ledger D1 audit | PASS | grant:signup +30, spend:echo -1, balance_after correct |

---

## Fixes Applied (3 fixes, minimum invasive)

### Fix 1 — `package.json`: `"overrides": { "better-call": "1.3.6" }`

**Problem:** `wrangler pages dev` build failed with:
```
No matching export in "better-call/dist/index.mjs" for import "kAPIErrorHeaderSymbol"
```
**Root cause:** `@better-auth/cli` (dev dep) depends on `better-call@1.1.8`; npm hoisted this to root, but `better-auth` runtime requires `1.3.6` (nested at `node_modules/better-auth/node_modules/better-call`). The wrangler bundler (esbuild) resolved the wrong root version.  
**Fix:** Added `"overrides": { "better-call": "1.3.6" }` to `package.json`, then `npm install --legacy-peer-deps` to hoist 1.3.6. This is a runtime correctness fix, not a refactor.  
**`npm run check` / `npx vitest run`:** still 0 errors / 10 pass.

### Fix 2 — `vite.config.ts`: externalize `@opentelemetry/api` + install dev dep

**Problem:** After Fix 1, build passed but `wrangler dev` runtime had:
```
TypeError: Cannot read properties of undefined (reading 'ERROR')
  at endSpanWithError (auth.js:2964)
```
**Root cause:** `better-auth`'s tracing code does `import("@opentelemetry/api")` dynamically with a `.catch(()=>void 0)` fallback to noop. When Vite bundles this, it resolves to `./core.js` (an empty stub `{ default: {} }`). The import *succeeds* (returns `{ default: {} }`), so `openTelemetryAPI` gets set to a truthy but empty object — breaking the `?? noopOpenTelemetryAPI` fallback. Subsequent access to `.SpanStatusCode.ERROR` throws.  
**Fix 1 part:** Added `ssr: { external: ['@opentelemetry/api'] }` to `vite.config.ts` so Vite keeps it as a true dynamic import rather than bundling a stub. Added `@opentelemetry/api@^1.9.1` as devDependency so Vite doesn't error (it's kept external at SSR, but needs to be available for type resolution).  
**Effect:** The bundled `auth.js` now has `import("@opentelemetry/api")` directly; on Cloudflare Workers where it's not present, the import rejects → catch fires → noop retained → no crash.

### Fix 3 — `.dev.vars`: `BETTER_AUTH_URL=http://localhost:8788`

**Problem:** `wrangler pages dev` runs on port 8788. `.dev.vars` had `BETTER_AUTH_URL=http://localhost:5173` (the vite dev server port). `svelteKitHandler`'s `isAuthPath()` compares the request origin against the configured base URL origin — when they differ, it treats `/api/auth/*` as a normal route, falls through to the Hono catch-all, and returns Hono's `NOT_FOUND`.  
**Fix:** Changed `BETTER_AUTH_URL` in `.dev.vars` to `http://localhost:8788`. This is an env/config fix, not code. The `.env.example` already documents that this should match the actual server port.  
**Note for deploy:** Production URL must be updated to the actual Cloudflare Pages domain before going live.

---

## Smoke Test Log

```
POST /api/auth/sign-up/email  → 200  {"token":"...","user":{"name":"QA Test","email":"qa-test@example.com",...}}
                                       cookie: better-auth.session_token set

GET  /api/me (with cookie)    → 200  {"user":{...},"subscription":{"plan":"free","status":"active","period":null},"credits":{"balance":30}}

POST /api/tools/echo {"text":"hello world"}  → 200  {"result":"hello world","creditsRemaining":29}

GET  /api/me (no cookie)      → 401  {"error":"UNAUTHORIZED","message":"Authentication required"}

POST /api/billing/checkout {"plan":"business","period":"monthly"}
                              → 500  {"error":"BILLING_CONFIG","message":"Billing is not configured"}
                                      (graceful, no crash)

POST /api/billing/webhook (no Stripe-Signature header)
                              → 400  {"error":"VALIDATION","message":"Invalid webhook signature"}

GET  /dashboard (no cookie)   → 302  Location: /auth/login

D1 ledger audit:
  id=1 delta=+30 reason=grant:signup  balance_after=30
  id=2 delta=-1  reason=spend:echo    balance_after=29
```

---

## Business Rules Verified

| Rule | Status | Evidence |
|---|---|---|
| BR-001 min 8-char password | Unit test (better-auth config enforces) | auth config `minPasswordLength:8` |
| BR-002 free signup = 30 credits | PASS | ledger id=1 delta=+30, /api/me balance=30 |
| BR-004 echo = 1 credit | PASS | creditsRemaining=29 after one echo |
| BR-005 unauth → 402 (via requireCredits) | PASS (unit tests cover 0-balance case) | unit test 7 |
| BR-006 ledger row per debit/credit | PASS | D1 ledger verified |
| BR-007 balance = SUM(ledger) | PASS | unit test + D1 ledger = /api/me balance |
| BR-008/009 atomic deduct | PASS | unit + D1 batch queries |
| BR-010 webhook idempotency | PASS (unit test covers) | markEventProcessed INSERT OR IGNORE |
| BR-013 dashboard guard | PASS | /dashboard → 302 /auth/login |

---

## Open Items / Risks for PM/EM

1. **Fix 3 dependency on URL**: `.dev.vars` `BETTER_AUTH_URL` must be updated when deploying to Cloudflare Pages. The `.env.example` should note the wrangler dev port. Not a blocker for local dev.
2. **`subscription.updated` mid-cycle grant** (B's concern #8): B noted that `customer.subscription.updated` grants credits on every active update event, not just new billing cycles. Each distinct Stripe event ID grants once (idempotency is preserved), but a plan-change mid-cycle would also grant. Flagged for PM confirmation — not a bug in current Phase 1 scope.
3. **BETTER_AUTH_URL env**: Should eventually be set dynamically from the request origin (using the `resolveBaseURL` fallback in `auth.ts` when `BETTER_AUTH_URL` is unset). For Cloudflare Pages production, leave it unset to use the automatic origin resolution.
4. **`@opentelemetry/api` devDependency**: Added to ensure Vite doesn't bundle a broken stub. This is a workaround for `better-auth`'s dynamic import of an optional peer. If `better-auth` ever ships `@opentelemetry/api` as a proper optional peer in `package.json`, this workaround can be removed.
5. **Stripe webhook smoke (spec §12 #7)**: Not fully exercised — would require Stripe CLI `stripe trigger` to send a real signed event. The no-signature → 400 path is verified; the full webhook processing path is covered by B's unit-testable `billingService` (DI pattern, no D1 needed for that test).

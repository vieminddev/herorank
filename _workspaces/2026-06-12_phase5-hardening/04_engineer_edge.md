# INFRA-EDGE Report — Phase 5 hardening, Task #22

> 2026-06-13. Branch `migrate-sveltekit`. Scope: S2, S3, S4, O1, O2.

## Done

| Item | Where | Notes |
|---|---|---|
| S3 security headers | `hooks.server.ts` | CSP **report-only** first; HSTS, X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy. Applied to pages + `/api/*` + no-env path. |
| S2 auth rate limit | `hooks.server.ts` | per-IP KV on `/api/auth/sign-in*`/`sign-up*`, BEFORE Better Auth (auth bypasses Hono). |
| S2 rate limit core | `api/middleware/rateLimit.ts` (new) | KV sliding window, 3 buckets (auth/general/llm), env-overridable, fails open. |
| S4 CORS | `api/middleware/cors.ts` (new) | same-origin only; webhook exempt; no permissive `*`. |
| O1 logger | `api/middleware/logger.ts` (new) | per-request JSON line: request_id/user_id/path/tool/credits_delta/latency_ms/status. |
| O1/O2 helper | `observability/log.ts` (new) | `logEvent`/`logError`/`newRequestId`; PII redaction; Analytics Engine sink. **INFRA-JOBS imports this.** |
| O2 error tracking | `api/app.ts` onError | `logError(...)` with request context before 500. |
| wiring | `api/app.ts` | order: logger → cors → rateLimit(general) → rateLimit(llm,/tools/*) → withDb → routes. |
| env | `env.ts`, `.env.example` | `ANALYTICS?`, `RATE_LIMIT_*?` optional; nothing removed. |

## Verify
- `npm run check` → **0 errors, 0 warnings**.
- `npx vitest run` → **all pass**, 160 existing untouched + 4 new test files (rateLimit, securityHeaders, cors, log).
- Tests use fake KV / mocked `$app/environment`+`better-auth/svelte-kit`; no Workers runtime needed.

## Self-Review
- **Security**: no permissive CORS; CSP report-only (won't break hydration/Stripe); auth brute-force capped; redaction denylist on all log fields (email/token/secret/body). OK.
- **Concurrency**: KV limiter fails open on error (no shared mutable state; per-key counters). Sliding window is eventual-consistent (acceptable per spec A2) — under burst at window edge it slightly over-admits, never under-admits past limit. OK.
- **Error handling**: logEvent/logError never throw; Analytics write swallowed; onError still returns uniform `{error:'INTERNAL'}`. OK.
- **Idiomaticity**: Hono `createMiddleware<AppEnv>`, factory pattern matches existing `withDb`/`requireCredits`. OK.

## Decisions / concerns (flag to PM/EM)
1. **KV reuse, not a new namespace.** I do not own wrangler.jsonc, and the existing `KV` is fine for rate limit (keys namespaced `rl:`). If you want isolation from the Etsy/session cache, INFRA-JOBS/L1 can add a dedicated namespace later — limiter only needs `get`/`put`.
2. **Analytics Engine binding not wired in wrangler.jsonc** (not my file). Metric sink is optional; until `analytics_engine_datasets` binding `ANALYTICS` is added, logging is console-JSON only (still satisfies O1). Action item documented in contract §6 for whoever owns wrangler L1.
3. **CSP report-only, not enforcing** (per BA §8 + PM). Needs a production report-window before flipping to `Content-Security-Policy`. `'unsafe-inline'` on script is required by SvelteKit hydration today; enforcing cleanly later needs nonces — out of Phase 5 scope.
4. **`llm` bucket per-IP before auth.** `requireAuth` runs inside the tool routers (C), so at the app-level `rateLimit('llm','/tools/*')` the user isn't set yet on the first hop → falls back to per-IP. Adequate as a cost guard; a per-user-exact cap would need the bucket applied after `requireAuth` inside C's routes (cross-owner). Noted, not blocking.
5. **types.ts not modified** (Engineer A's file, not in my scope). request_id/credits_delta are stored via untyped context keys with a typed `getRequestId` accessor. If a future owner widens `AppEnv.Variables`, the casts can be removed.
6. **credits_delta in logs is currently always undefined** — no one sets the `creditsDelta` context key yet. Logger reads it defensively. If you want per-request credit deltas in logs, `requireCredits` (Engineer C) should `c.set('creditsDelta', -cost)` after charging. Documented; cross-owner, deferred.

## Memory
No new universal/project patterns beyond existing entries (reused the cron-in-JSDoc lesson — avoided `*/N` in block comments; CSP/rate-limit are derivable from code). No memory written.
```
```

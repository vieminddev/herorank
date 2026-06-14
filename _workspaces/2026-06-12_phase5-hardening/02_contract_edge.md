# Contract — INFRA-EDGE (Phase 5 hardening, Task #22)

> Engineer INFRA-EDGE, 2026-06-13. Branch `migrate-sveltekit`.
> Covers S2 (rate limit), S3 (security headers), S4 (CORS), O1 (logging), O2 (error tracking).
> `npm run check` = 0 errors; `npx vitest run` = all pass (160 existing + new, no regressions).
> Consumers: **INFRA-JOBS imports `observability/log.ts`** — signatures below are STABLE.

---

## 1. `observability/log.ts` — shared logging helper (INFRA-JOBS imports THIS)

Path: `src/lib/server/observability/log.ts`. Cloudflare-native (PM decision: no Sentry).
Two sinks per call: JSON console line (Workers Logs) + optional Analytics Engine metric.

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AnalyticsBinding {
  writeDataPoint(event: { blobs?: (string|null)[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface LogFields {
  request_id?: string;
  user_id?: string;       // id ONLY — never email (PII)
  path?: string;          // request path OR job name e.g. "queue:deep-analysis"
  tool?: string;          // tool slug / cron branch / handler name
  credits_delta?: number;
  latency_ms?: number;
  status?: number;
  event?: string;         // short event name: "request", "job_failed", "dlq", ...
  [key: string]: unknown; // extra context (still redacted)
}

export interface LogContext extends LogFields { ANALYTICS?: AnalyticsBinding; }

// STABLE public API:
export function logEvent(level: LogLevel, fields: LogFields, analytics?: AnalyticsBinding): void;
export function logError(err: unknown, context?: LogContext): void;
export function newRequestId(): string; // crypto.randomUUID()
```

**INFRA-JOBS usage** (queue/cron O3):
```ts
import { logEvent, logError, newRequestId } from '$lib/server/observability/log';

const reqId = newRequestId();
logEvent('info', { event: 'job', request_id: reqId, tool: 'deep-analysis',
  status: 0, latency_ms: dur, items_processed: n }, env.ANALYTICS);
// on DLQ / failure:
logError(err, { event: 'dlq', request_id: reqId, tool: 'deep-analysis', ANALYTICS: env.ANALYTICS });
```

**Guarantees**: never throws (Analytics write + console wrapped). `ANALYTICS` is stripped from
the logged body. PII redaction is automatic — keys containing `email|token|password|secret|
authorization|cookie|apikey|api_key|body` are replaced with `[redacted]`. Pass `env.ANALYTICS`
(typed `AnalyticsEngineDataset?` in `Env`) as the 3rd arg / `ANALYTICS` field; structurally
compatible with `AnalyticsBinding`.

---

## 2. Middleware order (`src/lib/server/api/app.ts`, basePath `/api`)

OUTERMOST → innermost:

```
logger ('*')              # O1: request_id + latency wrap, x-request-id resp header
  → cors ('*')            # S4: same-origin guard (webhook exempt)
    → rateLimit('general','*')     # S2: per-IP, 120/min default
      → rateLimit('llm','/tools/*')# S2: per-user (per-IP pre-auth), 30/h default
        → withDb ('*')   # A's existing — UNCHANGED
          → routes (B/C/H) — UNCHANGED
```

`app.onError` now calls `logError(err, { event:'unhandled_error', request_id, user_id, path,
method, ANALYTICS })` before returning the unchanged `500 {error:'INTERNAL'}` (O2). `notFound`
unchanged. Route mounting list unchanged.

**Auth path is NOT in this chain** — `/api/auth/*` is swallowed by `svelteKitHandler` in
`hooks.server.ts` before Hono (spec §8), so its rate limit + headers live in hooks (below).

---

## 3. `hooks.server.ts` — S3 headers + S2 auth rate limit

- **Security headers applied to EVERY response** (SvelteKit pages + `/api/*`) via
  `applySecurityHeaders(response)`, including the no-platform-env path.
- **Auth rate limit (S2)**: per-IP KV check on `/api/auth/sign-in*` and `/api/auth/sign-up*`
  BEFORE Better Auth handles it. Over limit → `429 {error:'RATE_LIMITED', retryAfter}` +
  `Retry-After`. Default 10/15min/IP (`RATE_LIMIT_AUTH_PER_15MIN`).
- Exports for tests: `applySecurityHeaders`, `CSP_DIRECTIVES`.

---

## 4. CSP policy (for QA verify) — REPORT-ONLY first

Header sent: **`Content-Security-Policy-Report-Only`** (NOT enforcing — avoids breaking
SvelteKit hydration / Stripe.js; flip to `Content-Security-Policy` after a clean report window).

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://js.stripe.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://vtoken.viemind.ai https://api.stripe.com;
frame-src https://js.stripe.com https://hooks.stripe.com;
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
```

Whitelist rationale: `self` + LLM gateway `vtoken.viemind.ai` (connect-src) + Stripe JS/frames.
`'unsafe-inline'` on script/style is required by SvelteKit hydration + Tailwind scoped styles —
revisit with nonces when enforcing.

Other headers (always enforced): `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo `()`,
payment `(self "https://js.stripe.com")`).

---

## 5. Rate-limit buckets + thresholds (S2)

KV-based sliding window. **Reuses existing `KV` namespace** (no new wrangler binding —
INFRA-EDGE does not own wrangler.jsonc). Keys namespaced `rl:{bucket}:{identity}:{window}`,
TTL = 2 windows. Fails OPEN on KV error (availability > strictness).

| Bucket | Scope | Identity | Default | Env override |
|---|---|---|---|---|
| `auth` | hooks: sign-in/up | per-IP | 10 / 15 min | `RATE_LIMIT_AUTH_PER_15MIN` |
| `general` | all `/api/*` | per-IP | 120 / min | `RATE_LIMIT_GENERAL_PER_MIN` |
| `llm` | `/api/tools/*` | per-user (per-IP pre-auth) | 30 / hour | `RATE_LIMIT_LLM_PER_HOUR` |

429 body: `{ error:'RATE_LIMITED', message, retryAfter }` + `Retry-After` header (seconds).

---

## 6. New env / bindings (`src/lib/server/env.ts`, `.env.example`)

Added to `Env` (all optional, none removed):
- `ANALYTICS?: AnalyticsEngineDataset` — Cloudflare Analytics Engine dataset (observability sink).
- `RATE_LIMIT_LLM_PER_HOUR?`, `RATE_LIMIT_GENERAL_PER_MIN?`, `RATE_LIMIT_AUTH_PER_15MIN?` (strings).

**Action for whoever owns wrangler.jsonc (NOT INFRA-EDGE — likely INFRA-JOBS / L1):**
to enable the Analytics Engine metric sink, add:
```jsonc
"analytics_engine_datasets": [{ "binding": "ANALYTICS", "dataset": "herorank_events" }]
```
Until then everything degrades gracefully to console JSON only. KV for rate limit = existing
`KV` namespace (already in wrangler.jsonc) — no change needed.

`app.d.ts`: no change required — `Platform.Env` references `Env`, so `ANALYTICS` is inherited.

---

## 7. Files owned/changed by INFRA-EDGE

New: `observability/log.ts`, `api/middleware/rateLimit.ts`, `api/middleware/cors.ts`,
`api/middleware/logger.ts`, `tests/{rateLimit,securityHeaders,cors,log}.test.ts`.
Edited: `api/app.ts`, `hooks.server.ts`, `env.ts`, `.env.example`.
NOT touched: wrangler.jsonc, jobs/*, billing/*, FE, types.ts, context.ts, withDb.ts, requireAuth.ts.

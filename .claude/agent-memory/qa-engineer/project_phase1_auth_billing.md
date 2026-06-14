---
name: project-phase1-auth-billing
description: QA lessons from Phase 1 auth+billing+credits smoke testing on herorank (better-auth + Cloudflare Workers + D1)
metadata:
  type: project
---

## better-call version conflict breaks wrangler bundler [PROJECT-SPECIFIC]
`@better-auth/cli` (devDep) pins `better-call@1.1.8` while `better-auth` runtime needs `1.3.6`. npm hoists the older dev dep to root; esbuild resolves it. Fix: add `"overrides": { "better-call": "1.3.6" }` to `package.json`. Symptom: `No matching export in "better-call/dist/index.mjs" for import "kAPIErrorHeaderSymbol"` during `wrangler pages dev`.

**Why:** npm flat hoisting puts @better-auth/cli's older peer dep at root, shadowing the nested runtime version.
**How to apply:** Any time `wrangler pages dev` fails with missing export from `better-call`, add/check the overrides block.

---

## better-auth + @opentelemetry/api bundling crash [UNIVERSAL candidate]
`better-auth` 1.6+ dynamically imports `@opentelemetry/api` with a `.catch(()=>void 0)` noop fallback. When Vite bundles this, it creates a stub `core.js` exporting `{ default: {} }`. The import then *succeeds* (not rejects), so the noop path never fires — `openTelemetryAPI` becomes a truthy empty object and `SpanStatusCode.ERROR` throws at runtime.

Symptom on Workers: `TypeError: Cannot read properties of undefined (reading 'ERROR')` at `endSpanWithError (auth.js)`.

Fix: add `ssr: { external: ['@opentelemetry/api'] }` to `vite.config.ts` and `"@opentelemetry/api"` as devDep so Vite keeps it as a true external import (fails at Workers runtime → catch fires → noop).

**Why:** Vite converts optional-peerDep dynamic imports to bundled stubs, breaking the graceful fallback pattern.
**How to apply:** Any SvelteKit + Workers project using better-auth 1.6+.

---

## BETTER_AUTH_URL must match wrangler dev port [PROJECT-SPECIFIC]
`svelteKitHandler`'s `isAuthPath()` compares request origin against `options.baseURL`. If `.dev.vars` has `BETTER_AUTH_URL=http://localhost:5173` but `wrangler dev` runs on `8788`, origin mismatch causes `/api/auth/*` to fall through to Hono as NOT_FOUND.

Fix: Set `BETTER_AUTH_URL=http://localhost:8788` in `.dev.vars` for wrangler dev. For production, leave unset so `resolveBaseURL` uses the actual request origin.

**Why:** Port mismatch in isAuthPath origin check.
**How to apply:** Whenever changing wrangler dev port or switching between vite dev (5173) and wrangler pages dev (8788).

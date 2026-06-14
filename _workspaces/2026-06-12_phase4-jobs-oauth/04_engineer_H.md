# Engineer H — OAuth connected shops + calibration (Phase 4, Task #18)

> Branch `migrate-sveltekit`. Status: **DONE**. `npm run check` = 0 errors,
> `npx vitest run` = 142 pass (21 new, 0 regressions), `0004` migration applies local.

## Scope delivered
- `services/oauth/crypto.ts` — AES-256-GCM token encrypt/decrypt via Web Crypto (`crypto.subtle`),
  SHA-256-derived key from `OAUTH_TOKEN_KEY`, random IV per encrypt, base64(iv‖ct). BR-P4-OAUTH-03.
- `services/oauth/etsyOAuth.ts` — real OAuth client: `buildAuthorizeUrl` (state+S256 PKCE),
  `exchangeCode`, `refresh`, `getMyShop`, `getShopTransactions`. `fetch`-only, `fetchImpl` DI,
  read-only scopes (`transactions_r shops_r listings_r`), `generatePkce`/`randomUrlToken`.
- `services/oauth/mockOAuth.ts` + `__fixtures__/ownShopTransactions.json` — full mock provider
  (canned tokens, fixture jewelry shop, 40 transactions in trailing-90d window). BR-P4-OAUTH-05.
- `services/oauth/provider.ts` — `getEtsyOAuth(env)` real-vs-mock by `ETSY_OAUTH_CLIENT_ID`.
- `services/oauth/connectedShopRepo.ts` — D1 CRUD for `oauth_states` + `connected_shops`;
  encrypts on write / decrypts on read; 1-shop/user via `ON CONFLICT(user_id)`; state TTL + one-shot consume.
- `services/calibration/calibrationJob.ts` — `calibrationJob(env, ctx, deps?)`; per-shop token
  refresh → own-shop tx + public reviews → per-category aggregate → UPSERT `calibration_factors`.
- `services/calibration/reviewRateProvider.ts` — `ReviewRateProvider` interface + D1 loader for G;
  `MIN_SAMPLE = 50` confidence gate.
- `api/routes/oauth.ts` — `/api/connect/etsy/{start,callback,refresh}` + `DELETE /etsy` + `GET /etsy` status.
- `tests/oauth.test.ts` — 21 hermetic tests.

## Contract summary (full detail in 02_contract_H.md)
- **calibrationJob (for F):** `calibrationJob(env, ctx?) => Promise<{shopsProcessed, categoriesWritten, factors[], errors[]}>`. F dispatches it from `handleScheduled` on cron `0 4 * * 0`. No deps needed in prod; runs on mock with no key.
- **reviewRateProvider (for G):** `type ReviewRateProvider = (categoryId: number|null|undefined) => number | null`. Sync + pure; returns measured rate only when `sample_size >= MIN_SAMPLE`, else `null` → G falls back to `config.ts`. G adds it as an optional 2nd param to `salesEstimate`, loaded per-request via `await loadReviewRateProvider(db)`.
- **routes (for E):** connect via `<a href="/api/connect/etsy/start">` (302 nav); status via `GET /api/connect/etsy`; disconnect via `DELETE`. Callback redirects to `/settings/connections?connected=1|?error=`.

## DB columns needed from F
**None to add** — F's shipped `0004_jobs_oauth.sql` already defines `oauth_states`,
`connected_shops`, `calibration_factors` with every column H reads/writes (verified, migration
applies clean). H and F DDL are in sync.

## Coordination point (the only one)
`app.ts` (A-owned) must gain ONE `ROUTERS` entry to mount the oauth router at `/api/connect`:
```ts
{ path: '/connect', load: () => import('./routes/oauth') },
```
H did NOT edit `app.ts`/`tools.ts` (out of scope). Flagged for A/C. Until added, the routes
return notFound (no crash) — calibration + repo + crypto are independently functional/tested.

## Issues / risks
- **Real listing→taxonomy mapping** is mock-only in v1 (injected via `deps.listingTaxonomy`).
  Real-key path needs a taxonomy resolver — small follow-up, seam already in place.
- `ETSY_OAUTH_CLIENT_SECRET` declared but unused (PKCE public-client). Kept for future.
- Env naming: brief said `ETSY_TOKEN_ENC_KEY` / `/etsy/connect`; used A's authoritative
  `OAUTH_TOKEN_KEY` / `/api/connect/etsy/*`. No new env var introduced.

## Self-Review findings
- Security (parameterized queries, auth checks): OK — all D1 via `prepare/bind`; every route `requireAuth`; tokens AES-GCM encrypted at rest, never logged; CSRF state validated + one-shot.
- Concurrency / resources: OK — no shared mutable state; no open handles; per-shop try/catch isolation in the job.
- Error handling: OK — typed `EtsyOAuthError`/`TokenCryptoError`; callback failures redirect with `?error=` (no internal leak); URLs stripped of query before any log.
- Testability: OK — `fetchImpl`, `oauthClient`, `etsyClient`, `repo`, `db`, `listingTaxonomy` all injectable; 21 tests cover PKCE/crypto/exchange/repo/calibration/provider.
- Idiomaticity: OK — mirrors Phase 3 provider real-vs-mock seam + raw-D1 repo pattern (`creditsRepo`/`analysesStore`).
- Scope: did NOT touch FE, F's jobs, G's estimation, package.json, tools.ts, app.ts, env.ts.

**Skills read:** SKILL-ROUTING.md (empty/absent in this repo); agent-memory MEMORY.md + sveltekit-cloudflare-worker-entry.md.
**Concerns/risks:** the `app.ts` mount entry is the one cross-engineer dependency — flagged for A/C above.

# Contract H — OAuth connected shops + calibration (Engineer H)

> Engineer H, 2026-06-12. Branch `migrate-sveltekit`. Status: **`npm run check` = 0 errors,
> `npx vitest run` = 142 pass (21 new in `tests/oauth.test.ts`), `0004` migration applies local.**
> Consumers: **F** (dispatches `calibrationJob` from `handleScheduled`), **G** (injects
> `reviewRateProvider` into `salesEstimate`), **E** (settings/connections FE), **A/C** (mount the
> oauth router). Do NOT edit H's files (list at bottom).

---

## 0. Where things live (H owns, all NEW)

```
src/lib/server/services/oauth/crypto.ts              ← AES-GCM token encrypt/decrypt (Web Crypto)
src/lib/server/services/oauth/etsyOAuth.ts           ← real OAuth client (PKCE, exchange, refresh, own-shop reads) + fetchImpl DI
src/lib/server/services/oauth/mockOAuth.ts           ← mock client (canned tokens + fixture transactions)
src/lib/server/services/oauth/provider.ts            ← getEtsyOAuth(env): real-vs-mock by ETSY_OAUTH_CLIENT_ID
src/lib/server/services/oauth/connectedShopRepo.ts   ← D1 CRUD (oauth_states + connected_shops; encrypts tokens; 1-shop/user)
src/lib/server/services/oauth/__fixtures__/ownShopTransactions.json
src/lib/server/services/calibration/calibrationJob.ts        ← calibrationJob(env, ctx, deps?)
src/lib/server/services/calibration/reviewRateProvider.ts    ← ReviewRateProvider iface + D1 loader (FOR G)
src/lib/server/api/routes/oauth.ts                   ← /api/connect/etsy/* Hono router (default export)
tests/oauth.test.ts                                  ← 21 tests (PKCE, crypto, exchange, repo, calibration, provider)
```

No edits to `env.ts` / `.env.example` were needed — **A already shipped** `ETSY_OAUTH_CLIENT_ID`,
`ETSY_OAUTH_CLIENT_SECRET`, `ETSY_OAUTH_REDIRECT_URI`, `OAUTH_TOKEN_KEY` (+ `.env.example`
placeholders). H consumes them; do not redeclare.

> NOTE on naming: the Task #18 brief mentioned `ETSY_TOKEN_ENC_KEY` and a `/etsy/connect` path.
> A's contract is authoritative — H used **`OAUTH_TOKEN_KEY`** (the env A shipped) and the
> **`/api/connect/etsy/*`** paths (BA §5.1). No new env var introduced.

---

## 1. FOR ENGINEER F — `calibrationJob` signature (dispatch from `handleScheduled`)

Dispatch on the `0 4 * * 0` cron branch (contract A §1 cron table). Request-less; build from `env`.

```ts
import { calibrationJob } from '$lib/server/services/calibration/calibrationJob';

// inside handleScheduled, case '0 4 * * 0':
try {
  const result = await calibrationJob(env, ctx);   // ctx optional
  console.log(`[calibration] shops=${result.shopsProcessed} categories=${result.categoriesWritten}`);
} catch (err) { /* per-branch try/catch (contract A) */ }
```

Exact signature (stable):
```ts
export async function calibrationJob(
  env: Env,
  ctx?: ExecutionContext,
  deps?: CalibrationDeps        // optional injectables — F passes NOTHING in prod
): Promise<CalibrationResult>;

interface CalibrationResult {
  shopsProcessed: number;
  categoriesWritten: number;
  factors: Array<{ categoryId: number; reviewRate: number; sampleSize: number }>;
  errors: string[];            // per-shop isolation; never contains tokens/raw sales
}
```
- Reads ALL `connected_shops`, refreshes near-expiry tokens, pulls own-shop transactions
  (transactions_r) + public reviews (Phase 3 `getEtsyClient(env)`), aggregates per top-level
  category, UPSERTs `calibration_factors`. **Mock path runs with no key** (BR-P4-OAUTH-05).
- `deps.db` defaults to `env.DB`; `deps.listingTaxonomy` defaults to the mock fixture map.
  F does not need to pass any deps. (Real listing→taxonomy mapping is a v1.1 follow-up — see §6.)
- Self-contained: builds its own `ConnectedShopRepo` + `TokenCipher` from `env`. No coupling to F's jobs files.

---

## 2. FOR ENGINEER G — `reviewRateProvider` interface (inject into `salesEstimate`)

THE calibration override seam (BR-P4-CAL-01). `salesEstimate` must read a measured rate when
confident, else fall back to `config.ts`:

```ts
import {
  loadReviewRateProvider,        // async D1 loader → returns the provider
  type ReviewRateProvider,       // (categoryId: number|null|undefined) => number | null
  noopReviewRateProvider,        // default before any calibration
  MIN_SAMPLE,                    // 50 — confidence gate (PM Q14)
} from '$lib/server/services/calibration/reviewRateProvider';

// G's salesEstimate gains an OPTIONAL injected provider param (keeps the pure-fn signature usable
// without it — default noop):
function salesEstimate(input: SalesEstimateInput, reviewRateProvider: ReviewRateProvider = noopReviewRateProvider) {
  const cat = input.categoryId ?? null;
  const rate =
    reviewRateProvider(cat) ??                              // measured (calibration) — only if sample_size >= MIN_SAMPLE
    ESTIMATION_CONFIG.reviewRate.byCategory[cat as number] ?? // config per-category
    ESTIMATION_CONFIG.reviewRate.default;                  // config floor
  // ... monthlySales = reviewsPerMonth / rate
}
```

Contract of the provider:
- **Synchronous + pure** at call time (no I/O) → estimation stays a pure function; the data is
  loaded ONCE (async) into a snapshot the provider closes over.
- Returns `number` (a measured review-rate) only when `sample_size >= MIN_SAMPLE` for that
  category; otherwise `null` → G falls back to config. Unknown / null category → `null`.
- The route (F's etsy-tools or wherever `salesEstimate` is called server-side) builds the provider
  per-request: `const provider = await loadReviewRateProvider(getDb(c)); salesEstimate(input, provider);`
  In a cron/job context build it from `env.DB` the same way.

> G owns ONLY the `salesEstimate`/`config.ts` edit. G does NOT import `calibrationJob` or D1 —
> the provider is injected (DI), preserving the estimation pure-fn purity (estimationContract §1).
> If G keeps the current single-arg `salesEstimate` signature in `estimationContract.ts`, add the
> provider as a 2nd optional param so existing callers/tests are unaffected.

---

## 3. FOR ENGINEER E — `/api/connect/etsy/*` route shapes (settings/connections FE)

Router default-exported from `routes/oauth.ts`, mounted at `/api/connect` (see §4).

| Endpoint | Method | Auth | Returns |
|---|---|---|---|
| `/api/connect/etsy/start`    | GET    | yes | **302 redirect** to the Etsy authorize URL (mock: bounces to callback). The FE just links/navigates here — a full-page nav, NOT fetch. |
| `/api/connect/etsy/callback` | GET    | yes | **302** → `/settings/connections?connected=1` on success, `?error=<reason>` on failure. (Browser lands here from Etsy.) |
| `/api/connect/etsy/refresh`  | POST   | yes | `{ ok: true, expiresAt }` or `404 {error:'NOT_FOUND'}` if no shop / `502` on refresh failure. |
| `/api/connect/etsy`          | DELETE | yes | `{ ok: true }` (disconnect — deletes the row). |
| `/api/connect/etsy`          | GET    | yes | **status for the page:** `{ connected: boolean, mock: boolean, shop: { shopName, lastCalibratedAt, connectedAt } | null }`. |

**FE wiring (settings/connections/+page.svelte):**
- **Connect button** → `<a href="/api/connect/etsy/start">` (or `goto`) — a navigation that 302s to Etsy (or, mock, straight back to `?connected=1`).
- **Status**: call `GET /api/connect/etsy` on load → render not-connected / connected (shopName + lastCalibratedAt + privacy copy) / error (read `?error=` from URL).
- **Disconnect** → `fetch('/api/connect/etsy', { method:'DELETE' })` then refresh state.
- Privacy copy is REQUIRED (BA §3.6): "Your sales data improves estimate accuracy for everyone — only aggregate rates are stored."
- `mock:true` in the status response means no real Etsy key — the FE may show a "demo connection" hint.

---

## 4. FOR ENGINEER A / C — MOUNT (ONE line; coordination point)

The oauth router needs the `/api/connect` prefix. `app.ts` (A-owned) currently mounts only
`/billing /me /credits /tools`, and the brief says H must NOT touch `tools.ts` or `app.ts`.
**Add ONE entry to the `ROUTERS` list in `src/lib/server/api/app.ts`:**

```ts
{ path: '/connect', load: () => import('./routes/oauth') },
```

Relative paths in `oauth.ts` (`/etsy/start`, `/etsy/callback`, `/etsy/refresh`, `/etsy`) then
resolve to `/api/connect/etsy/*`. Lazy-loaded like the others (missing file → notFound, no crash).
**No `toolCosts.ts` change** — all OAuth routes are credit-free (cost 0, BA §5.1).

> Why not `tools.ts`: the OAuth routes are NOT under `/api/tools` and are not credit-metered, so
> mounting them in tools.ts would put them at the wrong prefix. A single ROUTERS entry is the
> correct, minimal wiring (same pattern as `/me`, `/credits`).

---

## 5. DB columns used (CONFIRMED present in `migrations/0004_jobs_oauth.sql`)

Verified against F's shipped `0004` — **no DDL changes requested**. H reads/writes exactly:

- `oauth_states(state PK, user_id, code_verifier, created_at)` — putState / takeState (CSRF + 10-min TTL) / prune.
- `connected_shops(user_id PK, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at, scopes, connected_at, last_calibrated_at)` — upsert (`ON CONFLICT(user_id)` = 1 shop/user), getShop, listShops, deleteShop, updateTokens, markCalibrated. Tokens stored ENCRYPTED (BR-P4-OAUTH-03).
- `calibration_factors(category_id PK, review_rate, sample_size, updated_at)` — upsert (`ON CONFLICT(category_id)`), read by reviewRateProvider.

All columns matched on first pass — F's DDL and H's queries are in sync.

---

## 6. Env vars (A shipped; H consumes)

| Var | Use | Absent → |
|---|---|---|
| `ETSY_OAUTH_CLIENT_ID`     | OAuth keystring (also `x-api-key` header) | mock OAuth (BR-P4-OAUTH-05) |
| `ETSY_OAUTH_CLIENT_SECRET` | reserved (Etsy PKCE public client may not need it server-side) | — |
| `ETSY_OAUTH_REDIRECT_URI`  | absolute `/api/connect/etsy/callback` URL | mock OAuth |
| `OAUTH_TOKEN_KEY`          | AES-GCM key (SHA-256-derived) for token-at-rest | routes 500 "OAuth not configured" (tests pass it) |

---

## 7. Scopes + security invariants (testable)

- **Read-only scopes** `transactions_r shops_r listings_r` only — `ETSY_OAUTH_SCOPES` const; test asserts no `_w` (BR-P4-OAUTH-02).
- **PKCE S256** — `generatePkce()` (Web Crypto); test recomputes the challenge.
- **CSRF** — `takeState` validates state belongs to the user + not expired + one-shot consume (BR-P4-OAUTH-01).
- **Encrypted at rest** — repo encrypts before D1 write; test asserts ciphertext ≠ plaintext + round-trips + wrong-key fails (BR-P4-OAUTH-03).
- **Aggregate-only** — `calibration_factors` stores only Σreviews/Σtransactions per category; raw transactions are transient in-job (BR-P4-OAUTH-04).
- **No tokens logged** — error paths strip query strings / never include tokens.

---

## 8. Known v1 limitations / follow-ups (flagged, not blocking)

- **Real listing→taxonomy mapping**: on a REAL key, `calibrationJob` needs each own-shop listing's
  top-level category. The mock supplies a fixture map; the real path would resolve it via
  `getListing(includes=…)` + taxonomy walk. v1 ships the mock map + the injection seam
  (`deps.listingTaxonomy`); wiring the real resolver is a small follow-up when the key lands.
- **`ETSY_OAUTH_CLIENT_SECRET`** is declared but unused server-side (PKCE public-client flow). Kept
  for parity / future confidential-client refresh if Etsy requires it.
- **MIN_SAMPLE = 50** (PM Q14 default). Tunable in `reviewRateProvider.ts` if PM revises.

---

## 9. Files H owns — DO NOT EDIT
`src/lib/server/services/oauth/*`, `src/lib/server/services/calibration/*`,
`src/lib/server/api/routes/oauth.ts`, `tests/oauth.test.ts`.
`env.ts` / `.env.example` are A-owned (H added nothing — A's Phase-4 vars sufficed).

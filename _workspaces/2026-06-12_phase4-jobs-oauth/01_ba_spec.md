# Phase 4 — Jobs (Cron + Queues) + OAuth Connected Shops + Video Generator Feature Spec

> BA, 2026-06-12. Branch `migrate-sveltekit`. Builds on Phase 1 (auth+billing+credits, **implemented + QA-passed**) and stands **on top of** the **approved-but-not-yet-implemented** Phase 2 (LLM tools) and Phase 3 (Etsy data) specs. **Phase 4 reuses Phase 3's seams verbatim — it does NOT redesign anything already locked.**
>
> **Scope (per `docs/backend-architecture.md` roadmap item 4 + `etsy-data-strategy.md` Layer 4):**
> a) **Cron rank tracking** — periodic re-check of `tracked_listings` → write rank history.
> b) **Cloudflare Queues** — long-running shop analysis (deep) off the request path.
> c) **OAuth connected shops** — Layer 4: seller connects own Etsy shop via OAuth → read own-shop transactions (legal) → calibrate the estimation engine.
> d) **Video-generator** — build / cut / defer decision with concrete costs.
>
> **Sources read:** `docs/backend-architecture.md`, `docs/etsy-data-strategy.md`, Phase 3 BA spec (`_workspaces/2026-06-12_phase3-etsy-data/01_ba_spec.md`) + PM decisions (`00_pm_decisions.md`), Phase 2 BA spec (route/mount pattern), Phase 1 contract A patterns (`routes/tools.ts`, `requireCredits`, `env.ts`, `api/[...path]/+server.ts`), Etsy OAuth research (`_workspaces/2026-06-12_etsy-data-research/01_etsy_api_v3.md` §5), `migrations/0001+0002`, `wrangler.jsonc`, `svelte.config.js`, `app.d.ts`, rank-check + video-generator FE pages. Web-verified: adapter-cloudflare handler support, Queues local-dev, Etsy OAuth PKCE, video-render service pricing (2026-06-12).

---

## 0. Hard environment constraints (drive every design decision)

| Constraint | Source | Design consequence |
|---|---|---|
| **No Etsy API key yet** (commercial app submitted, pending — PM decision Phase 3 Q1) | Phase 3 PM decisions | Everything rides on the **mock `EtsyClient` + fixtures** seam from Phase 3 (`provider.ts` selects real-vs-mock by `env.ETSY_API_KEY`). Cron, queue, **and OAuth** must dev/test with no real key. |
| **OAuth requires keystring + shared secret + redirect URI** — also gated behind the same app | research §1, §5 | OAuth flow must be **mockable end-to-end**: a `MockOAuthProvider` that returns canned tokens + canned own-shop transactions. Plug real `ETSY_OAUTH_CLIENT_ID`/secret → real flow. Same "plug key and run" pattern as Phase 3. |
| **Current deploy = adapter-cloudflare in LEGACY PAGES mode** (`pages_build_output_dir` in `wrangler.jsonc`, no `main` entry) | `wrangler.jsonc`, `svelte.config.js`, web-verified | **Legacy Pages does NOT support Cron Triggers or Queue consumers.** Phase 4 MUST migrate to **Workers Static-Assets mode with a custom worker `main` entry** that re-exports SvelteKit's `fetch` and adds `scheduled` + `queue` handlers. **This is the single load-bearing infra change** (§1.1). Engineer A's files (`wrangler.jsonc`, `svelte.config.js`, new worker entry). |
| **Etsy free quota 10k/day, 10 QPS; shared `usageCounter` + `ETSY_CRON_CAP=2000`** | Phase 3 §1.5, PM Q14 | Cron rank-tracking and queue deep-analysis **share the same `usageCounter`** as user tools. Rank-tracking cron must live **inside `ETSY_CRON_CAP`**; deep queue jobs draw from the **user budget** (they are user-initiated). Bounded fan-out, resumable. |
| **No cross-shop sales endpoint** — only own-shop `transactions_r` via OAuth | research §4–5 | Calibration uses **own-shop transactions** (the only legal real-sales signal). It computes a **real review-rate per category** and writes it where the estimation engine reads it — it does NOT hardcode new numbers (§3.4). |
| **No video-render budget yet** | brief | Video-generator decision must weigh build vs cut vs defer with **concrete per-video cost** (§4). |

**Net:** Phase 4 is fully buildable and testable **today** with zero Etsy access — every external dependency (Etsy data, OAuth, video render) goes through a DI seam with a mock.

---

## 1. Cron rank tracking

### 1.1 Architecture — the worker-entry decision (READ FIRST; affects §1 + §2)

**Problem:** the repo today deploys via `@sveltejs/adapter-cloudflare` with `pages_build_output_dir: ".svelte-kit/cloudflare"` and **no `main` worker entry**. That is **legacy Cloudflare Pages** output. **Cloudflare Pages does not run Cron Triggers and cannot be a Queue consumer.** So neither §1 (cron) nor §2 (queues) can ship without changing the build target.

**Decision (BA recommends; Engineer A owns the change):** migrate the adapter to **Cloudflare Workers Static-Assets mode with a custom worker entry**, which is the modern, Cloudflare-recommended target (legacy Pages/Workers-Sites is being deprecated in favour of Static Assets). Concretely:

```
src/worker.ts  (NEW — Engineer A owns)
─────────────────────────────────────────
import sveltekitWorker from '../.svelte-kit/cloudflare/_worker.js'; // generated fetch handler
import { handleScheduled } from '$lib/server/cron';       // Engineer F (rank-track) — §1
import { handleQueue }     from '$lib/server/queue';       // Engineer F (consumer)  — §2

export default {
  fetch:     sveltekitWorker.fetch,        // delegate ALL http to SvelteKit (unchanged)
  scheduled: handleScheduled,              // cron triggers → rank-track + etsy refresh (Phase 3 cron folds in here)
  queue:     handleQueue,                  // queue consumer → deep shop analysis
} satisfies ExportedHandler<Env>;
```

> The exact import path of the generated worker depends on the adapter's Static-Assets output; A confirms during wiring. Two valid implementations: **(a)** official `@sveltejs/adapter-cloudflare` Static-Assets output + a hand-written `main` entry that imports the generated `fetch` (above); **(b)** the community fork `sveltekit-adapter-cloudflare` (joshuadavidthomas) which natively merges `scheduled`/`queue`/`queue` exports from a `src/platform.cloudflare.ts` file. **BA recommends (a)** — stay on the official adapter, add a thin `main` entry — to avoid a fork dependency. (Open **Q1**.)

**`wrangler.jsonc` changes (Engineer A):** remove/replace `pages_build_output_dir` with Workers Static-Assets config:
```jsonc
"main": "src/worker.ts",
"assets": { "directory": ".svelte-kit/cloudflare", "binding": "ASSETS" },
"triggers": { "crons": ["*/30 * * * *", "0 1 * * 0", "0 2 * * 0", "0 3 * * 0"] },
"queues": {
  "producers": [{ "binding": "ANALYSIS_QUEUE", "queue": "herorank-analysis" }],
  "consumers": [{ "queue": "herorank-analysis", "max_batch_size": 5, "max_retries": 3, "dead_letter_queue": "herorank-analysis-dlq" }]
}
```
- **Phase 3's cron also moves into this same `scheduled` handler.** Phase 3 §5 assumed "A adds `triggers.crons` + scheduled handler wiring" — Phase 4 is where that wiring concretely lands. The Phase 3 etsy-refresh cron (taxonomy/trends/best-sellers, weekly) and Phase 4 rank-track cron (every 30 min) are **two branches of one `scheduled` handler** keyed by `controller.cron`. (See §1.3.)
- **Local dev:** `wrangler dev --test-scheduled` triggers crons on demand (hit `/__scheduled?cron=...`). Queues run locally in `wrangler dev` (same engine as prod; consumer concurrency not emulated locally — fine).
- **Risk / migration note:** changing the build target is a real migration — `npm run dev` (Vite) is unaffected (SvelteKit dev server), but `wrangler dev` and the deploy pipeline change. This is **tech-debt-free if done once at the start of Phase 4** and unblocks both cron and queues. (Open **Q1**, **Q2**.)

### 1.2 `tracked_listings` — schema check + gap

**VERIFIED:** `migrations/0002_herorank.sql` contains **only** `subscriptions`, `credits_ledger`, `processed_stripe_events`. **There is NO `tracked_listings` table and NO `connected_shops` table.** The brief's assumption ("bảng tracked_listings đã có schema Phase 1") and `backend-architecture.md`'s "data model tối thiểu" listing them are **aspirational, not implemented.** Phase 3 ships `0003_etsy.sql` (`etsy_api_usage`, `keywords_cache`, `analyses`). **Phase 4 ships `0004_jobs_oauth.sql`** with the new tables (§1.4, §3.2). (Assumption **A1**, Open **Q3**.)

### 1.3 Cron flow — rank tracking

```
EVERY 30 MIN (cron "*/30 * * * *") — but each tracked listing re-checked at most once/day:
1. usageCounter.peek(): if usedToday + estimate would exceed ETSY_CRON_CAP → defer, exit (BR-P4-CRON-01).
2. SELECT tracked_listings due for refresh (last_checked_at < now - 24h), LIMIT N (batch, e.g. 50/run) ORDER BY last_checked_at ASC.
3. For each: rankEstimate(listing_id, keyword) via EtsyClient findActiveListings(sort_on=score) — CACHE-AWARE
   (reuse Phase 3 cache key etsy:v1:rank:{listing_id}:{kw}; a fresh cache entry = 0 Etsy calls).
4. INSERT a rank_history row (listing_id, keyword, position, captured_at).
   Also INSERT an analyses row (tool='rank-check') so the existing Phase 3 FE history chart reads ONE source. (Open Q4 — rank_history table vs reuse analyses; BA recommends a dedicated rank_history table, see §1.4.)
5. UPDATE tracked_listings.last_checked_at, last_rank.
6. Resumable: a partial run (cap hit) just resumes next trigger; idempotent per listing (24h guard).
```

- **Why every-30-min cron but 24h-per-listing:** spreads load smoothly across the day instead of a thundering-herd at one fixed time; keeps each run tiny (≤50 listings) and within QPS. Each listing still refreshes ~once/day → daily-granularity history chart the FE already expects (7-day chart).
- **Cron rank-track shares `usageCounter` + `ETSY_CRON_CAP`** with Phase 3's weekly refresh. Budget: if total tracked listings across all users = T, daily cron Etsy calls ≈ T (cache-miss case) — must stay under `ETSY_CRON_CAP` minus Phase-3 weekly amortised (~86/day). With plan caps (§1.5) bounding T, this stays well under 2000. (BR-P4-CRON-01.)

### 1.4 "Track this listing" — per-plan limits + new tables

**FE (rank-check page):** add a **"Track this listing"** button after a rank-check result. It calls a new endpoint that inserts into `tracked_listings`. The 7-day history chart (currently `mockHistory` in `rank-check/+page.svelte` lines 14–20) is **already slated in Phase 3** to read real `analyses` history; Phase 4 makes that history **auto-grow daily** via cron (instead of only when the user manually re-runs).

**Per-plan tracking limits** (mirrors credits-pool plan tiers from Phase 1; numbers proposed, PM confirms — Open **Q5**):

| Plan | Max tracked listings |
|---|---|
| free | 0 (or 1 trial) |
| side | 10 |
| business | 50 |
| enterprise | 200 |

- Enforced at the **track endpoint** (count existing rows for user; reject with 403 `TRACK_LIMIT` + upgrade CTA if at cap). (BR-P4-TRACK-01.)
- Tracking a listing is **free of credits** (it is a subscription feature, not a per-call tool). The **daily cron re-checks do NOT charge credits** either (background, not user-initiated). (BR-P4-TRACK-02, Open **Q6** — confirm tracking is plan-gated, not credit-charged.)

**Migration `0004_jobs_oauth.sql` (Engineer F owns) — rank-tracking part:**
```sql
-- Phase 4: periodic rank tracking.
CREATE TABLE tracked_listings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  listing_id      INTEGER NOT NULL,
  keyword         TEXT NOT NULL,                 -- normalized
  last_rank       INTEGER,                       -- nullable: null = "not in top 100"
  last_checked_at INTEGER,                       -- epoch; null = never checked
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, listing_id, keyword)           -- one track per (user, listing, keyword)
);
CREATE INDEX idx_tracked_due ON tracked_listings(last_checked_at);

CREATE TABLE rank_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL,
  keyword      TEXT NOT NULL,                     -- normalized
  position     INTEGER,                           -- nullable: null = outside top 100
  captured_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_rank_hist ON rank_history(listing_id, keyword, captured_at);
```
> **rank_history vs analyses (Open Q4):** BA recommends a **dedicated `rank_history` table** keyed by (listing_id, keyword) NOT (user_id) — because rank for a given listing+keyword is **global/shared** (same as Phase 3's global cache principle BR-P3-05); two users tracking the same listing share history and the cron writes once. `analyses` (Phase 3) stays per-user for the on-demand path. FE chart reads `rank_history` for tracked listings, `analyses` for one-off checks. (Confirm with PM; alternative is to reuse `analyses` with `user_id` nullable for cron rows.)

---

## 2. Queues — deep shop analysis

### 2.1 Why a queue (vs the synchronous Phase 3 shop-analyzer)

Phase 3 `shop-analyzer` (cost 3) is **bounded** (cap 100 listings + 100 reviews) precisely so it fits in one request. Phase 4 adds a **deep** variant: full shop (ALL listings + ALL reviews + per-listing estimation + category breakdown). This can be **hundreds of Etsy calls + tens of seconds** → exceeds request limits and would block. → **producer/consumer queue.**

### 2.2 Flow (producer → consumer → poll)

```
PRODUCER  POST /api/tools/shop-analysis-deep   (cost: charged UP FRONT, see §2.4)
  1. requireAuth + requireCredits('shop-analysis-deep') pre-check (does NOT deduct yet — see §2.4).
  2. INSERT analyses row {user_id, tool:'shop-analysis-deep', subject:shop, status:'queued', payload:'{}'}.
  3. env.ANALYSIS_QUEUE.send({ jobId, userId, shop, requestedAt }).
  4. Return 202 { jobId, status:'queued' } IMMEDIATELY. (No deduct yet.)

CONSUMER  queue handler (handleQueue, batch ≤5)   [runs in src/worker.ts queue handler]
  For each message:
  5. UPDATE analyses SET status='running'.
  6. Resolve shop → shop_id; paginate ALL listings + reviews via EtsyClient (cache-aware, increments usageCounter — draws from USER budget, not cron cap). Stop/back-off on QuotaExceeded → status='deferred', re-queue with delay (retry ≤3 via DLQ).
  7. Run estimation (salesEstimate per listing, category aggregation).
  8. UPDATE analyses SET status='done', payload=<result JSON>, metric=<headline>.
  9. ON SUCCESS deduct credits via creditsService (manual, like Phase 2 SSE deduct) → ledger 'spend:shop-analysis-deep'. ON FAILURE after retries → status='failed', NO charge (BR-P4-01).

POLLING   GET /api/tools/shop-analysis-deep/:jobId
  10. Returns { status, result?, creditsRemaining? }. FE polls every ~3s until status ∈ {done,failed}.
```

### 2.3 Local dev + fallback

- **`wrangler dev` runs Queues locally** (same engine as prod; consumer concurrency not emulated — irrelevant for correctness). Web-verified 2026-06-12.
- **Fallback when a binding is absent** (e.g. plain `vite dev`, or no queue configured): the producer detects `env.ANALYSIS_QUEUE` missing and runs the analysis **inline via `executionCtx.waitUntil`** (degraded "synchronous-ish" path) OR returns the job and lets a **dev-only `/api/dev/drain-queue`** endpoint process it. BA recommends the `waitUntil` inline fallback so `vite dev` still works without wrangler. (BR-P4-Q-03, Open **Q7**.)
- **SSE vs polling for the FE (Open Q8):** BA recommends **polling** (`GET /:jobId` every 3s) over SSE — simpler, no long-lived connection on Workers, matches the queue's async nature, and the existing FE already uses request/response. SSE would only add value for sub-second updates we don't need here.

### 2.4 Credits for async jobs — the deduct-timing rule

- **Pre-check at enqueue** (reject 402 if insufficient, queue nothing) but **deduct only on consumer success** (step 9), same invariant as Phase 2's streaming chat (deduct after `[DONE]`, mid-failure = no charge). (BR-P4-01.)
- **Race:** between pre-check and consumer-deduct the user could spend credits elsewhere. Mitigation: the consumer deduct uses the **same atomic conditional `UPDATE … WHERE credits_balance >= cost`** from Phase 1; if it fails at consume time → job result still saved but flagged `payment_failed` and FE prompts to top-up to unlock (or we soft-reserve at enqueue). BA recommends **conditional-deduct-on-success + `payment_failed` state** (no hard reservation table) for v1. (Open **Q9**.)
- **Cost:** `shop-analysis-deep` = **8 credits** (proposed — it is the heaviest tool; many Etsy calls + estimation). C adds the key to `toolCosts.ts`. (Open **Q10**.)

### 2.5 `analyses` reuse (no new table for queue)

The queue uses Phase 3's **existing `analyses` table** (`status` column already present: `'queued'|'running'|'done'|'failed'|'deferred'`). **No new migration for queues** beyond what Phase 3 ships — Phase 4 just writes a new `tool` value. (Confirms Phase 3 §2.4 `analyses` was the right call; **A5** below.)

---

## 3. OAuth connected shops (Layer 4 — calibration)

### 3.1 Etsy OAuth 2.0 (Authorization Code + PKCE) — verified flow

Etsy v3 uses **OAuth 2.0 Authorization Code grant with PKCE** (research §5). Own-shop only — there is **no cross-shop access**; this is exactly the use-case Etsy approves (strategy risk table). Minimal scopes for calibration:

| Scope | Why |
|---|---|
| `transactions_r` | **read own-shop sales/transactions** — the real-sales signal for calibration |
| `shops_r` | resolve the connected shop id/details |
| `listings_r` | map transactions → listing → category (review-rate per category) |

> **NO write scopes.** Read-only. (BR-P4-OAUTH-02.)

**Flow (4 routes, Engineer H owns — new `oauth-etsy.ts` router):**
```
1. GET  /api/connect/etsy/start
   - generate code_verifier (random) + code_challenge (S256) + state (CSRF).
   - store {state, code_verifier, user_id} in oauth_states (D1, short TTL) — server-side, NOT cookie-only.
   - 302 → https://www.etsy.com/oauth/connect?response_type=code&client_id=...&redirect_uri=...
            &scope=transactions_r%20shops_r%20listings_r&state=...&code_challenge=...&code_challenge_method=S256

2. GET  /api/connect/etsy/callback?code=&state=
   - validate state (lookup oauth_states, match user, not expired) → else 400.
   - POST https://api.etsy.com/v3/public/oauth/token  grant_type=authorization_code + code + code_verifier
       → { access_token, refresh_token, expires_in }.
   - getShop(me) to resolve shop_id + name.
   - UPSERT connected_shops (encrypted tokens — §3.3). Delete oauth_state.
   - 302 → /settings/connections?connected=1.

3. POST /api/connect/etsy/refresh   (internal; called when access token near expiry)
   - grant_type=refresh_token → new access_token. Update connected_shops.

4. DELETE /api/connect/etsy        (user disconnects)
   - delete connected_shops row (+ optionally revoke). 200.
```

- **Token endpoint:** `https://api.etsy.com/v3/public/oauth/token`. **Authorize endpoint:** `https://www.etsy.com/oauth/connect`. Access tokens are short-lived (~1h, prefixed `<user_id>.<token>`); refresh tokens ~90 days. Refresh proactively in the calibration job (§3.4).

### 3.2 Tables (`0004_jobs_oauth.sql`, Engineer F owns the file; H specifies these rows)

```sql
-- Phase 4: OAuth connected shops (Layer 4).
CREATE TABLE oauth_states (
  state         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())   -- TTL-pruned (e.g. 10 min) in callback
);

CREATE TABLE connected_shops (
  user_id            TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,  -- one shop per user (v1)
  etsy_shop_id       INTEGER NOT NULL,
  shop_name          TEXT,
  access_token_enc   TEXT NOT NULL,     -- encrypted (§3.3)
  refresh_token_enc  TEXT NOT NULL,     -- encrypted
  token_expires_at   INTEGER NOT NULL,  -- epoch
  scopes             TEXT NOT NULL,
  connected_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  last_calibrated_at INTEGER
);

-- Calibration output: real review-rate per category from connected shops' OWN transactions.
-- The estimation engine READS this (overrides config.ts defaults) — it does NOT hardcode (§3.4).
CREATE TABLE calibration_factors (
  category_id     INTEGER PRIMARY KEY,   -- top-level taxonomy node
  review_rate     REAL NOT NULL,         -- measured reviews/transactions for this category
  sample_size     INTEGER NOT NULL,      -- # transactions backing this (confidence)
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### 3.3 Token security

- **Tokens MUST be encrypted at rest** (D1 is not a secret store). Encrypt with AES-GCM using a key from `env.OAUTH_TOKEN_KEY` (Workers secret, Engineer A adds). Helper `services/crypto.ts` (Engineer H). **Never log tokens.** (BR-P4-OAUTH-03.)
- `oauth_states` row is deleted on callback; pruned by age otherwise. `state` + PKCE `code_verifier` defend CSRF + code-interception. (BR-P4-OAUTH-01.)

### 3.4 Calibration job — feeds the estimation engine WITHOUT hardcoding

**The key design rule (brief requirement c):** calibration must update the estimation engine through a **data table the engine reads**, NOT by editing `estimation/config.ts` numbers.

**Mechanism — change to Phase 3's `salesEstimate` (Engineer G, small surgical edit):**
- Phase 3 `salesEstimate` reads `REVIEW_RATE[categoryId]` from `estimation/config.ts` (default 0.15). Phase 4 makes it read from an **injected `reviewRateProvider`**:
```ts
// Phase 3 (today): const rate = REVIEW_RATE[catId] ?? DEFAULT_REVIEW_RATE;
// Phase 4: const rate = reviewRateProvider(catId) ?? REVIEW_RATE[catId] ?? DEFAULT_REVIEW_RATE;
```
- `reviewRateProvider` is a function injected into the estimation call that does `SELECT review_rate FROM calibration_factors WHERE category_id=? AND sample_size >= MIN_SAMPLE`. If calibration data exists (enough samples) → use measured rate; else fall back to `config.ts` default. **config.ts stays the floor; calibration overrides per-category when confident.** (BR-P4-CAL-01.)
- This is a **2-line change to one estimation function signature + a provider param** — G owns it, F/H supply the provider. The estimation pure-fn purity is preserved (provider is injected, not an import).

**Calibration job (cron, weekly — folds into the §1.1 `scheduled` handler, Engineer H logic):**
```
For each connected_shop (refresh token if near expiry):
  1. GET own-shop transactions (transactions_r) for trailing 90d → count real sales per listing.
  2. GET own-shop reviews (already have via getReviewsByShop) → count reviews per listing in same window.
  3. Map each listing → top-level category (taxonomy).
  4. Aggregate per category across ALL connected shops: review_rate = Σreviews / Σtransactions.
  5. UPSERT calibration_factors(category_id, review_rate, sample_size += n).
  6. UPDATE connected_shops.last_calibrated_at.
```
- **Data moat (strategy doc):** more connected shops → larger `sample_size` → more accurate per-category `review_rate` → better `salesEstimate` for ALL users (EverBee model). Pure win, $0 cost.
- **Privacy:** only **aggregate** review-rates are stored in `calibration_factors` (no per-shop sales persisted beyond the transient job). Connected seller's raw sales are never exposed to other users. (BR-P4-OAUTH-04.)

### 3.5 Mock OAuth for dev (mandatory — no key)

- `services/oauth/provider.ts` — `getEtsyOAuth(env)` returns **real** provider if `env.ETSY_OAUTH_CLIENT_ID` present, else `createMockOAuth()` (mirrors Phase 3 `getEtsyClient`). Mock:
  - `/start` → 302 to a **local stub** `/api/connect/etsy/mock-authorize?state=...` that immediately bounces to `/callback?code=mock_code&state=...` (no real Etsy).
  - token exchange → canned `{access_token:'mock', refresh_token:'mock', expires_in:3600}`.
  - own-shop transactions → fixture JSON (e.g. jewelry shop with N transactions + M reviews) so the **calibration job runs end-to-end** and produces a `calibration_factors` row in dev/test. (BR-P4-OAUTH-05.)

### 3.6 FE — Settings "Connect your Etsy shop"

- New settings section `src/routes/(dashboard)/settings/connections/+page.svelte` (Engineer E — or a dedicated FE eng, §5). States: **not connected** ("Connect your Etsy shop" button → `/api/connect/etsy/start`), **connected** (shop name + "Disconnect" + "last calibrated" + a note "Your sales data improves estimate accuracy for everyone — only aggregate rates are stored"), **error** (`?error=` from callback). Honesty + privacy copy is required, not optional.

---

## 4. Video-generator — build / cut / defer recommendation

### 4.1 Current state

`tools/etsy/video-generator/+page.svelte` is a **pure mock**: upload UI + settings (duration/transition/aspect) + a fake `setTimeout(2000)` "Generating…" → static "Video Preview" placeholder + non-functional Download/Preview buttons. No backend, no R2, no render service. The page **promises an MP4 it cannot produce.**

### 4.2 Build options + concrete cost (web-verified 2026-06-12)

A slideshow-from-photos video needs an external render service (Workers cannot run ffmpeg/encoding at scale; CPU-time + memory limits). Three candidates:

| Service | Model | ~Cost per 15s slideshow | Notes |
|---|---|---|---|
| **Shotstack** | per **rendered minute**, flat | $0.20–0.40/min → **~$0.05–0.10 / 15s video** | Cleanest pay-as-you-go; JSON edit spec → MP4; 4K = same price. Best fit for slideshow. |
| **Creatomate** | credit-based, resolution/fps-scaled | $54/mo for 2000 credits; 720p@25fps ≈14 cr/min → **~$0.10/15s** (+ extra for any TTS) | Subscription floor; TTS billed separately. |
| **Remotion Lambda** | license **$100/mo min** + self-hosted AWS (~$50–100/mo) + your seats | **~$150–200/mo fixed** before any volume | React-based, most flexible, but heavy fixed infra + you run encoders. Overkill for slideshows. |

### 4.3 Recommendation: **DEFER (cut from v1), ship a "Coming soon" + waitlist**

**Reasoning:**
1. **No budget approved** (brief constraint) — every option has either per-render cost or a monthly floor. Shipping a real renderer now spends money on an unproven-demand feature.
2. **Video is orthogonal to the core SEO value prop** (the other 11 tools are data/LLM; video is a media-production side-quest). It is explicitly the **last** roadmap item.
3. **The current mock actively misleads** (offers a Download MP4 that does nothing) — that is worse than an honest "Coming soon."
4. **Deferring is cheap and reversible:** if/when built, **Shotstack** is the clear pick (lowest marginal cost, flat per-minute, no infra, fits slideshow exactly) — wired the same seam pattern (R2 for uploads + generated MP4, queue for the render job since it's long-running → reuses §2's queue infra).

**Concrete defer deliverable (Engineer E, tiny):**
- Replace the fake generate flow with a **"Coming soon" state** + an optional **waitlist email capture** (`POST /api/waitlist/video-generator` → a `waitlist` table, or just count interest). Remove the misleading Download/Preview buttons. Keep the upload/settings UI visible (greyed) so the feature is "previewable."
- **No credits cost, no backend render, no R2, no new queue** in Phase 4. (BR-P4-VIDEO-01.)

**If PM chooses BUILD instead (Open Q11):** scope = Shotstack + R2 (store uploads + output) + a **`video-generate` queue job** (reuses §2 queue + worker entry) + `env.SHOTSTACK_API_KEY` + cost ≈ 5 credits/video (covers ~$0.10 render + margin). This is a **meaningful add** (R2 binding, new env, queue job, ~2 days) — BA recommends NOT in Phase 4 unless demand is proven.

---

## 5. API contract, credits, FE wiring, test plan, ownership

### 5.1 New endpoints + credit cost

| Endpoint | Method | Auth | Credits | Owner (route) |
|---|---|---|---|---|
| `/api/tools/track-listing` | POST | yes | **0** (plan-gated, not charged) | F |
| `/api/tools/tracked-listings` | GET | yes | 0 | F |
| `/api/tools/tracked-listings/:id` | DELETE | yes | 0 | F |
| `/api/tools/rank-history` | GET `?listing=&keyword=` | yes | 0 (read own history) | F |
| `/api/tools/shop-analysis-deep` | POST | yes | **8** (deduct on consumer success) | F |
| `/api/tools/shop-analysis-deep/:jobId` | GET | yes | 0 (poll) | F |
| `/api/connect/etsy/start` | GET | yes | 0 | H |
| `/api/connect/etsy/callback` | GET | yes | 0 | H |
| `/api/connect/etsy/refresh` | POST (internal) | — | 0 | H |
| `/api/connect/etsy` | DELETE | yes | 0 | H |
| `/api/waitlist/video-generator` | POST | yes | 0 | E (defer path) |

- `track-*`, `tracked-*`, `rank-history`, `shop-analysis-deep` live in **`routes/jobs.ts`** (Engineer **F**, NEW). `connect/etsy/*` in **`routes/oauth-etsy.ts`** (Engineer **H**, NEW). Both mounted by **C** into `tools.ts`/app router (one line each, same pattern as Phase 2 `llmTools` + Phase 3 `etsyTools`). `waitlist` can ride F's `jobs.ts` or a trivial route.
- **`toolCosts.ts` (Engineer C):** add `shop-analysis-deep:8`. (`track-listing` etc. are not in TOOL_COSTS — they don't use `requireCredits`; they use a new `requirePlan`/manual check.)

### 5.2 `env.ts` additions (Engineer A — single edit, mirrors Phase 2/3 pattern)

```ts
// --- Phase 4: jobs + OAuth ---
ANALYSIS_QUEUE?: Queue;              // queue producer binding
ETSY_OAUTH_CLIENT_ID?: string;      // OAuth keystring (absent → mock OAuth)
ETSY_OAUTH_CLIENT_SECRET?: string;
ETSY_OAUTH_REDIRECT_URI?: string;   // /api/connect/etsy/callback absolute URL
OAUTH_TOKEN_KEY?: string;           // AES-GCM key for token encryption (Workers secret)
ETSY_CRON_CAP?: string;             // already added in Phase 3 (A) — reused, not re-added
// SHOTSTACK_API_KEY?: string;      // only if PM chooses BUILD (Q11)
```
Plus `app.d.ts` `Platform` already exposes `env: Env` — no change. **`Queue` type** from `@cloudflare/workers-types`.

### 5.3 FE wiring

| Page | Owner | Change |
|---|---|---|
| `tools/etsy/rank-check/+page.svelte` | E | add "Track this listing" button (calls `/track-listing`; show plan-limit/403 → upgrade CTA); chart already reads real history (Phase 3) — now also shows tracked-listing auto-history. |
| `settings/connections/+page.svelte` (NEW) | E | Connect/Disconnect Etsy shop; states (not-connected/connected/error); privacy copy (§3.6). |
| `tools/etsy/video-generator/+page.svelte` | E | "Coming soon" + waitlist; remove fake Download/Preview (§4.3). |
| deep shop-analysis result UI | E | a results view that **polls** `/:jobId` (queued→running→done); reuse `tools-client.ts`. (Could extend the Phase 3 shop-analyzer page with a "Deep analysis" toggle — Open **Q12**.) |

> All FE buildable against **mock responses** first (same as Phase 2/3).

### 5.4 Test plan (NO real Etsy key, NO real OAuth, queue/cron local)

- **Cron rank-track:** unit — selects only due listings; respects `ETSY_CRON_CAP` (defers when over); writes `rank_history`; idempotent (24h guard → re-run = ~0 calls); cache-aware (hit = 0 Etsy calls). Local: `wrangler dev --test-scheduled` + `/__scheduled?cron=*/30 * * * *`.
- **Track limits:** integration — track up to plan cap → 200; over cap → 403 `TRACK_LIMIT`, no row inserted; free plan → 403/trial; **no credits charged** for tracking (ledger has no row). (BR-P4-TRACK-*.)
- **Queue deep-analysis:** producer returns 202 + jobId, **no deduct yet**; consumer (invoke handler with mock batch) → status transitions queued→running→done, deduct on success (ledger `spend:shop-analysis-deep` = 8), failure after retries → status='failed' + **no charge** (BR-P4-01); quota-hit mid-job → deferred/re-queued. Producer with missing `ANALYSIS_QUEUE` binding → `waitUntil` inline fallback (BR-P4-Q-03). Poll endpoint returns correct status/result.
- **OAuth (mock):** `/start` → 302 with `state` + `code_challenge` present; `oauth_states` row written; callback with wrong/expired state → 400, no `connected_shops` write; happy callback (mock token) → `connected_shops` upserted with **encrypted** tokens (assert ciphertext ≠ plaintext, decrypt round-trips); disconnect → row deleted. CSRF: mismatched state rejected (BR-P4-OAUTH-01). Tokens never appear in logs.
- **Calibration:** with a mock connected shop fixture (N transactions, M reviews, known category) → job writes `calibration_factors(review_rate=M/N, sample_size=N)`; `salesEstimate` then uses measured rate when `sample_size ≥ MIN_SAMPLE`, else config default (BR-P4-CAL-01); G's estimation tests cover provider-override vs fallback.
- **Video defer:** FE smoke — "Coming soon" renders, no Download MP4 button, waitlist POST works; no render backend exists.
- **Worker entry / build target:** A verifies `wrangler dev` boots with `main` entry, http still served, `scheduled` + `queue` handlers registered; Vite `npm run dev` unaffected.

### 5.5 Ownership split (no file overlap) + ordering

**Engineers:** **F** (jobs backend — reuses Phase 3 F's Etsy infra), **H** (OAuth + calibration — NEW role), **G** (estimation — Phase 3 G, one surgical edit), **E** (FE — Phase 2/3 E), **A** (env/wrangler/worker-entry — Phase 1/3 A), **C** (toolCosts + route mount — Phase 2/3 C).

| Eng | Owns (NEW unless noted) | Depends on |
|---|---|---|
| **A** | `src/worker.ts` (NEW — scheduled+queue+fetch entry, §1.1), **edits** `wrangler.jsonc` (main/assets/triggers/queues), **edits** `svelte.config.js` (adapter Static-Assets mode), **edits** `env.ts` (Phase 4 keys §5.2) | — (do FIRST, unblocks cron+queue) |
| **F** | `src/lib/server/cron/rankTrack.ts`, `src/lib/server/cron/index.ts` (`handleScheduled` — dispatches Phase 3 etsy-refresh + Phase 4 rank-track by `controller.cron`), `src/lib/server/queue/index.ts` (`handleQueue` consumer), `services/jobs/deepShopAnalysis.ts`, `api/routes/jobs.ts`, `migrations/0004_jobs_oauth.sql` | Phase 3 F's `EtsyClient`/cache/`usageCounter`/`provider` (must exist); A's worker entry; G's estimation |
| **H** | `api/routes/oauth-etsy.ts`, `services/oauth/{provider,etsyOAuth,mockOAuth}.ts`, `services/crypto.ts`, `services/calibration/calibrationJob.ts`, `services/oauth/__fixtures__/*`, OAuth+calibration tests | A's env (OAuth keys, `OAUTH_TOKEN_KEY`); F's `0004` migration (H specifies the OAuth tables, F owns the file — **coordinate: F writes the single migration file, H provides the OAuth/calibration DDL**); F's `EtsyClient` (for own-shop reads) |
| **G** | **edits** `services/estimation/salesEstimate.ts` + `config.ts` — add injected `reviewRateProvider` param (§3.4); estimation tests for override/fallback | calibration_factors table (F's migration) — only reads via injected provider, no direct import |
| **C** | **edits** `toolCosts.ts` (+`shop-analysis-deep:8`); **edits** `tools.ts`/app router — mount `jobs.ts` + `oauth-etsy.ts` (+ Phase 2 `llmTools` + Phase 3 `etsyTools` if running together) | F + H route default exports exist |
| **E** | rank-check "Track" button, `settings/connections/+page.svelte` (NEW), video-generator "Coming soon", deep-analysis polling UI; reuse `tools-client.ts` + `EstimatedBadge` | §5.1 contract (mock first) |

**Shared-file coordination (the ONLY overlap points — managed, no two engineers edit the same file):**
- **`migrations/0004_jobs_oauth.sql`** — **F owns the file**; H supplies the OAuth/calibration DDL text to F (one file, one author). Same model as Phase 3's `etsy/types.ts` (F-owned, G-consumed).
- **`tools.ts` / app router mount** — **C only** (one engineer), exactly like Phase 2+3. C mounts up to 4 routers (`llmTools`, `etsyTools`, `jobs`, `oauth-etsy`); **C sequences the edits** to avoid merge clashes.
- **`toolCosts.ts`** — **C only.**
- **`env.ts` + `wrangler.jsonc` + `svelte.config.js` + `worker.ts`** — **A only.**
- **`salesEstimate.ts` / `config.ts`** — **G only** (Phase 3 G's files; Phase 4 G is the same engineer — no cross-phase overlap).

**Cross-phase ordering (Phase 2/3 may still be unimplemented when Phase 4 starts):**
1. **Phase 4 hard-depends on Phase 3 being implemented** (EtsyClient, cache, usageCounter, provider, estimation, `analyses` table, `0003` migration). **Phase 4 cannot start its Etsy-touching parts until Phase 3 backend (F+G) lands.** The OAuth flow + worker-entry + queue **plumbing** can be built in parallel against mocks, but calibration + rank-track + deep-analysis need Phase 3's seams. (Assumption **A6**.)
2. **A's worker-entry migration (§1.1) should land FIRST in Phase 4** — it is the gate for cron + queues and is independent of Etsy data.
3. **C mounts routers in one coordinated pass** across whichever phases are live (Phase 2 `llm`, Phase 3 `etsy`, Phase 4 `jobs`+`oauth`).
4. Migrations are strictly ordered: `0001` (auth) → `0002` (Phase 1) → `0003` (Phase 3 etsy) → `0004` (Phase 4 jobs+oauth). **Phase 4's `0004` assumes `0003` exists** (references `analyses`, taxonomy concepts). If Phase 3 hasn't shipped, `0004` must not run first.

---

## 6. Business rules (testable)

- **BR-P4-01** Async/job failures (queue retry-exhausted, deep-analysis error, quota mid-job) charge **0 credits**; deep-analysis deducts **only on consumer success** (= Phase 2 streaming invariant).
- **BR-P4-TRACK-01** A user cannot exceed their plan's max tracked listings; over-cap → 403 `TRACK_LIMIT`, no row inserted.
- **BR-P4-TRACK-02** Tracking a listing and its daily cron re-checks charge **0 credits** (plan feature, not metered).
- **BR-P4-CRON-01** Cron (rank-track + Phase 3 refresh combined) never pushes `etsy_api_usage` above `ETSY_CRON_CAP`; over-budget seeds/listings defer to the next run; idempotent (24h per-listing guard).
- **BR-P4-Q-03** With no `ANALYSIS_QUEUE` binding, the producer falls back to inline `waitUntil` processing (dev) — never a 500.
- **BR-P4-OAUTH-01** OAuth callback validates `state` (CSRF) + PKCE `code_verifier`; mismatch/expiry → 400, no `connected_shops` write.
- **BR-P4-OAUTH-02** Only read scopes (`transactions_r`, `shops_r`, `listings_r`) are requested; no write scope ever.
- **BR-P4-OAUTH-03** Access/refresh tokens are encrypted at rest (AES-GCM via `OAUTH_TOKEN_KEY`) and never logged.
- **BR-P4-OAUTH-04** Only **aggregate** per-category review-rates are persisted in `calibration_factors`; no connected shop's raw sales are exposed to other users.
- **BR-P4-OAUTH-05** With no `ETSY_OAUTH_CLIENT_ID`, the OAuth flow runs end-to-end against the **mock provider** (dev/test) — never a real Etsy call, never a crash.
- **BR-P4-CAL-01** `salesEstimate` uses a measured `calibration_factors.review_rate` when `sample_size ≥ MIN_SAMPLE`, else falls back to `config.ts` default — calibration never hardcodes new constants into `config.ts`.
- **BR-P4-VIDEO-01** Video-generator (defer path) charges 0 credits, runs no render backend, and shows no functional Download button.

## 7. Acceptance criteria (Given/When/Then highlights)

- **Given** a `side`-plan user with 0 tracked listings, **When** they "Track this listing", **Then** a `tracked_listings` row is created, **0 credits** charged; an 11th track → 403 upgrade CTA.
- **Given** a tracked listing, **When** the 30-min cron runs over a day, **Then** `rank_history` accrues ~1 point/day and the rank-check chart shows real growing history (not mock).
- **Given** cron would exceed `ETSY_CRON_CAP`, **When** it runs, **Then** it processes within budget and defers the rest to the next trigger (no quota breach).
- **Given** a user requests deep shop analysis, **When** they submit, **Then** they get a `jobId` immediately (202), the consumer processes it async, the FE poll flips to `done` with results, and **8 credits** are deducted only on success; a failed job charges 0.
- **Given** a seller clicks "Connect your Etsy shop" (mock provider, no key), **When** the flow completes, **Then** a `connected_shops` row exists with **encrypted** tokens and CSRF state was validated.
- **Given** ≥1 connected shop with transactions, **When** the calibration job runs, **Then** `calibration_factors` gets a measured per-category `review_rate`, and subsequent `salesEstimate` calls for that category use it (not the config default).
- **Given** the video-generator page, **When** a user visits, **Then** they see "Coming soon" + waitlist — no fake "Download MP4".
- **Given** no Etsy key and no OAuth credentials, **When** the full Phase 4 test suite runs, **Then** all cron/queue/oauth/calibration tests pass against mocks + fixtures.

## 8. Technical constraints & risks

- **Build-target migration (§1.1) is the biggest risk** — moving off legacy Pages to Workers Static-Assets + custom `main` entry changes the deploy pipeline. Mitigation: A does it first, in isolation, verifies `wrangler dev` + Vite dev both work before any handler logic is added. (Open Q1/Q2.)
- **Phase 4 hard-depends on Phase 3 backend** (EtsyClient/cache/usageCounter/estimation/`analyses`). If Phase 3 slips, Phase 4 Etsy-touching work slips with it; only worker-entry + OAuth plumbing + queue scaffold are independently buildable. (A6.)
- **Etsy commercial-app + OAuth approval** is the same product go/no-go as Phase 3 (Optimsy risk). OAuth own-shop is the use-case Etsy *approves* (data moat), so it strengthens the approval case — but still needs the app live. Build/test proceed on mock regardless.
- **Queue local-dev**: `wrangler dev` runs Queues (consumer concurrency not emulated — irrelevant). Plain Vite dev has no queue → inline `waitUntil` fallback (BR-P4-Q-03).
- **Token security**: D1 is not a secret store → AES-GCM encryption is mandatory, not optional (BR-P4-OAUTH-03).
- **Calibration cold-start**: until enough connected shops contribute, `calibration_factors` is sparse → estimation uses config defaults (graceful, honest). Accuracy improves over time (the moat). 
- **Video render cost** is unbudgeted → defer (§4.3). If built, Shotstack per-minute is the lowest-risk model.

## 9. Assumptions

- **A1** `tracked_listings` and `connected_shops` do **NOT** exist today (verified `0002`); Phase 4 creates them in `0004` (brief's "schema Phase 1 đã có" was incorrect).
- **A2** Phase 4 migrates the build to Workers Static-Assets + custom `main` entry (Engineer A); legacy Pages cannot run cron/queues. (Q1)
- **A3** Rank-tracking and Phase 3 refresh share one `scheduled` handler + one `usageCounter` + `ETSY_CRON_CAP`.
- **A4** Deep shop-analysis reuses Phase 3's `analyses` table (status column) — no new table for queues.
- **A5** Tokens encrypted via `OAUTH_TOKEN_KEY` Workers secret (A adds).
- **A6** Phase 3 backend (EtsyClient/cache/usageCounter/estimation) is implemented before Phase 4's Etsy-touching parts; OAuth/worker-entry/queue scaffold can precede it against mocks.
- **A7** Plan tracking limits (free 0, side 10, business 50, enterprise 200) are starting numbers; PM confirms (Q5).
- **A8** Video-generator is **deferred** (Coming-soon + waitlist), not built, in Phase 4 (Q11).
- **A9** Calibration stores only aggregate review-rates (privacy); raw connected-shop sales are transient.

---

## Open questions for PM

- **Q1** — **Build-target migration:** OK to move from legacy Pages (`pages_build_output_dir`) to **Workers Static-Assets + custom `src/worker.ts` `main` entry** (official adapter)? This is required for cron + queues. Alternative is the community fork `sveltekit-adapter-cloudflare` (native scheduled/queue merge) — BA recommends the official-adapter + thin entry. Confirm direction.
- **Q2** — Acceptable that this migration changes the `wrangler dev`/deploy pipeline (A does it first, in isolation)? Any production-deploy constraints we must respect?
- **Q3** — Confirm `tracked_listings` + `connected_shops` are **new in `0004`** (they were never implemented; brief assumed they existed).
- **Q4** — Rank history storage: **dedicated `rank_history` table** (global, keyed listing+keyword — BA rec) vs reuse Phase 3 `analyses` (per-user, cron writes nullable user_id)?
- **Q5** — Per-plan **tracked-listing limits**: free 0 / side 10 / business 50 / enterprise 200 — confirm or adjust.
- **Q6** — Tracking + daily cron re-checks are **credit-free** (plan feature), correct? Or should each cron re-check cost credits?
- **Q7** — Queue **local-dev fallback**: inline `waitUntil` when `ANALYSIS_QUEUE` binding absent (BA rec) — OK?
- **Q8** — Deep-analysis result delivery: **polling** `GET /:jobId` every 3s (BA rec) vs SSE?
- **Q9** — Async **credit timing**: deduct on consumer success with conditional-deduct + `payment_failed` state (BA rec) vs soft-reserve credits at enqueue?
- **Q10** — `shop-analysis-deep` cost = **8 credits** — OK against the credit pool (free 30 / side 750 / business 3000)?
- **Q11** — **Video-generator: DEFER** (Coming-soon + waitlist, $0) — BA recommends. Or BUILD now via **Shotstack** (~$0.10/video, +R2 +queue job +env, ~5 credits/video, ~2 days)? Or fully **CUT** the nav item?
- **Q12** — Deep shop-analysis UI: extend the Phase 3 shop-analyzer page with a "Deep analysis" toggle, or a separate page?
- **Q13** — OAuth: **one connected shop per user** (v1, PRIMARY KEY user_id) — sufficient? Etsy personal-tier allows up to 5; do we need multi-shop later?
- **Q14** — Calibration `MIN_SAMPLE` threshold before a measured `review_rate` overrides the config default (e.g. ≥50 transactions/category)? And calibration cron cadence (weekly — BA rec)?

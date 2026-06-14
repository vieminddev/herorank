---
name: project-phase4-jobs-oauth
description: HeroRank Phase 4 — cron rank-tracking + Cloudflare Queues + Etsy OAuth connected-shops calibration + video-generator defer
metadata:
  type: project
---

# Phase 4 (jobs + OAuth + video) — BA spec 2026-06-12

Spec: `_workspaces/2026-06-12_phase4-jobs-oauth/01_ba_spec.md`. Builds ON TOP of Phase 2+3 (specced, NOT implemented). Phase 4 reuses Phase 3 seams verbatim.

## Hard verified facts (do NOT re-derive)
- **Build target = LEGACY Cloudflare PAGES** (`wrangler.jsonc` has `pages_build_output_dir`, NO `main` entry; `svelte.config.js` plain `adapter()`). **Legacy Pages CANNOT run Cron Triggers or Queue consumers.** [PROJECT-SPECIFIC]
- **Phase 4 MUST migrate to Workers Static-Assets + custom `src/worker.ts` `main` entry** that re-exports SvelteKit generated `fetch` + adds `scheduled` + `queue` handlers. This is THE load-bearing infra change; Engineer A; do FIRST. Official adapter + thin entry recommended over community fork `sveltekit-adapter-cloudflare`. [UNIVERSAL — adapter-cloudflare cron/queue limitation]
- **`tracked_listings` and `connected_shops` DO NOT EXIST** (verified 0002 has only subscriptions/credits_ledger/processed_stripe_events). Brief + backend-architecture.md "data model tối thiểu" are aspirational. Phase 4 ships `0004_jobs_oauth.sql`. Migration chain: 0001 auth → 0002 P1 → 0003 P3 etsy → 0004 P4.
- **Queues run locally in `wrangler dev`** (consumer concurrency NOT emulated — irrelevant). Plain Vite dev = no queue → inline `waitUntil` fallback.
- **Etsy OAuth 2.0 = Authorization Code + PKCE (S256)**. Authorize `https://www.etsy.com/oauth/connect`, token `https://api.etsy.com/v3/public/oauth/token`. Access token ~1h (prefixed `<userid>.<tok>`), refresh ~90d. Own-shop ONLY (no cross-shop). Calibration scopes: transactions_r + shops_r + listings_r (READ only).

## Key design decisions
- **Cron rank-track**: every-30-min trigger but each listing re-checked ≤1×/day (spread load), shares `usageCounter`+`ETSY_CRON_CAP=2000` with Phase 3 weekly refresh. Both branches of ONE `scheduled` handler keyed by `controller.cron`. Cache-aware (reuses Phase 3 `etsy:v1:rank:` key). `rank_history` table GLOBAL (keyed listing+keyword, NOT user — like Phase 3 cache BR-P3-05).
- **Track listing = plan-gated, 0 credits** (free 0/side 10/business 50/enterprise 200, proposed). Cron re-checks also 0 credits.
- **Queue deep shop-analysis** (cost 8): producer 202+jobId (no deduct), consumer paginates ALL listings/reviews (draws USER quota budget), deduct ON SUCCESS only (= Phase 2 streaming invariant), FE polls `GET /:jobId`. Reuses Phase 3 `analyses` table (status col) — NO new table for queues.
- **Calibration = data table, NOT hardcode**: new `calibration_factors(category_id, review_rate, sample_size)`. `salesEstimate` gets injected `reviewRateProvider` param (2-line G edit): use measured rate if sample_size ≥ MIN_SAMPLE else config.ts default. config.ts stays the floor. Data moat (EverBee model), only AGGREGATE stored (privacy).
- **Tokens encrypted at rest** AES-GCM via `OAUTH_TOKEN_KEY` Workers secret (D1 not a secret store).
- **Mock everything** (no key/no oauth creds): Phase 3 `getEtsyClient` pattern → `getEtsyOAuth(env)` real-vs-mock by `ETSY_OAUTH_CLIENT_ID`. Mock OAuth bounces start→callback locally, canned tokens + fixture transactions so calibration runs e2e in dev.

## Video-generator — DEFER (BA rec)
- Current page = pure mock, offers fake "Download MP4" (misleading). No budget.
- Cost research 2026: **Shotstack** $0.20-0.40/rendered-min flat = ~$0.10/15s video (cleanest, best fit). Creatomate $54/mo floor + credit-scaled + TTS extra. Remotion Lambda ~$150-200/mo fixed (self-host AWS) = overkill.
- Recommend: Coming-soon + waitlist, $0, no backend. If BUILD → Shotstack + R2 + queue job + ~5 credits/video, ~2 days.

## Ownership (no file overlap)
- A = `src/worker.ts` (NEW entry) + wrangler.jsonc (main/assets/triggers/queues) + svelte.config.js (Static-Assets) + env.ts (ANALYSIS_QUEUE, ETSY_OAUTH_*, OAUTH_TOKEN_KEY). DO FIRST.
- F = cron/rankTrack + cron/index (handleScheduled dispatches P3 refresh + P4 rank-track) + queue/index (handleQueue consumer) + jobs/deepShopAnalysis + routes/jobs.ts + `0004` migration (owns file; H supplies OAuth/calibration DDL).
- H (NEW role) = routes/oauth-etsy.ts + services/oauth/{provider,etsyOAuth,mockOAuth} + crypto.ts + calibration/calibrationJob.ts + fixtures + tests.
- G (Phase 3 same eng) = surgical edit salesEstimate.ts + config.ts (inject reviewRateProvider).
- C = toolCosts (+shop-analysis-deep:8) + mount jobs.ts + oauth-etsy.ts (up to 4 routers total).
- E = rank-check Track button + settings/connections page (NEW) + video-generator Coming-soon + deep-analysis polling UI.

## Cross-phase ordering
- Phase 4 HARD-depends on Phase 3 backend (EtsyClient/cache/usageCounter/estimation/`analyses`/`0003`). Only worker-entry + OAuth plumbing + queue scaffold buildable independently against mocks.

## Open PM questions: Q1-Q14 (build-target migration, rank_history vs analyses, plan limits, credit timing, video build/defer/cut, one-shop-per-user, MIN_SAMPLE). See spec §"Open questions".

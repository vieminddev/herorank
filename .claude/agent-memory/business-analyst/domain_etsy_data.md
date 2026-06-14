---
name: domain-etsy-data
description: HeroRank Phase 3 — Etsy API v3 client + estimation engine + shared cache for 7 data tools
metadata:
  type: project
domain: etsy-data
last_analyzed: 2026-06-12
files_analyzed: [docs/etsy-data-strategy.md, _workspaces/etsy-data-research/01+02, 7 etsy tool FE pages, migrations/0002, toolCosts.ts, wrangler.jsonc, routes/tools.ts]
---

## Hard facts (research-confirmed, do NOT re-derive)
- Etsy API v3 FREE, 10k req/day + 10 QPS. API key (x-api-key) required on EVERY endpoint incl public. No paid tier till Enterprise (1M/day → 15% rev or $2/10k).
- **Does NOT exist in v3:** search volume, cross-shop sales/units-sold, real search rank, trending, best-seller, buyer data. All competitors estimate these.
- **Only public sales/demand proxy = review count + review timestamps** (review velocity). NO views/quantity_sold for others' listings. Entire estimation engine built on review velocity × category review-rate.
- Etsy REJECTED SEO/AI tools (Optimsy case) → commercial-app approval is product go/no-go (not eng). App submission pending → NO key yet.
- Scraping etsy.com = ToS-banned + DataDome. Autocomplete endpoint = undocumented/scraping-adjacent → EXCLUDED Phase 3.

## 4-layer strategy (docs/etsy-data-strategy.md, ADR chốt 2026-06-12)
- L1 Etsy API v3 (raw) · L2 estimation engine · L3 shared D1/KV cache · L4 OAuth own-shop (Phase 4, calibrates L2).
- Phase 3 = L1-2-3. Cost $0/mo (only LLM tokens).

## Phase 3 architecture (spec _workspaces/2026-06-12_phase3-etsy-data/01_ba_spec.md)
- EtsyClient (services/etsy/client.ts): fetch + x-api-key, retry/backoff 429, DI fetchImpl, usageCounter. createMockEtsyClient(fixtures) + provider.ts select real-vs-mock by env.ETSY_API_KEY presence (= "plug key and run", same as Phase 2 LLM seam).
- Cache-first MANDATORY: KV payloads (TTL keyword 7-30d/listing+shop 24h/trends+bestsellers 7d/taxonomy 30d) + D1 keywords_cache time-series for trendDelta. Cache is GLOBAL (not per-user). Cache hit = 0 Etsy calls but STILL charges credits.
- usageCounter in D1 etsy_api_usage(day PK,count). ETSY_DAILY_CAP=8000 (<10k headroom), ETSY_CRON_CAP=2000. Quota hit → 503 ETSY_QUOTA + serve stale.
- Estimation (services/estimation/, pure fns, no I/O): demandScore (review-velocity 0.55 + faves 0.25 + resultCount 0.20, log-norm), salesEstimate (reviewVelocity/REVIEW_RATE[cat] × price), competitionLevel (resultCount buckets 1k/20k), trendDelta (demand delta between keywords_cache periods, ≥2 weekly cron cycles to be meaningful), rankEstimate (sort_on=score, "estimated position"). ALL magic numbers in estimation/config.ts.

## Migration gap (VERIFIED)
- 0002_herorank.sql has ONLY subscriptions/credits_ledger/processed_stripe_events. NO keywords_cache, NO analyses. Phase 2 spec WRONGLY assumed keywords_cache exists. Phase 3 MUST ship 0003_etsy.sql: etsy_api_usage + keywords_cache + analyses.

## toolCosts.ts state (VERIFIED)
- Already declares: listing-analyzer:3, shop-analyzer:3, rank-check:2, niche-finder:2. MISSING (C must add): best-sellers:2, etsy-trends:2, buyer-check:2.

## FE mock → real field mapping gotchas
- listing-analyzer: views NOT available → remove StatCard. scores = rule-based audit (no LLM in Phase 3).
- shop-analyzer: percentile + listing views NOT available → remove. Heaviest quota (paginate) — cap 100 listings/100 reviews.
- etsy-trends: "Monthly Searches" absolute = FABRICATED, must rename → "Demand Index (est.)". No search volume exists.
- best-sellers: cron-fed cache (review-velocity ranking), seed categories only, "Estimated rankings" label.
- buyer-check REDEFINED → shop reputation check. Input buyer username → shop name/URL. All "buyer" copy → "shop reputation". URL stays /buyer-check.

## Ownership (3 eng, no file overlap)
- F = etsy/* (client,mock,provider,cache,usageCounter,fixtures) + etsy-tools.ts + cron + 0003 + verify-etsy.mjs + etsy/types.ts. G = estimation/* + config + tests. E = 7 pages + EstimatedBadge (reuses Phase2 tools-client.ts). C = toolCosts.ts add 3 keys + tools.ts one-line mount. A = env.ts (ETSY_*) + wrangler.jsonc crons.
- Phase 2 NOT implemented. Shared with Phase 2: E(FE), C(toolCosts+tools.ts mount), A(env). No code conflict but C must coordinate tools.ts mount order (Phase2 llmTools + Phase3 etsyTools both one-line into same file).

## Cron
- Cloudflare Cron Triggers, weekly (TTL 7d). taxonomy + trends/keyword-snapshots + best-sellers for ~12 seed categories ×10 keywords. ~600 calls/week. Stops at ETSY_CRON_CAP, idempotent/resumable. wrangler.jsonc triggers = A's file.

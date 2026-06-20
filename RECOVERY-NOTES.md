# Recovery notes — reconstructed from deployed worker (v82, 2026-06-18)

The latest source was lost; only the 06-14 git baseline + the **deployed Cloudflare Worker
bundle** (de-typed but readable JS) survived. This repo = 06-14 source reconciled against that
deployed bundle so it matches production (vierank.com) as closely as possible.

Ground-truth reference kept at `../_recovered/` (deployed `worker.js`, split modules, originals).

## Fidelity

| Area | Confidence | Notes |
|---|---|---|
| Backend `.ts` (API routes, services, jobs, repos) | **High** | Bundle only stripped types; logic/SQL/prompts copied closely. Route surface verified 55/55 vs deploy. |
| DB migrations 0006–0009 | High (DDL inferred) | Tables/columns inferred from the SQL the code runs; constraint/index names are by-convention. |
| Frontend page **controls / empty / loading** states | High | These are in the server-rendered output and were copied. |
| Frontend page **result-area markup** (data-loaded) | **Reconstructed** | SSR only captured the initial render; result layouts were rebuilt from API response shapes + existing page styles. Not byte-exact. |
| Sidebar nav (35 items / 5 groups) | High | Recovered from SSR; `.nav-group-*` CSS is best-effort. |

## What was added vs the 06-14 baseline (66 files)
- **5 new API routers:** collections, my-shop, ext, notifications, watchlist (+ internal).
- **New tool endpoints:** chatgpt-optimizer, listing-compare, tag-gap, image-studio, bulk-keywords, experiments, /me/history.
- **19 new pages** (history, notifications, settings/extension, + 16 etsy/keyword tools).
- **Reconciled:** listing-analyzer & shop-analyzer handlers, (dashboard) layout + Sidebar, settings/connections (multi-shop), keyword-generator, listing-studio (now a "coming soon" page, matching deploy).
- **Migrations:** 0006 keyword_lists, 0007 notifications+watched_shops, 0008 etsy_write (extension_tokens, review_outreach, listing_backups), 0009 title_experiments.

## Before running in production
1. Apply migrations 0006–0009 to the real D1 (`wrangler d1 migrations apply herorank`).
2. Real secrets are referenced in `wrangler.jsonc` bindings (BETTER_AUTH_SECRET, ETSY_*, STRIPE keys, IMAGE_MODEL, ETSY_WRITE_ENABLED) — already set in the deployed worker; not stored here.
3. `npm install` then `npm run build` (uses `--legacy-peer-deps`; better-sqlite3 native build is dev-only and can be skipped with `--ignore-scripts`).
4. Verify the reconstructed result-area UIs against the live site and adjust where they differ.

## Verification done
- `npm run build` ✅ (exit 0) — 43 pages, all API routers.
- API route parity vs deployed bundle: **0 missing, 0 extra** (55/55).
- Page parity: **43/43**.
- `src/` type-checks clean (svelte-check errors are all in generated `.svelte-kit/output`, not source).

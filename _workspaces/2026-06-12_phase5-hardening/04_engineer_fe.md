# Engineer FE — Phase 5 Hardening (Task #25)

Branch `migrate-sveltekit`. Scope: A1/A2/A3 (a11y) + C3 (honesty labels). FE `+page.svelte` only — no backend/middleware/wrangler touched.

## Warning count

| Stage | Errors | a11y Warnings |
|---|---|---|
| Before | 0 | **16** (spec estimated 23; codebase evolved post Phase 3/4) |
| After  | 0 | **0** |

`npm run check` → `0 ERRORS 0 WARNINGS`. `npx vitest run` → `PASS (183) FAIL (0)`.

Note: spec assumed 23 warnings across files like signup/rank-check/buyer-check/video-generator. Actual `npm run check` showed 16, and several spec-named files had already been fixed in prior phases. I fixed the real 16.

## A1 — label-without-for (6 fixed)

Added `for={id}` on `<label>` + matching `id` on the control. Layout/Tailwind/logic unchanged.

| File | Line (pre) | Control | id used |
|---|---|---|---|
| tools/etsy/description-generator/+page.svelte | 48 | textarea | `desc-product-details` |
| tools/etsy/niche-finder/+page.svelte | 59 | input | `niche-query` |
| tools/etsy/profit-calculator/+page.svelte | 79 | input (in `#each`) | `profit-${field.key}` (unique per row) |
| tools/etsy/title-generator/+page.svelte | 50 | textarea | `title-description` |
| tools/etsy/shop-analyzer/+page.svelte | 278 | input | `shop-analyzer-input` |
| tools/keyword-generator/+page.svelte | 63 | input | `keyword-seed` |

## A2 — href="#" (10 fixed)

| File | Line(s) (pre) | Element | Fix |
|---|---|---|---|
| +page.svelte (landing footer) | 184–188 | About/Blog/Terms/Privacy/Contact | → `<button type="button" disabled aria-disabled title="Coming soon">` styled identical (no destination yet) |
| (dashboard)/dashboard/+page.svelte | 93 | "Link a shop →" | real nav → `href="/settings/connections"` |
| tools/etsy/listing-analyzer/+page.svelte | 143 | shop-name link | no shop-url field → plain `<span>` (was non-functional) |
| tools/etsy/listing-analyzer/+page.svelte | 163 | "View on Etsy" | `{#if listing.url}` → real external `href={listing.url}` + `target=_blank rel=noopener noreferrer` |
| tools/etsy/shop-analyzer/+page.svelte | 390 | "View on Etsy" | real `href={https://www.etsy.com/shop/${shop.name}}` (deterministic public shop URL) + noopener |
| auth/login/+page.svelte | 91 | "Forgot password?" | no reset flow wired → `<button disabled aria-disabled title="Password reset coming soon">` styled identical |

Rationale per spec: real action with no handler → disabled `<button>` (keyboard-focusable, honest); real nav → real href; placeholder → aria-disabled button. No visual change (button reset to transparent/border-0/p-0 to match link styling).

## A3 — a11y sweep

- `<img>` without `alt` across `src/routes` + `src/lib/components`: **none** (product/shop image placeholders are CSS gradient `<div>`s, not images).
- Decorative lucide icons: inline SVG, no a11y_img warnings raised; EstimatedBadge's `Info` icon already `aria-hidden`.
- focus-visible preserved: all converted controls are native `<button>` (default focus ring); no `outline:none` added.
- `npm run check` re-run after every change → reached 0 warnings with no new ones introduced.

## C3 — Honesty labels audit (7 etsy tool pages)

| Page | Estimate fields rendered | Badge before | Action |
|---|---|---|---|
| listing-analyzer | est. sales, est. revenue, audit scores | yes (5×) — `totalReviews`/rating are REAL Etsy figures, correctly un-badged | none |
| shop-analyzer | est. sales, est. revenue, monthly est., per-stat est. | yes (8×) — `percentile` & listing `views` confirmed REMOVED (not faked) | none |
| best-sellers | estimated rankings, est. sales | yes (3×); honest `!loaded` empty state + manual "Load best sellers" (no charge-on-mount) | none |
| etsy-trends | Demand Index (est.) — replaces fabricated `searches` | yes (3×); honest `!loaded` empty + manual "Load trends" | none |
| buyer-check | reputation risk (est.) — SHOP reputation, not buyer lookup | yes; `totalReviews` real, un-badged | none |
| rank-check | current rank (est.) | yes (2×) | none |
| **tag-generator** | **competition (Level), search volume (Level)** | **NO badge — GAP** | **FIXED: added `<EstimatedBadge label="Est.">` to both column headers + import** |

C3 findings:
- **1 gap found + fixed:** tag-generator "Competition" and "Search Volume" columns are estimated qualitative levels with no EstimatedBadge. Added badges to both `<th>` headers with provenance tooltips.
- No fabricated fields remain: grep for `views`/`searches`/`percentile`/`searchVolume` confirms `views` & `percentile` removed in Phase 3/4 (documented in-file comments citing PM Q7); `searches` absolute replaced by `demandIndex` (0–100).
- best-sellers & etsy-trends are honest-empty before load (gated behind manual button, no `$effect` charge-on-mount).

## Issues / flags for PM

- **Spec count mismatch:** spec said 23 a11y warnings; actual was 16. Not a problem — all real warnings fixed, 0 remain. Spec-named files (signup, rank-check, buyer-check, video-generator) had no warnings (fixed earlier).
- **Transient cross-engineer errors:** mid-task, `npm run check` briefly showed 2 ERRORS in `src/lib/server/services/billingService.ts:298/304` (`onInvoicePaid`/`onSubscriptionUpdated` arg arity) — Engineer SEC's in-flight S1 (webhook→invoice.paid) work, NOT my scope. Resolved by SEC before my final check (final run: 0 errors). Flagging so PM knows the shared-file serialization held.
- **tag-generator listings tab** still mock ("Listings data will be available when connected to the Etsy API") — already honestly labelled, left as-is (blocked-on-key).
- **Forgot-password / footer links** are disabled placeholders — when those flows/pages land, swap `<button disabled>` → real `<a href>`.

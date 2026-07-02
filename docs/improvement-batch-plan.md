# Tool Improvement Batch — full audit + plan (living spec)

> Status: **gathering for a single coordinated batch.** Audit of all ~35 tools done 2026-06-22.
> No tool is a dead stub — every one has a working real backend. The problems are: (1) data-integrity
> lies (hardcoded/fake numbers shown as real), (2) dead/fake UI controls, (3) missing key actions
> (copy/save/export/apply), (4) the live-Etsy-key gap, and (5) a few genuinely deferred features.
> Build alongside the Video Maker full build (`docs/video-maker-plan.md`).

## Decisions needed from the user (external / can't self-serve)
1. **Live Etsy API key** — `provider.ts:23-28` falls back to a MOCK client (static fixtures) when no
   key is set. This is the single highest-leverage fix: it makes rank-check, rank-tracker,
   title-experiment, compare, and all research tools return REAL data instead of cloned fixtures.
   → set `ETSY_API_KEY`/`ETSY_OAUTH_CLIENT_ID` in prod. (Code already supports it.)
2. ~~`ETSY_WRITE_ENABLED`~~ → **DECIDED 2026-06-22: complete the code in this batch** (see "Build item E"
   below). Only the LIVE write to Etsy still needs Etsy's `listings_w` API approval (external, Etsy's
   side) — but the full code path, flag, and UX are to be finished and testable now.
3. **Bundled music licensing** for Video Maker → **DECIDED 2026-06-22: CC0 default** (bundle 3–4 CC0
   tracks + allow upload).

## Build item E — Complete the listing-editor write feature (user-requested, in this batch)
The write/restore code exists but is gated by `ETSY_WRITE_ENABLED` (default off) and is missing UX
polish. To FULLY finish it:
- Wire end-to-end and make testable: enable the flag in dev (`.dev.vars`) so Save/Restore work locally;
  keep prod gated until Etsy `listings_w` approval (the only external blocker).
- Request the `listings_w` OAuth scope when the flag is on (`etsyWriteClient.ts:44-47`).
- **Diff/preview before push** — show old → new title/tags/description so the seller confirms before
  writing to Etsy.
- **Snapshot + restore preview** — before a PUT, snapshot the listing (already coded `myShop.ts:407-417`);
  add a restore-preview UI so the seller sees what "Restore" will bring back.
- **Edit-time SEO guidance** — title length vs 140, tag quality (count/dupes), keyword coverage hints
  inline while editing.
- Verify write + restore against a real connected shop once the flag is on; handle Etsy write errors
  (rate limit, rejected fields) with clear messages.

---

## TIER 1 — Data-integrity / honesty (actively misleading sellers) — DO FIRST
These show fabricated numbers as if real, or claim real data that's actually AI-estimated.

1. **dashboard** (`dashboard/+page.svelte:162-235`) — hardcoded "85% Grade B+ / 148 Active / 12 Needs
   Keywords / 3 Warnings", hardcoded "Etsy API Linked", fictional Recent Activity. Wire to real
   `shopConnected` (layout loader) + `/api/me/history` + a real shop-health summary (reuse shop-audit
   scoring). Highest-visibility lie in the app.
2. **tag-generator** (`tag-generator/+page.svelte:16,234-287`) — remove `MOCK_TREND`, fake
   "12,847 competition", "8,320/mo", fake price range "$1.91/$21.40/$1,260", and the permanently-dead
   "Listings" tab. Keep the (honest, badged) AI tag list.
3. **keyword-generator** (`keyword-generator/+page.svelte:66,117-141`) — page claims "competition
   comes from real live Etsy listings" but ALL fields are AI-estimated (`keywordSource.ts`). Either
   wire real Etsy result counts for competition OR fix the copy; extend the estimated badge to cover
   competition; fix always-green trend color (color by sign).
4. **keyword-bulk** (`keyword-bulk/+page.svelte:130-143`) — add the missing "estimated" badge
   (consistency), show dropped seeds, surface `cpc` (currently dropped), fix always-green trend.
5. **"Sample data" badge** — global indicator when `ETSY_API_KEY` is unset and tools are serving mock
   fixtures, so nothing silently looks real. (Until #1 above is set in prod.)

## TIER 2 — Dead / fake controls & broken links (look functional, aren't)
6. **shop-analyzer** — wire or remove: Share button (no onclick `:402`), "Load more listings" (`:592`),
   listings sort `<select>` (`:523`), review filter pills (`:643`); FIX the `?shop=` deep-link (it
   ignores the query param, breaking the watchlist→analyzer handoff).
7. **watchlist** — Analyze CTA → `shop-analyzer?shop=` (broken by #6); add note-editing UI; add a
   per-shop signal (rating/listing count) and real change-tracking (it currently "watches" nothing).
8. **best-sellers** — remove fake sortable headers (cursor-pointer, no onclick `:153-173`); build or
   hide the stubbed "Listings" toggle (`:143`); show `stale`/`cached` "as of" indicator.
9. **seasonal-calendar** — entirely hardcoded static array with year-stamped "2025" themes (stale on
   2026), no backend. De-hardcode: auto-roll year, drop year-stamped labels, back with trend data or
   clearly flag editorial.
10. **settings/extension** (`:138`) — "Download the extension folder" has no download link/button →
    dead-end. Add the actual download (or Chrome Web Store link) + "extension connected" status.
11. **my-shop** (`:107,157-171`) — dead multi-shop `<select>` (`shops` never populated). Add a
    `/api/my-shop/shops` fetch or remove the selector.
12. **listing-studio** — thin 48-line redirect hub to image-studio + listing-builder. Either make it a
    real combined studio or fold it away.

## TIER 3 — Missing key actions / weak value (works but thin)
13. **profit-calculator** — add Etsy **Offsite Ads (12/15%)** + **regulatory operating fee** (UK/EU),
    a zero/empty state, Save/Export, and fix the cosmetic currency selector (doesn't convert).
14. **chatgpt-optimizer** — add copy / export / "apply to listing" for the optimized output (currently
    display-only); add a loading skeleton for the up-to-45s call; optional regenerate.
15. **compare** — add export/CSV; deeper insight (tag-overlap/gap between listings, "this is yours");
    (clone data resolves with live key #1).
16. **rank-check / rank-tracker / title-experiment** — replace hand-rolled charts (hardcoded
    `maxRank=40`) with a real rank-axis; add a trend column/sparkline to rank-tracker; overlay
    title-experiment change-markers on the chart with before/after deltas.
17. **listing-analyzer** — show real shop name (not "Shop {id}"); add a "fix it" hand-off to the editor.
18. **keyword-lists** — add write-error states (mutations silently no-op on failure); add an
    "add to list" path FROM the keyword/tag tools so the metric columns actually populate.
19. **history** — surface the saved `summary`; let a row re-open the actual past result (not the blank tool).
20. **rankhero-ai** — give the assistant real shop/listing context (or soften the "ask about your shop"
    framing); add conversation persistence + a stop/cancel button.
21. **image-studio** — clarify remove-bg is best-effort; consider an upload-your-photo edit path
    (sellers want to clean their own photos, not only generate synthetic ones).

## Cross-cutting (apply across the batch)
- Trend/delta values colored by SIGN (not always green) — keyword-generator, keyword-bulk.
- Consistent "AI estimated" badging wherever metrics are model-derived.
- Copy / Save-to-list / Export / Apply-to-listing actions are missing on most output tools.
- Loading skeletons for long (LLM/Etsy) calls instead of a lone spinner.
- A reusable rank/trend chart component to replace the 3 hand-rolled ones.

## TRACK U — UI / Visual design polish (user-requested 2026-06-22)
Problem the user raised: tools (esp. list/table pages) read as "all white with nothing separating or
distinguishing the rows/cards." Root cause = the design system is intentionally *flat-by-default*
(whisper-soft shadows `rgba …0.06`, faint border `#e3e8e6`, white cards on a barely-different off-white
`#f7f9f8`). We evolve it for more separation + life **without breaking** the brand (Starbucks-green,
the No-Cream Rule — no beige/cream allowed; warmth stays in green + gold).

### U1 — Three dominant colors (FINALIZED)
A disciplined 3-pole brand system (neutrals = system, not "dominant"):
1. **🟢 Green** — `#006241` Storefront (brand, h1, deep) + `#00754A` Apron (CTA/action/active). Identity.
2. **🟡 Gold** — `#cba258` — **promoted from ceremony-only to the standing accent**: highlights,
   "winner/best" markers, premium moments, one chart/stat accent. Stops the UI reading mono-green.
3. **⚫ Ink** — `#1e2a26` text + `#33433d` ink-green on tints + `#0c110f` dark sidebar rail. Grounding.
   Neutrals (canvas/surface/border) support these but are not "dominant."

### U2 — Separation system (fix the "all-white" flatness)
- Deepen canvas so white cards pop: `--bg-page` `#f7f9f8` → ~`#f1f5f3` (more green chroma, still No-Cream).
- More defined border: `--border` `#e3e8e6` → ~`#dbe4df`.
- New token **`--bg-tint`** ≈ `#eef4f1` (faint green) for: table header rows, **alternating list rows
  (zebra)**, section panels, empty-state surfaces — adds the green warmth DESIGN.md wants AND separates rows.
- Cards: always a 1px border + `shadow-card`; result/primary cards step up to `shadow-md`.
- List rows (`.entry`): real dividers + zebra `--bg-tint` + stronger hover (lift + border).
- Optional 2px **left-accent bar** (green/gold) on featured cards; small category color dots on listings.
- Section headers (`.section-kicker`): a short green accent rule for scannability.

### U3 — Animations (appropriate, not gimmicky; `prefers-reduced-motion` already respected globally)
- Apply existing `stagger-children` fade-in to all result lists/grids (currently underused).
- `hover-lift` on cards + list rows.
- **Skeleton shimmer** loader component for async waits — replaces lone spinners (also satisfies the
  Tier-3 "loading skeletons" item across LLM/Etsy tools).
- Count-up on metric numbers; animated score/progress-bar width fills.
- Tab/panel crossfade; toast/badge entrance.

### U4 — Where it applies
Cross-cutting, but prioritize the list/table-heavy pages the user is reacting to: dashboard, shop-audit,
shop-analyzer, best-sellers, etsy-trends, keyword/tag results, history, rank-tracker. Roll the tokens +
shared components (`Skeleton`, zebra list, stat-card) once in `app.css` + components, then adopt per page.

> This TRACK runs alongside TIER 1–3 (do the data-integrity fixes and the UI polish together per page so
> each tool is touched once). Update `DESIGN.md` color/elevation sections to match U1/U2 when built.

## TRACK F — Foundation & polish (user-selected 2026-06-22; Mobile/responsive emphasized)

### F1 — Mobile / responsive overhaul (TOP PRIORITY — user emphasized)
Etsy sellers are heavily mobile. Current state: a `Dock.svelte` mobile bottom-nav exists and a few
pages have scattered `sm:/md:/lg:` classes, but it's inconsistent. Do a real responsive pass:
- **Tables → cards on mobile** — the list/table-heavy tools (shop-analyzer, best-sellers, etsy-trends,
  keyword/tag results, rank-tracker, compare, shop-audit, history) overflow on phones; collapse each
  row to a stacked card or enable proper horizontal scroll with sticky first column.
- **Charts** — the hand-rolled bar/rank charts must reflow / stay legible at ≤375px.
- **Two-pane tool layout** (`ToolPageLayout` controls|work) — stack vertically on mobile, controls first,
  with a sticky "Generate/Run" action bar.
- **Forms & inputs** — full-width, ≥44px touch targets, proper mobile keyboards (`inputmode`).
- **Nav** — verify Dock covers all groups; sidebar drawer behaves; no horizontal page scroll anywhere.
- **Modals / video preview / image studio** — fit small viewports.
- Audit at 320 / 375 / 768 breakpoints; fix overflow, tap targets, font scaling. Tie visual changes to
  TRACK U tokens so it's one coherent pass per page.

### F2 — Custom error pages
- Add `src/routes/+error.svelte` (and per-section if useful): on-brand 404 + 500 with a clear recovery
  path (back to dashboard, search, report). Currently users hit SvelteKit's default unstyled error page.

### F3 — Accessibility (a11y) pass
- Keyboard navigation + visible focus rings on all interactive elements; ARIA roles/labels on custom
  controls (tabs, toggles, dialogs); color-contrast check (pairs with TRACK U deepened palette — keep
  ≥4.5:1); `aria-live` for async results/toasts; alt text on generated images.

### F4 — Settings hub + GDPR
- A coherent `/settings` hub (account, connections, extension, notification prefs, billing link) instead
  of scattered settings pages.
- **Danger zone:** delete account (cascade) + **export my data** (the user's listings/history/keyword
  lists as JSON/CSV) — basic GDPR/CCPA hygiene.

> Deferred (considered, NOT in this batch per user): Growth & revenue (onboarding, low-credit warning,
> transactional email), Trust & brand (estimation explainers, badge consistency), Product depth
> (export-everywhere, cross-tool "Send to…", manual refresh, watchlist alerts, bulk ops). Revisit later.

## KEEP as-is (solid)
notifications, review-requests, settings/connections (verify multi-shop disconnect id), buyer-check,
niche-finder, tag-gap, etsy-trends, ads-calculator, description-generator, title-generator,
listing-builder, image-studio (core).

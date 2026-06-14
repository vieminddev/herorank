# Engineer E — Phase 4 FE wiring report (Task #19)

Branch `migrate-sveltekit`. Svelte 5 runes. `npm run check`: 0 errors in my files
(the 9 remaining errors are Engineer F's `src/lib/server/services/jobs/rankTrack.ts` +
`src/lib/server/jobs/scheduled.ts` — not in my ownership, pre-existing/incomplete).

No `02_contract_F.md` / `02_contract_H.md` existed → wired to the BA spec shapes (§5.1).
Backend not built yet; all wiring is mock-first and degrades gracefully.

## Files

| File | Change |
|---|---|
| `src/lib/tools-client.ts` | ADDED helpers; `callTool`/`streamChat` untouched |
| `src/routes/(dashboard)/tools/etsy/rank-check/+page.svelte` | "Track this listing" button + plan gate |
| `src/routes/(dashboard)/tools/etsy/shop-analyzer/+page.svelte` | "Deep analysis" async mode + polling |
| `src/routes/(dashboard)/tools/etsy/video-generator/+page.svelte` | rewritten → Coming-soon + waitlist |
| `src/routes/(dashboard)/settings/connections/+page.svelte` | NEW — Connect/Disconnect Etsy shop |
| `src/routes/(dashboard)/settings/connections/+page.server.ts` | NEW — read connected_shops (defensive) |
| `src/lib/components/layout/Header.svelte` | **SHARED (C's file)** — added 1 nav link (flagged below) |

## tools-client.ts (added, old funcs untouched)

- `trackListing({listing,keyword})` → `callTool('track-listing', …)`. 403 `TRACK_LIMIT` and
  409 (already tracking) surface as typed failures the page handles. FREE → no credit display.
- `untrackListing(id)` → DELETE `/api/tools/tracked-listings/:id`.
- `getRankHistory(listing, keyword)` → GET `/api/tools/rank-history` (typed; points allow
  `rank: null` = outside top 100). Exported for future use; the rank-check chart currently
  reads history off the tool result, so this is not yet bound to the chart.
- `startShopAnalysis(shop)` → POST `/api/tools/shop-analysis-deep` (returns `{jobId,status}`,
  202, no deduct).
- `pollJob<T>(jobId, {onTick,intervalMs,signal})` → polls GET `/:jobId` every 3s until
  `done|failed` or abort. Returns terminal envelope; exposes `paymentFailed`.
- `joinVideoWaitlist(email)` → POST `/api/waitlist/video-generator`.
- All reuse the existing 401→`/auth/login` redirect + typed `ToolResult` failure shape.
  `catch (e: unknown)` with `e instanceof DOMException` for the abort path.

## rank-check page

- Reads `plan` from `page.data.subscription.plan` (dashboard layout data). `canTrack = plan !== 'free'`.
- New "Track this listing" card after the stats grid:
  - free plan → "Upgrade to track" CTA → `/pricing` (no doomed request).
  - paid → "Track this listing" button → `trackListing`. Success → "Tracking" (green check).
    403 `TRACK_LIMIT` → warning notice + Upgrade CTA. 409 → treated as already-tracked.
  - copy states it's automatic + no credits (BR-P4-TRACK-02).
- Track state resets on a new search. Chart/result shape unchanged (no faked data added).

## shop-analyzer page

- Quick analysis (Phase 3) UNCHANGED and still the default.
- Mode toggle "Quick analysis / Deep analysis (8 credits)" above the search.
- Deep path: `startShopAnalysis` → set `loading` for the whole async lifetime → `pollJob`
  with `onTick` driving a live status banner (queued / running / deferred labels).
  - `done` + result → renders into the SAME `ShopResult` UI + a "Deep analysis — full shop"
    badge; `invalidateAll()` refreshes the credits badge (deduct happens on success).
  - failed → "didn't complete… you haven't been charged" banner (BR-P4-01).
  - `paymentFailed` → "ready but couldn't deduct… top up" banner + CTA (BA §2.4).
  - 402 at enqueue → upgrade CTA; 404 → not-found. AbortController cancels poll on destroy.

## video-generator page — CONFIRMED no fake video

- Fully rewritten. REMOVED: `setTimeout(2000)` fake generate, "Generate Video" button,
  "Video Preview" placeholder, **"Download MP4" button**, "Preview" button, the `generated`
  state. `grep` confirms only comment mentions of "Download" remain — zero functional output.
- NEW: honest "Coming soon / In development" banner + waitlist email form
  (`joinVideoWaitlist`, prefilled from `page.data.user.email`, client-side email validation,
  success/error states). No render backend, no R2, no credits (BR-P4-VIDEO-01).
- Upload + settings UI kept VISIBLE but `opacity-60 pointer-events-none aria-hidden` as a
  "Preview" of the upcoming feature.

## settings/connections (NEW route)

- `+page.server.ts`: reads `connected_shops` for the user (read-only D1, mirrors
  `+layout.server.ts`). Table may not exist yet → wrapped in try/catch → "not connected".
- `+page.svelte`: three states —
  - not connected → "Connect your Etsy shop" `<a href="/api/connect/etsy/start">` (real nav,
    not fetch — the start route must set server state + 302).
  - connected → shop name + connected/last-calibrated dates + Disconnect (DELETE
    `/api/connect/etsy`, then `invalidateAll`).
  - `?error=` from callback → error banner; `?connected=1` → success banner.
- Required honesty/privacy copy: read-only scopes, never write, only AGGREGATE per-category
  rates stored, raw sales never shared (BR-P4-OAUTH-04).

## Shared-file change (FLAGGED)

- **`src/lib/components/layout/Header.svelte` (Engineer C owns).** Added exactly ONE nav item
  ("Connections" → `/settings/connections`) to the existing account dropdown, plus the `Plug`
  lucide import. This was the only way to make the new settings page reachable without
  touching Sidebar (owned by others, per task). No other Header logic changed. **C should be
  aware / confirm.** If C prefers it elsewhere, the link is trivially movable.

## Self-Review findings

- Display / overflow: OK — Track card and connections use flex-col→sm:flex-row; deep banners
  wrap; preview blocks use overflow-x-auto.
- States: OK — loading/success/error/empty covered on all paths (track, deep poll, waitlist,
  disconnect, connection load).
- Edge cases: OK — null rank points typed; missing tables → graceful; abort on unmount;
  email validation; 402/403/404/409 all handled.
- Consistency: OK — reused `card`, `--navy`/`--teal` tokens, `LoaderCircle`/`CircleAlert`,
  EstimatedBadge conventions, `/pricing` upgrade pattern.
- Accessibility: `role="status"/"alert"`, `aria-live`, `aria-label` on mode group, labeled
  inputs. Pre-existing a11y warnings in shop-analyzer (label#278, href#390 "View on Etsy")
  are NOT mine.
- Alpine bindings: N/A (no Alpine in this stack).
- `catch (e: unknown)`: used in pollJob; no `any`.
- Build-pass-alone: not relied on — wiring is mock-shaped per BA; visual verify pending a
  running backend (backend incomplete).

## Concerns / risks

- Deep-analysis result shape: BA §2 doesn't fully spec the deep payload; I render it into the
  existing `ShopResult` shape (deep = fuller version). If F returns a different shape, the
  render block needs adjustment — coordinate when F's contract lands.
- `getRankHistory` exported but not yet bound to the chart (chart reads tool result history).
  Available for F/the chart owner if they want tracked-listing history fetched separately.
- Endpoint paths assumed from BA §5.1 (no F/H contracts). Verify on integration.

## Memory

Updated `herorank_tool_pages.md` with the Phase 4 async-job (poll) + plan-gate + waitlist
patterns. No other new universal patterns.

## TaskUpdate #19

No TaskUpdate tool available in this session — please mark #19 in_progress→completed for E.

# TODO

## ✅ DONE (2026-06-29 TDD build — verify before re-doing)
- **Create-draft backend**: `etsyWriteClient` (getShippingProfiles / listOwnListingsRaw /
  createDraftListing / uploadListingImage) + routes (`/listing/create-meta`, `/listing/taxonomy-search`,
  `/listing/create`) + `TaxonomyResolver.search`. Tested: `tests/etsyWriteClient.test.ts`,
  `tests/taxonomySearch.test.ts`.
- **Listing Editor prefill enabler**: reads `?listing` (auto-load) + `?title`/`?addTags`/`?description`
  (merge, held as pendingPrefill for manual loads too) + "suggested change applied" banner.
- **Builder step-4 "Create draft on Etsy"** form (price/qty/category quick-pick+search/shipping).
- **Hand-offs DONE**: Tag Gap → "Add these tags" (`?addTags`); Listing Optimizer → "Edit this listing";
  Image Studio → "Turn into a video"; Shop Audit → "Edit on Etsy".
- **VieRank Assistant**: real Stop (AbortController in streamChat → no charge) + `(stopped)` marker;
  input → auto-grow textarea (Enter send / Shift+Enter newline); Copy per reply; markdown lists
  (`renderChatMarkdown`, tested in `tests/sanitize.test.ts`).
- **Slideshow Maker**: project persistence (settings/captions/logo/outro → localStorage + restore
  banner). Media polish: progress "taking longer" past ETA (Image+Video); Video Studio describe-mode
  honesty line.

### Still deferred (lower value — not yet built)
- Hand-offs: AI Shopping Optimizer → "Apply to listing"/"Create draft"; Compare → "Improve weaker";
  Title Experiment → "Change title in Editor"; Generators → "Use in Builder" (needs Builder prefill).
- Slideshow royalty-free music library (pending licensing).

---


## Feature: "Create draft listing on Etsy" from Listing Builder

Build a one-click hand-off that turns a finished Listing Builder output (title / tags / description /
AI images) into a **DRAFT** listing on the seller's connected Etsy shop. Draft (not active) so the
user reviews + publishes on Etsy.

Status: **designed + proven via manual API test, NOT yet built in the app.**

### Already done (do NOT redo)
- **OAuth x-api-key bug FIXED** (deployed `b7d2155e`): write/OAuth calls now use `etsyOAuthApiKey(env)`
  = `ETSY_OAUTH_CLIENT_ID:ETSY_OAUTH_CLIENT_SECRET` (app `8mh6…`), not the scraping `ETSY_API_KEY`.
  This unblocks ALL own-shop writes. See memory `etsy-oauth-apikey-fix`.
- **create-draft proven working**: manual test created real draft `listing_id=4529356883` on
  ClayFettiStudio. `createDraftListing` succeeds with x-api-key = OAuth keystring:secret + Bearer
  (DB token, refreshed) + the required fields below.

### Key architecture (keep)
- **Write / OAuth** (own-shop, create/edit listing): `ETSY_OAUTH_CLIENT_ID` = `8mh6…` + secret.
- **Read / scraping** (search, getListing, cron): `ETSY_API_KEYS` pool — untouched. (Commercial API
  will replace the read pool later; user will send it.)

### Etsy required fields for createDraftListing (physical) — VERIFIED
`quantity, title, description, price, who_made, when_made, taxonomy_id, shipping_profile_id,
readiness_state_id`. The last two are mandatory and obscure:
- `shipping_profile_id` → from `GET /shops/{shopId}/shipping-profiles`.
- `readiness_state_id` → copy from an existing active listing of the shop (raw listing JSON has it).
Endpoint: `POST /v3/application/shops/{shopId}/listings` (form-encoded). Returns `{listing_id, state:'draft', url}`.
Images upload separately: `POST /shops/{shopId}/listings/{listingId}/images` (multipart `image` + `rank`).

### UX decisions (from user)
- **Category (taxonomy_id)**: COMBINE quick-pick + search — show the shop's existing categories
  (distinct taxonomy from its listings, with names) as quick chips, AND a search box over Etsy's full
  seller taxonomy leaves.
- **Shipping profile**: **dropdown** of the shop's profiles (user picks).
- **readiness_state_id**: auto-resolve server-side (copy from an existing listing) — NOT user-facing.
- Create as **DRAFT** only; return "Finish on Etsy →" link.

### Build plan
**Backend — `src/lib/server/services/etsy/etsyWriteClient.ts`** (add to the returned client):
- `getShippingProfiles(shopId)` → `GET /shops/{id}/shipping-profiles` → `[{id, title}]`.
- `createDraftListing({shopId,title,description,tags,price,quantity,taxonomyId,shippingProfileId,whoMade,whenMade,readinessStateId})`
  → POST form-encoded; throw `etsy create-listing <status>` on !ok (reuse `writeError` mapping).
- `uploadListingImage(shopId, listingId, bytes, rank)` → multipart POST (do NOT set Content-Type;
  let fetch set the boundary). Best-effort.
- Helper to resolve a default `readiness_state_id` (fetch one active listing's raw JSON) — also reuse
  for a default taxonomy quick-pick.

**Backend — routes `src/lib/server/api/routes/myShop.ts`** (write-gated like update/restore):
- `GET /listing/create-meta` → `{ shippingProfiles:[{id,title}], shopCategories:[{taxonomyId,name}], readinessStateId }`
  (shopCategories = distinct taxonomy_id+name from the shop's listings via `listOwnListings` +
  `loadTaxonomyResolver`/name lookup).
- `GET /taxonomy/search?q=` → search Etsy seller taxonomy leaves (load `getSellerTaxonomyNodes` once,
  cache in KV — `TTL.taxonomy` 30d already exists; reuse `taxonomyResolver`), filter by `q`, return
  top ~20 `{taxonomyId, name, path}`.
- `POST /listing/create` → validate body (zod), `connected(c)`, `createDraftListing(...)`, then
  best-effort upload the builder's images (fetch each `/api/tools/image-jobs/{id}/asset` bytes →
  `uploadListingImage`). Return `{listingId, url, state}`. Map 503 WRITE_PENDING / ETSY_REAUTH like
  the update route. Charge 0 credits (or decide) — it's an OAuth feature, not a metered tool.

**Frontend — `src/routes/(dashboard)/tools/etsy/listing-builder/+page.svelte`** (step 4):
- A "Create draft on Etsy" button that opens an inline form:
  - price (number), quantity (number, default 1)
  - category: quick chips (from create-meta.shopCategories) + a search input (calls /taxonomy/search)
  - shipping profile: `<select>` from create-meta.shippingProfiles
- Gate: needs connected shop + write-enabled (reuse the editor's `notConnected` / `ETSY_REAUTH`
  reconnect pattern; if `!writeEnabled` show "awaiting write approval").
- On submit → POST /api/my-shop/listing/create → show "Draft created · Finish on Etsy →" (link to
  returned `url`). Pass the builder's `chosenTitle`, `chosenTags`, `description`, and image job ids.
- Builder must keep the image **job ids** (currently it only keeps asset URLs) so the create route can
  re-fetch bytes server-side — adjust `generateImages` usage to also surface ids, or pass the asset
  URLs and have the server fetch them.

### Gotchas
- x-api-key MUST be the OAuth app key (already fixed via `etsyOAuthApiKey`).
- Multipart image upload: don't set Content-Type manually.
- Token refresh rotates — `connected()` already persists; don't add a second concurrent refresh path.
- High-stakes write: keep it DRAFT, confirm step, clear error→reconnect path.

### Cleanup
- Delete the test draft **listing_id 4529356883** on ClayFettiStudio (created during the API test).

---

## Feature: "Edit listing" / "Create draft" hand-offs from other tools

Build alongside create-draft — they share one **enabler**. Today almost no tool hands off to editing
a real listing or creating a draft; the only hand-off is Listing Optimizer → the Generators (which
just make more copy to paste). Verified: Listing Editor has NO prefill (manual ID entry only), and
chatgpt-optimizer / tag-gap have no listing hand-off at all.

### Enabler (do FIRST — unlocks all the hand-offs below)
**Listing Editor accepts a hand-off payload** in `listing-editor/+page.svelte`:
- Read `?listing=<id>` on mount → auto-load that listing (currently `idInput` is manual only).
- Optional prefill to MERGE into the loaded listing, applied after load:
  `?title=…` (replace title), `?addTags=a,b,c` (add to current tags, dedup, cap 13),
  `?description=…` (replace description). Show a "suggested change applied — review & save" hint.
- Ownership: Editor already 404s "not in your shop" gracefully → hand-offs can pass any listing id;
  if it's a competitor's, the user gets the clear message (and should use Create-draft instead).

### Tier 1 hand-offs (best fit)
- **Listing Optimizer** (`listing-analyzer`): add **"Edit this listing on Etsy →"** → Editor with
  `?listing=<analyzed id>`. (Keep the existing → Generator links; add this for editing the real one.)
- **AI Shopping Optimizer** (`chatgpt-optimizer`): add **"Apply to a listing →"** (Editor with
  `?title=…&description=…`) AND/OR **"Create draft on Etsy"** (it produces a full optimized listing).
- **Tag Gap**: add **"Add these tags →"** → Editor with `?listing=<id>&addTags=<missing tags>`
  (most actionable — it literally found the tags you're missing).

### Tier 2 hand-offs
- **Shop Audit**: per row, add **"Edit on Etsy →"** → Editor `?listing=<id>` (these are YOUR listings,
  so editing is always valid). Already has "Fix this → Optimizer".
- **Compare Listings**: **"Improve the weaker listing →"** → Editor for the lower-SEO row.
- **Title Experiment**: **"Change the title in Editor →"** `?listing=<id>` (it measures title changes
  but offers no place to make one).

### Create-draft hand-offs (depend on the create-draft feature above)
- **Listing Builder** → the step-4 "Create draft on Etsy" (already the main plan).
- **AI Shopping Optimizer** → "Create draft" (full optimized listing).
- **Title / Tag / Description Generators** → **"Use in Listing Builder →"** (assemble there) rather
  than a draft from a single field.

### Notes
- Tools that analyze ANY listing (analyzer / optimizer / tag-gap / compare) → "Apply/Edit" only valid
  for the user's OWN listing; for competitors, surface "Create draft inspired by this" instead.
- All write hand-offs depend on the OAuth write path (now fixed, `etsyOAuthApiKey`) + write-enabled.

---

## Media tools (AI Image Studio / AI Video Studio / Slideshow Maker) — improvements

DMMT review verdict: all three are already strong (numbered steps, cost-on-button, queue ETA,
resume-on-reload for Image+Video, Etsy-compliance checklists, retry/refund, history). Items below are
improvements, not flow bugs.

### Functional (higher value)
1. **Cross-tool + listing hand-offs** (ties to the create-draft / edit sections above):
   - **AI Image Studio** (`image-studio/+page.svelte`, set-result block ~line 678): add **"Turn into a
     video →"** (deep-link to Video Studio / Slideshow — Video Studio already reads Image Studio
     IndexedDB history, so the heroes appear there) and, once create-draft exists, **"Add to a listing
     →"** (upload the set via `uploadListingImage`).
   - **AI Video Studio** + **Slideshow Maker** finished-video state: **"Add this video to a listing →"**
     (Etsy listing video upload) once create-draft/edit supports it.
2. **Slideshow Maker — persist the project** (`video-generator/+page.svelte`): currently a reload
   LOSES everything (photos + captions + logo + music + all settings). Image/Video Studio persist;
   Slideshow does not → inconsistent + painful (most controls of any tool). Save the **config + caption
   rows + outro/logo settings** to localStorage (photos are local blobs → can't persist bytes; on
   return, restore settings and prompt "re-add your photos"). Auto-restore on mount.
3. **Slideshow Maker — built-in royalty-free music library** (pending music licensing, see
   `tool-improvement-batch` memory): today the user must upload a track they have rights to. Add a small
   CC0 picker once licensing is sorted.

### UI/UX polish
4. **Indeterminate progress past the estimate** (Image `heroElapsed/90`, Video `elapsed/120`): the bar
   sticks at 95% if it runs long. After the ETA passes, switch to an indeterminate/"still working…"
   state instead of a frozen bar.
5. **Slideshow Maker control density**: the pacing block (seconds / transition / kenBurns / aspect / bg
   = 5 controls) is always expanded even though a **preset** already sets them. Collapse it under a
   "Customize / Advanced" `<details>` (presets cover the common case) to reduce first-look load.
6. **Video Studio "Describe" mode honesty**: a describe-mode video is an **AI-imagined** product, not
   the seller's real photo — but the tool copy says "we keep the same product on screen" (only true in
   Hero mode). Add one line clarifying this when `sourceMode === "describe"`.
7. **Consistent history messaging**: three different stores (Image = IndexedDB/device, Video =
   account/server, Slideshow = none). At minimum align the wording so users know where each output is
   saved; ideally give Slideshow a saved-projects list too (after #2).

---

## VieRank Assistant (`rankhero-ai`) — fixes

Logic review (`rankhero-ai/+page.svelte` + `llm-tools.ts` `/rankhero-ai/chat`):
- **Correct**: pre-check LLM config (503) + balance (402) BEFORE opening the stream; deduct ONLY after a
  clean `[DONE]`; idempotent spend ref `spend:rankhero-ai:{requestId}` (no double-charge); history sent
  to the LLM excludes the static greeting + error bubbles; XSS-safe `**bold**` rendering.
- **BUG — "Stop" doesn't cancel and still charges.** `streamChat()` (tools-client.ts:476) does NOT pass
  an `AbortSignal`; `stopStreaming()` only sets `stopRequested` (halts client rendering). The server
  stream runs to completion → the 2-credit deduct fires after `[DONE]`. So Stop is cosmetic: the AI keeps
  generating and the user is still charged. The code comment even admits "the turn may already have been
  charged." FIX: add an `AbortController` per send → `streamChat({ signal })` → `stopStreaming()` aborts
  it (cancels the fetch so CF cancels the upstream → `completed` stays false → no deduct, or cancel the
  reader). Either truly cancel, or relabel honestly.

UI/UX improvements:
1. **Single-line `<input>` → auto-grow `<textarea>`** (input at +page.svelte:239): users paste long
   titles / tags / descriptions; a 1-line box hides them and kills newlines. Enter = send,
   Shift+Enter = newline. HIGH.
2. **Copy button on assistant messages**: it's an SEO tool — the output (13 tags, a rewritten title) is
   meant to be pasted into Etsy. Add a per-bubble Copy. HIGH.
3. **Real Stop** — see the BUG above (logic + UX). HIGH.
4. **Render simple markdown lists** (`-` / `•` / `1.`), not just `**bold**`: the model replies are
   list-heavy; today only bold is formatted (`renderBold` in sanitize.ts) — extend it (still escape
   HTML first). MEDIUM.
5. **"(stopped)" marker** on a partially-streamed message after Stop. LOW.
6. **Hand-off** (ties to the hand-off section): on an assistant reply with tags/title, offer
   "Use in Listing Editor / Builder →". LOW–MEDIUM.

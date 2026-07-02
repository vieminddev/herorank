# VieRank Browser Extension (Chrome / Edge, Manifest V3)

Overlays VieRank's listing **SEO score**, **tag count**, **favorites/reviews**, and **keyword
competition** directly on Etsy listing & search pages — with every estimated number honestly
labeled **"Est."** (VieRank's positioning vs. competitors that pass estimates off as real data).

## What it shows
- **Etsy listing page** (`/listing/123…`) → floating panel: SEO score /100 (Est.), tags x/13,
  favorites, reviews, and a link to the full Listing Optimizer.
- **Etsy search** (`/search?q=…`) → keyword competition (low/med/high) + live listing count + a link
  to Keyword research.
- **Etsy shop page** (`/shop/Name`) → a link into VieRank Shop Research for that shop.

Talks to the existing `/api/ext/*` endpoints (bearer-authed with the user's `vrk_…` token; the token
lives only in the service worker, never in the Etsy page).

## Install (unpacked — dev / beta)
1. Build/serve VieRank (e.g. `npm run dev` → http://localhost:3001) **or** use your deployed URL.
2. Chrome/Edge → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this
   `extension/` folder.
3. Click the VieRank icon → paste your token from **VieRank → Settings → Browser Extension**. If your
   VieRank isn't on `http://localhost:3001`, set the URL under **Advanced** (an https URL will prompt
   for permission to read that host).
4. Open any Etsy listing or search — the panel appears bottom-right.

## Package for the Chrome Web Store
`npm run ext:zip` (from the app root) produces `extension-dist/vierank-extension.zip`. Before store
submission: tighten `host_permissions` to your real production domain (drop the broad
`optional_host_permissions` if not needed) and add store listing assets.

## Files
- `manifest.json` — MV3 manifest (content script on `www.etsy.com`, action popup, storage).
- `background.js` — service worker: stored config (apiBase + token) + authed API fetches.
- `content.js` / `content.css` — Etsy page detection + the overlay panel.
- `popup.html` / `popup.js` / `popup.css` — pairing UI (token + URL) + connection status.
- `icons/` — 16/48/128 PNGs.

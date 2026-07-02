# AI Video Studio — plan (VEO3 / media.viemind.ai)

**Status:** ✅ BUILT & DEPLOYED on herorank (2026-06-26, version a86df12e). **Awaiting 2 changes on
the VEO3 server side** (the user owns `pathveo3`, doing them next) before it works end-to-end — see
"What the VEO3 server still needs" below.

## What was built (herorank side, live)
- **Migration 0016** `video_jobs` (D1) + `repositories/videoJobsRepo.ts`.
- **`services/veo3Service.ts`** — `submitVideo` (POST `/api/queue/video`, 3 auth headers) + `downloadAsset`
  (host-swaps the localhost `downloadUrl` → public `VEO3_SERVER_URL`, download-once → R2).
- **`routes/video.ts`** — `POST /api/tools/video-studio` (auth + `requireCredits('video-studio')`=20),
  `GET /api/tools/video-jobs` (list), `/video-jobs/:id` (status), `/:id/asset` (stream MP4 from R2),
  `/:id/seed?t=token` (token-gated seed image, no cookie — VEO3 fetches it).
- **`routes/webhook-veo3.ts`** — `POST /api/webhook/veo3?token=…` (secret-gated): on completed →
  download MP4 → R2 → mark done; on failure → mark error + **refund 20 credits** (idempotent via
  `claimRefund` + `creditsService.refundCredits`).
- **Frontend** `tools/etsy/video-studio/+page.svelte` — 3-step flow (hero from Image Studio history /
  upload / describe → clip type + aspect + duration → generate → job card polls every 5s, survives leaving
  the page, history strip). Registered in `nav.ts` (Create group). Billed 20 credits/video.
- **Env added** (`env.ts`): `VEO3_SERVER_URL`, `VEO3_API_KEY`, `VEO3_WEBHOOK_SECRET`.

## What the VEO3 server still needs (user, on pathveo3) + herorank deploy config
1. **Accept `config.startImageUrl`** on `POST /api/queue/video` (videoMode `image`): download that URL to
   a temp file, then feed its existing `startFilePath`→`uploadImageIfNeeded`→Google `mediaId` flow.
   herorank sends `startImageUrl = https://vierank.com/api/tools/video-jobs/{id}/seed?t={token}` (public,
   token-gated, returns the hero PNG). This is the ONE essential change for hero→video.
2. **Public reachability of `downloadUrl`** — the webhook's `downloadUrl` is `http://localhost:19774/...`;
   `veo3Service.downloadAsset` already keeps only the PATH and re-points it at `VEO3_SERVER_URL`, so just
   ensure `media.viemind.ai` (the tunnel) exposes `GET /api/media/download/:taskId` publicly with the 3
   auth headers honored. (Status polling not required — we use the webhook.)
3. **Set Workers secrets** on herorank: `VEO3_SERVER_URL=https://media.viemind.ai`, `VEO3_API_KEY=…`,
   `VEO3_WEBHOOK_SECRET=…` (any strong string; embedded in callbackUrl + verified). Until set, the tool
   returns 503 VIDEO_UNAVAILABLE (no credit spent). VEO3 must be able to POST
   `https://vierank.com/api/webhook/veo3?token=<VEO3_WEBHOOK_SECRET>`.

Aspect note: we send `aspect: 'portrait'|'landscape'` + `duration: '5s'|'8s'`. If VEO3's enum differs,
adjust the mapping in `services/veo3Service.ts` / `routes/video.ts`.

---

## Original design notes (kept for reference)

This feature is the concrete reason to do **Path B** in `veo3-media-provider-plan.md` (VEO3 is async
webhook-only; video is inherently async).

**Goal:** let an Etsy seller turn their **hero photo (from Image Studio)** into ONE short, looping,
Etsy-spec-correct **listing video** with great UX. Image-to-video so the REAL product appears.

Distinct from `video-maker-plan.md` (that's a free client-side slideshow, no AI).

---

## Etsy listing-video rules (official) → product guarantees

Source: Etsy Help "How to Add a Listing Video" + Seller Handbook (verified 2026-06-25).

| Etsy rule | Design consequence |
|---|---|
| **1 video per listing** | Guide the seller to ONE best clip — NOT a set (opposite of Image Studio). |
| **3–15 s; >15 s gets clipped** | Lock output to a safe **5–8 s, seamless loop**. Never exceed 15 s. |
| **No audio** (Etsy mutes uploaded video) | Audio off by default; tell the user "Etsy mutes video — no need for music/voice." Removes licensing worry entirely. |
| **Ideal ≥1080p, 30 fps** | Render/deliver 1080p; "Etsy-ready" badge. |
| **Aspect 2:1 or 1:2** | Only offer **Portrait 1:2 (mobile-first)** or **Landscape 2:1**. No off-spec ratios. |

The "Etsy-ready" badge = honesty USP carried over from Image Studio: a checklist proving the output
meets every spec (3–15 s ✓ · 1080p ✓ · 1:2/2:1 ✓ · no audio ✓).

## Decisions locked (user, 2026-06-25)

1. **Source = hero shot → video** (image-to-video). Primary entry is "use a hero shot from Image
   Studio history." Requires VEO3 img-to-video support (Blocker #2).
2. **Wait UX = job card + persist, come back later.** Submit returns a job; the job is saved
   client-side (IndexedDB, reuse `imageStudioHistory.ts` pattern) AND server-side (D1). The user can
   leave the page and the finished clip is waiting when they return. No credit wasted on navigation.

## UX flow (3 steps, mirrors the Image Studio hero pattern)

1. **Source** — pick a hero shot from Image Studio history (1 click), or upload / describe. img2video
   keeps the actual product + the set's background colour, so video matches the photo set.
2. **One clip type** (from Etsy's "3 video types shoppers love" + 360):
   - Turntable / 360 spin · In-use / lifestyle · Detail glide · Reveal (zoom-out).
   - Then: aspect (Portrait 1:2 / Landscape 2:1) + duration (5 s / 8 s). Audio off (locked).
3. **Generate → smart wait.** Submit → **job card** ("Rendering… ~Xs") with progress; user may leave.
   On done: **muted looping preview** (exactly how Etsy shows it) + **Download MP4 1080p** + the
   Etsy-ready checklist. History strip lists past videos (reopen/download, no extra credits).

## VEO3 video API — CONFIRMED (from `C:\DATA\viemid\pathveo3\docs`, 2026-06-25)

Authoritative source: `pathveo3/docs/queue_api_webhook.md`, `backend_integration_guide.md`,
`media_generation_integration_guide.md`, `google_api_integration.md`. VEO3 = an **Electron local
server on `localhost:19774`** that drives Google Labs (Veo 3) headlessly. `media.viemind.ai` is its
public tunnel (Cloudflare Tunnel/ngrok per the docs).

**Submit video task:** `POST /api/queue/video`
```json
{ "externalTaskId": "<unique>", "prompt": "<text>",
  "config": { "videoMode": "text|image|startend|charsync", "quality": "relaxed",
              "aspect": "landscape", "duration": "8s",
              "startFilePath": "C:\\abs\\path\\seed.png", "endFilePath": "...", "charSyncFilePaths": ["..."] },
  "callbackUrl": "https://vierank.com/api/webhook/veo3" }
```
→ `{ success:true, taskId, status:"queued" }`. (`503` = Flow Studio reloading; `409` = dup taskId.)

- **videoMode (Blocker #2 RESOLVED — img2video EXISTS):** `text` (prompt only), **`image` = image-to-video
  (seed via `startFilePath` or `mediaId`)** → Google `veo_3_1_i2v...batchAsyncGenerateVideoStartImage`,
  `startend` (interpolate two frames), `charsync` (reference images for character consistency).
- **duration:** string like `"8s"`. **quality:** e.g. `"relaxed"`. **aspect:** lowercase
  `"landscape"` shown; image API uses `IMAGE_ASPECT_RATIO_{LANDSCAPE|PORTRAIT|SQUARE}` (16:9 / 9:16 /
  1:1) — video portrait/square enum to confirm by trying `"portrait"`/`"square"`.
- **Status polling EXISTS** (contradicts earlier tdplaster probe): `GET /api/queue/status/:taskId` →
  `{status:"queued|processing|completed|failed", localPath, downloadUrl}`. So we can poll OR webhook.
- **Webhook:** VEO3 POSTs `callbackUrl` `{taskId,status:"completed"|"failed",localPath,downloadUrl,error}`.
- **Download:** `GET /api/media/download/:taskId` streams the MP4 — **DOWNLOAD-ONCE: the file is
  garbage-collected from RAM/disk immediately after one successful stream.** Backend MUST fetch → R2 once.
- Processing takes ~15 s – 2 min (Google + captcha solving).

### ⚠️ Cloud-integration gaps (VEO3 is localhost-first; herorank is Cloudflare)
These are the REAL remaining decisions (all on the user's own `pathveo3` server, which they control):
1. **Seed image transport for img2video.** The queue API takes `startFilePath` = an **absolute path on
   the VEO3 Windows machine** (the server then base64-uploads it to Google for a `mediaId`). A Cloudflare
   Worker CANNOT place a file there. → Need the user to add a small field to `/api/queue/video` on their
   server, e.g. **`startImageUrl`** (server downloads it) or **`startImageBase64`** (server writes a temp
   file), then its existing auto-upload (`/v1/flow/uploadImage` → `mediaId`) runs unchanged. herorank would
   pass the hero as an R2 public URL or base64. **Without this, "hero→video" can't work from the cloud** —
   only text→video would.
2. **`downloadUrl` host.** Webhook/status return `downloadUrl = http://localhost:19774/...`, unreachable
   from Cloudflare. Confirm the public tunnel rewrites it to `https://media.viemind.ai/...`, OR herorank
   swaps the host before GET. Also confirm `media.viemind.ai` publicly exposes `/api/media/download/:id`
   (+ `/api/queue/status/:id` if we poll) — an earlier probe saw GET routes 404 on the public host.
3. **Output aspect for Etsy.** Veo 3 emits 16:9 / 9:16 (and maybe 1:1). Etsy ideal is 2:1 or 1:2 but it
   accepts and crops other ratios. The high-level pipeline uses FFmpeg to crop 1:1 @1080 — **Workers can't
   run FFmpeg.** Decision: ship Veo's native portrait 9:16 (mobile-first, Etsy-fine) as-is, OR have the
   VEO3/SvelteKit side return a pre-cropped clip. Recommend ship 9:16 native; revisit if Etsy rejects.

## Architecture (Path B — async job pipeline)

Reuses the structure already specced in `veo3-media-provider-plan.md` §"Path B":

1. **Migration** — D1 `video_jobs`: `id, user_id, status('pending'|'done'|'error'), prompt,
   clip_type, aspect, duration, source_image_ref, error_msg, created_at, updated_at`. Result MP4 in R2
   (binding `ARCHIVE`), key derived from job id.
2. **Submit route** `POST /api/tools/video-studio` — create job row; submit task to VEO3
   (`/api/queue/video` — shape TBD, Blocker #1) with `callbackUrl=https://vierank.com/api/webhook/veo3`;
   return `{status:'pending', jobId}`. **Spend credits on submit** (video is expensive — price TBD,
   suggest ≥15 credits/clip; add `'video-studio'` to `toolCosts.ts`). Reuse the `requireCredits`
   `units` resolver if billing scales with duration.
3. **Webhook** `POST /api/webhook/veo3` — already specced for images; extend to route video tasks:
   verify key, `GET downloadUrl`, `ARCHIVE.put('video-jobs/{id}.mp4', bytes)`, mark done/error.
   **Refund on failure.**
4. **Status route** `GET /api/tools/video-jobs/:id` → `{status, clipType, aspect, url, error}`.
5. **Asset route** `GET /api/tools/video-jobs/:id/asset` → owner-scoped `ARCHIVE.get` → stream MP4.
6. **Client** (`tools/etsy/video-studio/+page.svelte`): submit → poll status (~3–5 s, ~5 min cap);
   persist job to IndexedDB so a returning user resumes; render muted `<video loop autoplay muted>`.

## Blockers — now resolved at API level; see "Cloud-integration gaps" above

The two original blockers (video endpoint shape, img2video support) are **CONFIRMED resolved** by the
pathveo3 docs (see the CONFIRMED section above): endpoint = `POST /api/queue/video`; img2video EXISTS
(`videoMode:"image"`). What remains are the 3 **Cloud-integration gaps** above — all small additions on
the user's own VEO3 server (seed-image URL/base64 field, public `downloadUrl`/route exposure, output
aspect). The biggest one is #1: a Cloudflare Worker can't pass a local `startFilePath`, so hero→video
needs a `startImageUrl`/`startImageBase64` field added to `/api/queue/video`.

## Related
- `docs/veo3-media-provider-plan.md` — VEO3 API + Path A/B (this feature = Path B).
- `docs/video-maker-plan.md` — separate free client-side slideshow (not AI).
- Image Studio hero→reference + client history (the patterns this reuses): the tool page +
  `src/lib/imageStudioHistory.ts`.

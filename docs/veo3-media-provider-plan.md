# Second media provider — media.viemind.ai (VEO3) integration plan

**Status:** PAUSED (2026-06-25) — awaiting confirmation on whether the VEO3 app can serve
**synchronous** requests. That answer decides which of the two builds below we do.

**Goal:** add `media.viemind.ai` (the VEO3 server) as a SECOND media provider alongside
`vtoken.viemind.ai`. The system auto-selects and **rotates evenly** between the two providers per
request — the customer never chooses. Scope **this round = images only** (Image Studio); video later.

Reference implementation to copy the API from: `C:\DATA\viemid\tdplaster`.

---

## Providers compared

| | vtoken.viemind.ai (current) | media.viemind.ai (VEO3, new) |
|---|---|---|
| Style | **Synchronous**, OpenAI-compatible | **Asynchronous**, queue + webhook |
| Image endpoint | `POST {LLM_BASE_URL}/images/generations` | `POST /api/queue/image` |
| Returns | image (b64) in the response | `{success:true}`; image arrives later via webhook |
| Auth | `Authorization: Bearer <LLM_API_KEY>` | 3 headers: `x-api-key`, `api-key`, `Authorization: Bearer` (all = VEO3 key) |
| herorank usage | `llmService.generateImage` in `src/lib/server/api/routes/image.ts` | not integrated yet |

## VEO3 API (learned from tdplaster)

Sources: `tdplaster/.env.local`, `tdplaster/src/lib/server/jobs.ts` (`sendToVeo3`),
`tdplaster/src/routes/api/webhook/veo3/+server.ts`, `tdplaster/src/lib/server/backendFetch.ts`.

- **Config:** `VEO3_SERVER_URL=https://media.viemind.ai`, `VEO3_API_KEY=Viemind456SG!!`,
  `VEO3_CALLBACK_URL` (public URL that receives results).
- **Auth headers (all three, same key):**
  `{ 'x-api-key': KEY, 'api-key': KEY, 'Authorization': 'Bearer '+KEY }`.
- **Submit image task (async):** `POST {server}/api/queue/image`
  ```json
  { "externalTaskId": "<jobId>_<idx>",
    "prompt": "<text>",
    "config": { "model": "NARWHAL", "aspect": "IMAGE_ASPECT_RATIO_SQUARE", "quantity": 1,
                "referenceImageName": "<google-media-id, optional>" },
    "callbackUrl": "https://vierank.com/api/webhook/veo3" }
  ```
  Response `{ success: true }`. tdplaster uses `quantity:1` and submits one task per image.
- **img-to-img reference (optional, skip for text→image):** `POST {server}/api/eval-main`
  (body is text/plain JS) uploads a reference image to Google Labs, then you poll a returned
  `global.<var>` for the Google Media ID, then pass it as `config.referenceImageName`.
- **Result delivery = WEBHOOK ONLY.** VEO3 POSTs `callbackUrl` with
  `{ taskId, status: 'completed' | 'failed', downloadUrl, error }`. Then `GET downloadUrl`
  (same 3 auth headers) returns the media bytes. `jobId = taskId.split('_')[0]`.
- **No polling endpoint.** Probed 2026-06-25: every GET (`/`, `/health`, `/v1/models`,
  `/api/queue/status`, `/api/task/*`, …) → 404. Only POST routes are registered.
- **Runtime note:** tdplaster is Node (custom `backendFetch` over `node:http`). herorank is
  Cloudflare Workers — use the global `fetch`, not that helper.

## Decisions locked (user, 2026-06-25)

1. media.viemind.ai today = **VEO3 queue+webhook only** (no sync endpoint).
2. Scope this round = **images only** (Image Studio). Video is a later round.
3. Rotation = **rotate evenly** between the two providers (round-robin), not primary/fallback.
   → Because VEO3 is async, this forces Image Studio to become **job-based / asynchronous**.

---

## Path A — IF VEO3 gains a synchronous endpoint (preferred, trivial)

If the VEO3 app is changed to return the image in the response (ideally OpenAI-compatible
`POST /v1/images/generations`, or any documented sync shape):

- Add a **sync provider pool** (like the Etsy key pool): each entry = `{ baseUrl, apiKey, headerStyle }`.
- `image.ts` round-robins across the pool (KV cursor or random), calls the chosen provider
  synchronously, returns images as today. **No webhook, no D1 job table, no R2, no client polling.**
- New env: `IMAGE_PROVIDERS` (or `MEDIA_BASE_URL_2` + `MEDIA_API_KEY_2`) added to `Env`
  in `src/lib/server/env.ts`.
- Need from the user: the sync endpoint path + request/response shape (OpenAI-compatible or custom).

## Path B — IF VEO3 stays async-only (full build)

Image Studio becomes job-based:

1. **Migration 0016** — D1 `image_jobs`:
   `id, user_id, status('pending'|'done'|'error'), provider('vtoken'|'veo3'), mode, prompt, size, n,
   received, error_msg, created_at, updated_at` (+ result stored in R2, keys derived from id/idx).
2. **Submit route** (`POST /api/tools/image-studio`): pick provider via KV round-robin cursor.
   - `vtoken` → generate synchronously (current path), store result, mark `done`, return inline.
   - `veo3` → create job row, submit N tasks to `/api/queue/image` with
     `callbackUrl=https://vierank.com/api/webhook/veo3`, return `{status:'pending', jobId}`.
   - Spend the 5 credits on submit (as today).
3. **Webhook route** `POST /api/webhook/veo3` — verify key, parse `{taskId,status,downloadUrl,error}`,
   download media, `ARCHIVE.put('image-jobs/{jobId}/{idx}.png', bytes)` (R2 binding `ARCHIVE` exists),
   bump `received`; when all N in (or any failure) mark `done`/`error`. **Refund 5 credits on failure**
   (creditsService `grantPlanCredits`/a refund ledger entry with a stable ref).
4. **Status route** `GET /api/tools/image-jobs/:id` → `{status, mode, label, images:[{url}], error}`
   where url = `/api/tools/image-jobs/:id/asset/:idx`.
5. **Asset route** `GET /api/tools/image-jobs/:id/asset/:idx` → owner-scoped `ARCHIVE.get` → stream bytes.
6. **Client** (`tools/etsy/image-studio/+page.svelte`): submit → if `done` render inline (b64); if
   `pending` poll the status route (~3s, ~3min cap) → render (`srcOf` already handles b64 | url).
7. New env/secrets in `Env`: `VEO3_SERVER_URL`, `VEO3_API_KEY`, `VEO3_CALLBACK_URL`.

## Open questions for the user (when resuming)

1. Can the VEO3 app serve a **synchronous** image request? (yes → Path A, no → Path B)
2. If yes: exact path + request/response shape — OpenAI-compatible (`/v1/images/generations`) or custom?
3. Video (later round): does VEO3 use `/api/queue/video` (or a `model`/`aspect` for video)? Confirm shape.

## Hero → reference (img-to-image) — already live on vtoken (2026-06-25)

Image Studio now supports reusing a generated **hero shot as a reference** so the same product appears
across the set. Implemented on the SYNC vtoken provider: `llmService.generateImage` accepts
`referenceImage` and sends it as `images:[<raw base64>]`; the route adds a "keep the same product"
clause. When VEO3 is wired in, map this same `referenceImage` to VEO3's `config.referenceImageName`
(via the `/api/eval-main` Google-Labs upload flow) so the feature works on both providers.

## Related

- Deploy procedure (MUST `npm run build` before `wrangler deploy`): `docs/deployment.md`.
- Image Studio current behaviour (6 Etsy shot modes, client upscale→2000px + aspect crop): the tool page.
- Slideshow Video Maker (client-side, not AI video): `docs/video-maker-plan.md`.

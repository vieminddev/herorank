# Video Maker — Full Build Plan (living spec)

> Status: **APPROVED scope = everything (Phase 1+2+3)**, but **on hold** — the user is gathering
> additional requirements to implement in one batch. Do NOT start building until they say go.
> This doc is the spec; extend the "Open questions / additions" section as new requirements arrive.

## Where we are now (already shipped)

The Video Maker (`/tools/video-generator`) is a **working client-side tool** — no server render,
no R2, no credits charged.

- `src/lib/video/renderSlideshow.ts` — render engine: canvas slideshow + crossfade, aspect
  1:1/4:5/16:9, **WebCodecs (H.264) → MP4** primary, **MediaRecorder → WebM** fallback, capability
  detection, progress callback.
- `src/routes/(dashboard)/tools/video-generator/+page.svelte` — upload ≤10 photos (drag/drop,
  ▲▼ reorder, remove), settings (seconds/slide, fade/none, aspect), Generate + progress, `<video>`
  preview, Download MP4.
- `package.json` — added `mp4-muxer` (install needs `--legacy-peer-deps`, pre-existing peer conflict).
- Verified end-to-end in real Chrome: 3 photos → MP4 1080×1080, 7.2s, plays, downloads.

## Benchmark — RankHero's Video Generator (what we're matching/beating)

Source: `crawl-data/video-generator.md`. Their feature set:
1. Live canvas preview — every change instant, no re-render to see result.
2. Drag-to-reorder slides (+ ▲▼ on mobile).
3. Style presets: Custom, Classic, Scroll Stopper, Short & Snappy, Smooth & Cinematic, Dynamic,
   Clean & Minimal, Slow & Dreamy.
4. Logo overlay: upload (PNG/SVG/WebP/JPG), 9 positions (TL/TC/TR/ML/C/MR/BL/BC/BR), opacity.
5. Aspect ratios: 16:9, 1:1 (recommended), 9:16 (vertical, for IG/TikTok reuse).
6. Transitions & Ken Burns-style zoom (subtle, configurable).
7. Etsy-ready export (duration/format/resolution to spec).
8. Smart export checks — flag wrong aspect / too long, one-click fix ("Fix duration", "Switch to 1:1").
9. Playback controls + keyboard shortcuts (Space play/pause, ←/→ scrub, Ctrl+Enter export).
10. Clear all; 30 MB max per image; MP4 note ("for QuickTime, use Safari").

## Target architecture (the refactor that unlocks everything)

Split today's monolithic `renderSlideshow` into three layers so **preview and export share one
compositor** (WYSIWYG):

```
Scene (data model)  ──►  Compositor: drawFrameAt(ctx, scene, t)  ──►  Exporters
                                                                      ├─ WebCodecs → MP4 (+ audio)
                                                                      └─ MediaRecorder → WebM
                                          └────────────────────────►  Live preview player (canvas + rAF)
```

### Scene model (single source of truth for preview + export)
```ts
interface Scene {
  slides: { src: Blob; durationSec: number; kenBurns?: { fromScale: number; toScale: number; pan?: 'lr'|'rl'|'up'|'down' } }[];
  transition: { type: 'fade'|'slide'|'zoom'|'dissolve'|'none'; seconds: number };
  aspect: '1:1'|'4:5'|'16:9'|'9:16';
  fps: number;
  background: string;                 // letterbox fill color (instead of black bars)
  logo?: { src: Blob; pos: Pos9; opacity: number; scale: number };
  captions?: { text: string; pos: Pos9; font: string; color: string; bg?: string; scope: 'global'|number; animate?: boolean }[];
  outro?: { text: string; shopName?: string; bg: string; durationSec: number };
  audio?: { src: Blob; gainDb: number; fadeSec: number };
  preset: string;
}
```

## Feature specs

### Phase 1 — Parity with RankHero
1. **Live preview engine (FOUNDATION)** — a `<canvas>` player component driven by a rAF loop calling
   `drawFrameAt(ctx, scene, t)`; play/pause; scrub slider bound to `t`; keyboard (Space, ←/→ step,
   Ctrl+Enter export). Decode each image to `ImageBitmap` once and cache. Export reuses the exact
   same compositor → preview == output. *Effort: high. Everything below renders through it.*
2. **Style presets** (8, matching RankHero names) — each preset is a `Partial<Scene>` setting
   duration/transition/zoom/easing; "Custom" unlocks manual controls. *Effort: low.*
3. **Ken Burns + transitions** — per-slide scale/translate animation in the compositor; transition
   types fade/slide(L/R/U/D)/zoom/dissolve/none. *Effort: medium.*
4. **Aspect 9:16 + background fill** — add 9:16 (1080×1920); option to fill letterbox with a chosen
   color instead of black. *Effort: low.*
5. **Smart export checks** — validate against Etsy listing-video spec (confirm exact numbers, see
   open questions): format MP4/H.264, recommended ≤ ~15s, min resolution. Flag issues + one-click
   fixes ("Trim to 15s", "Switch to 1:1"). *Effort: low–medium.*
6. **Quality-of-life** — Clear all, replace image, raise per-image limit (→ 30 MB), downscale large
   images on import to keep memory flat. *Effort: low.*

### Phase 2 — Brand / AI (beats RankHero)
7. **Logo overlay** — upload (PNG/WebP/JPG; SVG rasterized via Image→canvas), 9-position grid,
   opacity + scale; drawn last on every frame. *Effort: medium.*
8. **Text / caption overlays** — title/price/CTA text; font, color, optional pill background,
   9-position, per-slide or global, optional fade-in. *Effort: medium.*
9. **AI captions (unique — uses our LLM gateway)** — generate short, punchy on-video captions / CTA
   from the listing description via the existing LLM service. User picks/edits. New route
   `/api/tools/video-captions` (reuse `llmFromEnv` + fast model). Decide credit cost (open question).
   *Effort: medium.*

### Phase 3 — Stretch
10. **Background music** — hardest piece. WebCodecs `AudioEncoder` (AAC `mp4a.40.2`) + mp4-muxer
    audio track. Decode uploaded audio with `AudioContext.decodeAudioData`, resample, encode, mux
    with video. Fade in/out, gain. Fallback when AudioEncoder unsupported: combine
    `canvas.captureStream()` + an `<audio>` `captureStream()` into one MediaStream for the
    MediaRecorder path (WebM). Degrade to silent + notice if neither works. *Effort: high.*
11. **Outro / CTA slide** — generated end card: shop name + CTA on a colored bg, optional logo.
    *Effort: low–medium.*

## Technical risks & decisions
- **Audio mux** is the main risk — isolate it so it can't block Phase 1/2. Detect `AudioEncoder`
  support; degrade gracefully.
- **SVG logo** → rasterize to bitmap before drawing.
- **Performance** — cache `ImageBitmap`s; bound encoder queue (already done); downscale on import.
- **Browser support** — MP4 path needs WebCodecs (Chrome/Edge/Safari 16.4+); WebM fallback elsewhere;
  clear unsupported message for very old browsers (already in place).
- **No new server cost** except the single AI-caption LLM call.

## Build order (when greenlit)
Phase 1: live-preview engine → presets → Ken Burns/transitions → 9:16/background → export checks → QoL.
Phase 2: logo → text overlays → AI captions.
Phase 3: background music → outro slide.

## Decisions (finalized 2026-06-22 — chosen for Etsy sellers, to beat competitors)
- **Aspects:** 1:1 (Etsy-recommended, default), 4:5 (Etsy portrait), 9:16 (IG/TikTok/Reels reuse), 16:9.
- **Etsy spec target:** H.264 MP4, long edge ≥1080px, **5–15s recommended**; smart-check warns <5s
  or >15s with one-click "Trim to 15s"; hard cap 60s. (WebM only as fallback for old browsers.)
- **Presets (8):** Classic, Scroll Stopper, Short & Snappy, Smooth & Cinematic, Dynamic,
  Clean & Minimal, Slow & Dreamy, Custom — each tunes duration/transition/zoom/easing for Etsy.
- **Ken Burns:** subtle zoom on by default for Cinematic/Dreamy/Classic; off for Minimal.
- **Background music:** **CONFIRMED by user 2026-06-22 — CC0 default.** Bundle 3–4 CC0 tracks in
  `static/` + allow upload. Mux via WebCodecs AudioEncoder; degrade to silent + notice where
  unsupported.
- **AI captions:** **costs 1 credit** per generation (it's an LLM call); the render itself stays free.
- **Fonts:** ship 2–3 bundled (a clean sans + a display serif) for captions/outro; no external font CDN.
- **Limits:** up to **15 images**, 30 MB each (downscaled to target res on import); total video ≤60s.
- **Waitlist:** the generic `/api/waitlist/:tool` route + table + test are now superseded for this tool;
  **keep** as generic infra for any future "coming soon" tool (harmless), but it's no longer wired here.

## Open questions / additions (user may still add before we build)
- [ ] **More features the user is collecting** — add here.

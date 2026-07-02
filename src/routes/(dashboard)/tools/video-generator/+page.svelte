<script lang="ts">
  // Video Maker — builds an Etsy-ready slideshow video from product photos ENTIRELY in the browser.
  // The live preview and the exporter share ONE compositor (drawFrameAt over a Scene), so what you
  // see is what you download. Free to use; only the optional AI-caption helper costs 1 credit.
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import PreviewPlayer from "$lib/components/video/PreviewPlayer.svelte";
  import Pos9Picker from "$lib/components/video/Pos9Picker.svelte";
  import {
    Video, Upload, Image as ImageIcon, Download, LoaderCircle, CircleAlert, Check,
    Trash2, ArrowUp, ArrowDown, Film, Sparkles, Music, Type, Wand2, Square,
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import {
    renderScene, isVideoExportSupported, type RenderPhase,
  } from "$lib/video/renderSlideshow";
  import type { Scene, Aspect, TransitionType, Pos9, CaptionOverlay } from "$lib/video/scene";
  import { PRESETS, getPreset, kenBurnsForSlide } from "$lib/video/presets";
  import { runExportChecks, applyFix, type ExportCheck } from "$lib/video/exportChecks";
  import { downscaleOnImport, rasterizeLogo } from "$lib/video/importImage";
  import { generateVideoCaptions } from "$lib/tools-client";

  type Photo = { id: number; file: File; src: Blob; url: string };

  const MAX_PHOTOS = 15;
  const MAX_BYTES = 30 * 1024 * 1024;

  // --- core state ---
  let photos = $state<Photo[]>([]);
  let nextId = 0;

  let presetId = $state("classic");
  let secondsPerSlide = $state(3);
  let transition = $state<TransitionType>("fade");
  let transitionSeconds = $state(0.6);
  let aspect = $state<Aspect>("1:1");
  let background = $state("#000000");
  let kenBurns = $state(true);

  // --- logo ---
  let logoBlob = $state<Blob | null>(null);
  let logoUrl = $state<string | null>(null);
  let logoPos = $state<Pos9>("br");
  let logoOpacity = $state(0.9);
  let logoScale = $state(0.18);

  // --- captions ---
  type CaptionRow = { id: number; text: string; pos: Pos9; font: string; color: string; bg: string; useBg: boolean; scope: "global" | number };
  let captions = $state<CaptionRow[]>([]);
  let capNextId = 0;
  let captionDesc = $state("");
  let captionLoading = $state(false);
  let captionError = $state<string | null>(null);
  let captionSuggestions = $state<string[]>([]);

  const FONTS = [
    { value: "Inter, system-ui, sans-serif", label: "Sans (Inter)" },
    { value: "Georgia, 'Times New Roman', serif", label: "Serif (Georgia)" },
    { value: "Impact, 'Arial Black', sans-serif", label: "Display (Impact)" },
  ];

  // --- audio ---
  let audioBlob = $state<Blob | null>(null);
  let audioName = $state<string | null>(null);
  let audioGain = $state(-6);

  // --- outro ---
  let outroOn = $state(false);
  let outroText = $state("Shop now");
  let outroShop = $state("");
  let outroBg = $state("#00754A");

  // --- render ---
  let rendering = $state(false);
  let phase = $state<RenderPhase>("preparing");
  let progress = $state(0);
  let error = $state<string | null>(null);
  let result = $state<{ url: string; ext: string; w: number; h: number; dur: number; size: number; audioDropped?: boolean } | null>(null);

  const support = isVideoExportSupported();
  let player = $state<ReturnType<typeof PreviewPlayer> | null>(null);

  // Applying a preset overwrites the pacing controls (Custom leaves them alone).
  function applyPreset(id: string) {
    presetId = id;
    const p = getPreset(id);
    if (id === "custom") return;
    secondsPerSlide = p.secondsPerSlide;
    transition = p.transition;
    transitionSeconds = p.transitionSeconds;
    kenBurns = !!p.kenBurns;
  }

  // Editing a pacing control by hand switches the preset to Custom.
  function toCustom() {
    presetId = "custom";
  }

  // --- the Scene (single source of truth) ---
  const scene = $derived<Scene>(buildScene());

  function buildScene(): Scene {
    const preset = getPreset(presetId);
    return {
      slides: photos.map((ph, i) => ({
        src: ph.src,
        durationSec: secondsPerSlide,
        kenBurns: kenBurns ? (preset.kenBurns ? kenBurnsForSlide(preset, i) : { fromScale: 1, toScale: 1.08, pan: ["in", "lr", "rl"][i % 3] as "in" | "lr" | "rl" }) : undefined,
      })),
      transition: { type: transition, seconds: transitionSeconds, dir: "left" },
      aspect,
      fps: 25,
      background,
      logo: logoBlob ? { src: logoBlob, pos: logoPos, opacity: logoOpacity, scale: logoScale } : undefined,
      captions: captions.length
        ? captions
            .filter((c) => c.text.trim())
            .map<CaptionOverlay>((c) => ({
              text: c.text,
              pos: c.pos,
              font: c.font,
              color: c.color,
              bg: c.useBg ? c.bg : undefined,
              scope: c.scope,
              animate: true,
            }))
        : undefined,
      outro: outroOn ? { text: outroText, shopName: outroShop || undefined, bg: outroBg, durationSec: 2.5, showLogo: !!logoBlob } : undefined,
      audio: audioBlob ? { src: audioBlob, gainDb: audioGain, fadeSec: 0.8 } : undefined,
      preset: presetId,
    };
  }

  const checks = $derived<ExportCheck[]>(photos.length ? runExportChecks(scene, support.mp4) : []);

  // --- uploads ---
  async function addFiles(list: FileList | File[]) {
    error = null;
    let skipped = false;
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_BYTES) { skipped = true; continue; }
      if (photos.length >= MAX_PHOTOS) { skipped = true; break; }
      const src = await downscaleOnImport(f);
      photos = [...photos, { id: nextId++, file: f, src, url: URL.createObjectURL(src) }];
    }
    if (skipped) error = `Some files were skipped — up to ${MAX_PHOTOS} photos, 30MB each.`;
  }

  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files) addFiles(input.files);
    input.value = "";
  }

  let dragOver = $state(false);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  function removePhoto(id: number) {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    photos = photos.filter((x) => x.id !== id);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    photos = next;
  }

  function clearAll() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    clearResult();
  }

  // --- logo upload ---
  async function onLogo(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = "";
    if (!f) return;
    const blob = await rasterizeLogo(f);
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoBlob = blob;
    logoUrl = URL.createObjectURL(blob);
  }
  function removeLogo() {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoBlob = null;
    logoUrl = null;
  }

  // --- audio upload ---
  function onAudio(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = "";
    if (!f) return;
    audioBlob = f;
    audioName = f.name;
  }
  function removeAudio() {
    audioBlob = null;
    audioName = null;
  }

  // --- captions ---
  function addCaption(text = "") {
    captions = [...captions, { id: capNextId++, text, pos: "bc", font: FONTS[0].value, color: "#ffffff", bg: "#00754A", useBg: true, scope: "global" }];
  }
  function removeCaption(id: number) {
    captions = captions.filter((c) => c.id !== id);
  }

  async function suggestCaptions() {
    if (!captionDesc.trim() || captionLoading) return;
    captionLoading = true;
    captionError = null;
    const res = await generateVideoCaptions({ description: captionDesc.trim(), shopName: outroShop || undefined });
    if (res.ok) {
      captionSuggestions = res.data.captions;
      await invalidateAll();
    } else {
      captionError = res.message;
    }
    captionLoading = false;
  }
  function useSuggestion(text: string) {
    addCaption(text);
  }

  // --- smart fixes ---
  function onFix(check: ExportCheck) {
    if (!check.fix) return;
    const next = applyFix(scene, check.fix.id);
    // Pull the relevant changed fields back into the bound controls.
    if (next.aspect !== aspect) aspect = next.aspect;
    if (next.slides[0] && next.slides[0].durationSec !== secondsPerSlide) {
      secondsPerSlide = Math.round(next.slides[0].durationSec * 10) / 10;
      toCustom();
    }
  }

  // --- export ---
  function clearResult() {
    if (result) URL.revokeObjectURL(result.url);
    result = null;
  }

  async function exportVideo() {
    if (!photos.length || rendering || !support.ok) return;
    player?.pause();
    rendering = true;
    error = null;
    progress = 0;
    phase = "preparing";
    clearResult();
    try {
      const res = await renderScene(scene, (p) => { phase = p.phase; progress = p.ratio; });
      result = {
        url: URL.createObjectURL(res.blob), ext: res.ext, w: res.width, h: res.height,
        dur: res.durationSec, size: res.blob.size, audioDropped: res.audioDropped,
      };
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not export the video. Please try again.";
    } finally {
      rendering = false;
    }
  }

  function download() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = `etsy-slideshow.${result.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const iconBtn = "p-1.5 rounded text-text-muted hover:bg-bg-page disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0";
  const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
  const phaseLabel = (p: RenderPhase) => (p === "preparing" ? "Preparing photos…" : p === "finalizing" ? "Finalizing…" : "Encoding video…");

  // --- Project persistence (settings only) -------------------------------
  // Photos / logo / audio are local Blobs and can't be persisted — but losing all the STYLE work
  // (preset, pacing, captions, logo placement, outro) on a reload was the tool's biggest paper-cut.
  // We save the serializable config to localStorage and restore it on return; the seller only has
  // to re-add their photos.
  const PROJECT_KEY = "vierank_slideshow_project";
  let restored = $state(false);
  let hadSavedProject = $state(false);

  onMount(() => {
    try {
      const raw = localStorage.getItem(PROJECT_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.presetId === "string") presetId = s.presetId;
        if (typeof s.secondsPerSlide === "number") secondsPerSlide = s.secondsPerSlide;
        if (typeof s.transition === "string") transition = s.transition;
        if (typeof s.transitionSeconds === "number") transitionSeconds = s.transitionSeconds;
        if (typeof s.aspect === "string") aspect = s.aspect;
        if (typeof s.background === "string") background = s.background;
        if (typeof s.kenBurns === "boolean") kenBurns = s.kenBurns;
        if (typeof s.logoPos === "string") logoPos = s.logoPos;
        if (typeof s.logoOpacity === "number") logoOpacity = s.logoOpacity;
        if (typeof s.logoScale === "number") logoScale = s.logoScale;
        if (Array.isArray(s.captions)) {
          captions = s.captions;
          capNextId = captions.reduce((m, c) => Math.max(m, c.id + 1), 0);
        }
        if (typeof s.audioGain === "number") audioGain = s.audioGain;
        if (typeof s.outroOn === "boolean") outroOn = s.outroOn;
        if (typeof s.outroText === "string") outroText = s.outroText;
        if (typeof s.outroShop === "string") outroShop = s.outroShop;
        if (typeof s.outroBg === "string") outroBg = s.outroBg;
        hadSavedProject = !!(s.captions?.length || s.outroShop || s.outroOn || s.presetId !== "classic");
      }
    } catch {
      /* corrupt/unavailable storage — ignore */
    }
    restored = true;
  });

  $effect(() => {
    // Re-runs whenever any persisted field changes; skip until the initial restore has run.
    const snapshot = {
      presetId, secondsPerSlide, transition, transitionSeconds, aspect, background, kenBurns,
      logoPos, logoOpacity, logoScale, captions, audioGain, outroOn, outroText, outroShop, outroBg,
    };
    if (!restored) return;
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota / private mode — best-effort */
    }
  });

  onDestroy(() => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    if (result) URL.revokeObjectURL(result.url);
  });
</script>

<ToolPageLayout
  title="Slideshow Maker"
  description="Turn your product photos into an Etsy-ready slideshow video — with live preview, brand logo, captions and music. Rendered right in your browser, free to use."
  icon={Video}
>
  {#snippet controls()}
    <div class="flex flex-col gap-5">
      <!-- Upload -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <p class="field-label !mb-0">Product photos</p>
          {#if photos.length}
            <button type="button" class="text-[11px] text-text-muted hover:text-danger" onclick={clearAll}>Clear all</button>
          {/if}
        </div>
        <label
          class="block border border-dashed rounded-md px-4 py-5 text-center cursor-pointer transition-colors {dragOver ? 'border-teal bg-teal/5' : 'border-border hover:border-text-muted'}"
          ondragover={(e) => { e.preventDefault(); dragOver = true; }}
          ondragleave={() => (dragOver = false)}
          ondrop={onDrop}
        >
          <input type="file" accept="image/*" multiple class="sr-only" onchange={onPick} disabled={photos.length >= MAX_PHOTOS} />
          <Upload size={20} class="mx-auto text-text-muted mb-1.5" />
          <p class="text-[0.8125rem] text-text-primary font-medium">Drop photos or click to add</p>
          <p class="field-hint !mt-1">{photos.length}/{MAX_PHOTOS} · PNG, JPG, WEBP up to 30MB</p>
        </label>

        {#if photos.length}
          <ul class="mt-3 flex flex-col gap-2">
            {#each photos as p, i (p.id)}
              <li class="flex items-center gap-2.5">
                <span class="entry-index shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <img src={p.url} alt="" class="w-9 h-9 rounded object-cover border border-border shrink-0" />
                <span class="flex-1 min-w-0 truncate text-[0.8125rem] text-text-secondary">{p.file.name}</span>
                <button type="button" class="{iconBtn} hover:text-text-primary" title="Move up" disabled={i === 0} onclick={() => move(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" class="{iconBtn} hover:text-text-primary" title="Move down" disabled={i === photos.length - 1} onclick={() => move(i, 1)}><ArrowDown size={14} /></button>
                <button type="button" class="{iconBtn} hover:text-danger" title="Remove" onclick={() => removePhoto(p.id)}><Trash2 size={14} /></button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Style presets -->
      <div>
        <p class="field-label">Style</p>
        <div class="grid grid-cols-2 gap-1.5">
          {#each PRESETS as p (p.id)}
            <button
              type="button"
              class="text-left px-2.5 py-2 rounded-md border text-[12px] font-medium transition-colors {presetId === p.id ? 'border-teal bg-teal/5 text-teal' : 'border-border hover:border-text-muted text-text-secondary'}"
              title={p.hint}
              onclick={() => applyPreset(p.id)}
            >{p.name}</button>
          {/each}
        </div>
        <p class="field-hint mt-1.5">{getPreset(presetId).hint}</p>
      </div>

      <!-- Pacing -->
      <div class="grid grid-cols-1 gap-4">
        <div>
          <label class="field-label" for="vm-seconds">Seconds per slide: <span class="text-text-primary font-semibold">{secondsPerSlide}s</span></label>
          <input id="vm-seconds" type="range" min="1" max="6" step="0.5" bind:value={secondsPerSlide} oninput={toCustom} class="w-full accent-teal" />
        </div>
        <div>
          <label class="field-label" for="vm-transition">Transition</label>
          <select id="vm-transition" class="field" bind:value={transition} onchange={toCustom}>
            <option value="fade">Fade</option>
            <option value="dissolve">Dissolve</option>
            <option value="slide">Slide</option>
            <option value="zoom">Zoom</option>
            <option value="none">None (hard cut)</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-[0.8125rem] text-text-secondary cursor-pointer">
          <input type="checkbox" bind:checked={kenBurns} onchange={toCustom} class="accent-teal" />
          Ken Burns zoom / pan
        </label>
        <div>
          <label class="field-label" for="vm-aspect">Aspect ratio</label>
          <select id="vm-aspect" class="field" bind:value={aspect}>
            <option value="1:1">1:1 Square (Etsy recommended)</option>
            <option value="4:5">4:5 Portrait</option>
            <option value="9:16">9:16 Vertical (Reels / TikTok)</option>
            <option value="16:9">16:9 Landscape</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="vm-bg">Background fill</label>
          <div class="flex items-center gap-2">
            <input id="vm-bg" type="color" bind:value={background} class="h-9 w-12 rounded border border-border bg-white cursor-pointer" />
            <span class="text-[0.8125rem] text-text-muted">Fills any letterbox bars instead of black.</span>
          </div>
        </div>
      </div>

      <!-- Logo -->
      <details class="border-t border-border-light pt-4">
        <summary class="field-label !mb-0 cursor-pointer flex items-center gap-2"><ImageIcon size={14} /> Logo overlay</summary>
        <div class="mt-3 flex flex-col gap-3">
          {#if logoUrl}
            <div class="flex items-center gap-2.5">
              <img src={logoUrl} alt="logo" class="w-10 h-10 object-contain border border-border rounded bg-white/50" />
              <span class="flex-1 text-[0.8125rem] text-text-secondary">Logo added</span>
              <button type="button" class="{iconBtn} hover:text-danger" onclick={removeLogo}><Trash2 size={14} /></button>
            </div>
            <div class="flex items-start gap-4">
              <Pos9Picker bind:value={logoPos} />
              <div class="flex-1 flex flex-col gap-2">
                <label class="field-hint">Opacity <input type="range" min="0.1" max="1" step="0.05" bind:value={logoOpacity} class="w-full accent-teal" /></label>
                <label class="field-hint">Size <input type="range" min="0.06" max="0.4" step="0.01" bind:value={logoScale} class="w-full accent-teal" /></label>
              </div>
            </div>
          {:else}
            <label class="btn btn-secondary justify-center cursor-pointer">
              <Upload size={14} /> Upload logo
              <input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" class="sr-only" onchange={onLogo} />
            </label>
            <p class="field-hint">PNG, WebP, JPG or SVG. Drawn on every frame.</p>
          {/if}
        </div>
      </details>

      <!-- Captions -->
      <details class="border-t border-border-light pt-4">
        <summary class="field-label !mb-0 cursor-pointer flex items-center gap-2"><Type size={14} /> Text & captions</summary>
        <div class="mt-3 flex flex-col gap-3">
          {#each captions as c (c.id)}
            <div class="panel-tint p-2.5 flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <input class="field !py-1.5 flex-1" placeholder="Caption text" bind:value={c.text} />
                <button type="button" class="{iconBtn} hover:text-danger" onclick={() => removeCaption(c.id)}><Trash2 size={14} /></button>
              </div>
              <div class="flex items-start gap-3">
                <Pos9Picker bind:value={c.pos} />
                <div class="flex-1 grid grid-cols-2 gap-2">
                  <select class="field !py-1.5 text-[12px]" bind:value={c.font}>
                    {#each FONTS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
                  </select>
                  <select class="field !py-1.5 text-[12px]" bind:value={c.scope}>
                    <option value="global">All slides</option>
                    {#each photos as _p, i (i)}<option value={i}>Slide {i + 1}</option>{/each}
                  </select>
                  <label class="flex items-center gap-1.5 text-[11px] text-text-muted">Text <input type="color" bind:value={c.color} class="h-6 w-7 rounded border border-border" /></label>
                  <label class="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <input type="checkbox" bind:checked={c.useBg} class="accent-teal" /> Pill
                    <input type="color" bind:value={c.bg} class="h-6 w-7 rounded border border-border" disabled={!c.useBg} />
                  </label>
                </div>
              </div>
            </div>
          {/each}
          <button type="button" class="btn btn-secondary justify-center !py-1.5" onclick={() => addCaption()}>+ Add caption</button>

          <!-- AI captions -->
          <div class="panel-tint p-2.5 flex flex-col gap-2">
            <p class="text-[11px] font-semibold text-teal flex items-center gap-1.5"><Sparkles size={12} /> AI captions <span class="text-text-muted font-normal">· 1 credit</span></p>
            <textarea class="field !py-1.5 text-[12px]" rows={2} placeholder="Describe your product…" bind:value={captionDesc}></textarea>
            <button type="button" class="btn btn-secondary justify-center !py-1.5" disabled={!captionDesc.trim() || captionLoading} onclick={suggestCaptions}>
              {#if captionLoading}<LoaderCircle size={13} class="animate-spin" /> Generating…{:else}<Wand2 size={13} /> Suggest captions{/if}
            </button>
            {#if captionError}<p class="text-[11px] text-danger">{captionError}</p>{/if}
            {#if captionSuggestions.length}
              <div class="flex flex-wrap gap-1.5">
                {#each captionSuggestions as s, i (s + "-" + i)}
                  <button type="button" class="text-[11px] px-2 py-1 rounded-full border border-border bg-white hover:border-teal hover:text-teal transition-colors" onclick={() => useSuggestion(s)}>{s}</button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </details>

      <!-- Music -->
      <details class="border-t border-border-light pt-4">
        <summary class="field-label !mb-0 cursor-pointer flex items-center gap-2"><Music size={14} /> Background music</summary>
        <div class="mt-3 flex flex-col gap-3">
          {#if audioName}
            <div class="flex items-center gap-2.5">
              <Music size={16} class="text-text-muted" />
              <span class="flex-1 min-w-0 truncate text-[0.8125rem] text-text-secondary">{audioName}</span>
              <button type="button" class="{iconBtn} hover:text-danger" onclick={removeAudio}><Trash2 size={14} /></button>
            </div>
            <label class="field-hint">Volume <input type="range" min="-24" max="0" step="1" bind:value={audioGain} class="w-full accent-teal" /></label>
            {#if !support.audio}
              <p class="field-hint text-orange-dark">This browser can't encode audio into MP4 — the video will export silent.</p>
            {/if}
          {:else}
            <label class="btn btn-secondary justify-center cursor-pointer">
              <Upload size={14} /> Upload track
              <input type="file" accept="audio/*" class="sr-only" onchange={onAudio} />
            </label>
            <p class="field-hint">Use a CC0 / royalty-free track you have the rights to. Fades in and out automatically.</p>
          {/if}
        </div>
      </details>

      <!-- Outro -->
      <details class="border-t border-border-light pt-4">
        <summary class="field-label !mb-0 cursor-pointer flex items-center gap-2"><Square size={14} /> Outro card</summary>
        <div class="mt-3 flex flex-col gap-3">
          <label class="flex items-center gap-2 text-[0.8125rem] text-text-secondary cursor-pointer">
            <input type="checkbox" bind:checked={outroOn} class="accent-teal" /> Add an end card
          </label>
          {#if outroOn}
            <input class="field !py-1.5" placeholder="Shop name" bind:value={outroShop} />
            <input class="field !py-1.5" placeholder="Call to action (e.g. Shop now)" bind:value={outroText} />
            <label class="flex items-center gap-2 field-hint">Background <input type="color" bind:value={outroBg} class="h-7 w-9 rounded border border-border" /></label>
          {/if}
        </div>
      </details>

      <button
        type="button"
        class="btn btn-primary w-full justify-center"
        disabled={!photos.length || rendering || !support.ok}
        onclick={exportVideo}
      >
        {#if rendering}<LoaderCircle size={14} class="animate-spin" /> Exporting…{:else}<Film size={14} /> Export video{/if}
      </button>
      {#if photos.length}
        <p class="field-hint text-center !-mt-2">{support.mp4 ? "MP4 (H.264)" : "WebM"} · renders locally, photos never leave your device</p>
      {/if}
    </div>
  {/snippet}

  {#if !support.ok}
    <div class="flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div>
        <p class="text-sm text-text-primary font-medium">This browser can't export video</p>
        <p class="text-sm text-text-secondary mt-1">Video Maker renders in your browser using modern web video APIs. Please try the latest Chrome, Edge, or Safari.</p>
      </div>
    </div>
  {:else}
    {#if error}
      <div class="mb-5 flex items-start gap-3 animate-fade-in" role="alert">
        <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
        <p class="text-sm text-text-primary">{error}</p>
      </div>
    {/if}

    {#if !photos.length}
      {#if hadSavedProject}
        <div class="mb-5 flex items-start gap-3 p-3.5 rounded-lg border border-teal/40 bg-teal/5 animate-fade-in">
          <Check size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm font-medium text-text-primary">Your settings were restored</p>
            <p class="text-[0.8125rem] text-text-secondary mt-0.5">Style, captions and outro are back from last time. Re-add your photos to pick up where you left off — photos stay on your device, so they aren't saved.</p>
          </div>
        </div>
      {/if}
      <ToolEmpty icon={Film} title="Your slideshow video will appear here" hint="Add a few product photos on the left. You'll get a live preview you can scrub and play — then export an Etsy-ready video right in your browser.">
        {#snippet preview()}
          <div class="flex gap-2.5">
            {#each [1, 2, 3] as i (i)}
              <div class="flex-1 aspect-square rounded-md bg-bg-page flex items-center justify-center border border-border">
                <ImageIcon size={18} class="text-text-muted" />
              </div>
            {/each}
          </div>
        {/snippet}
      </ToolEmpty>
    {:else}
      <div class="flex flex-col gap-5 animate-fade-in">
        <!-- Live preview -->
        <div class="card p-4 sm:p-5">
          <p class="section-kicker mb-3">Live preview</p>
          <PreviewPlayer bind:this={player} {scene} onExport={exportVideo} />
        </div>

        <!-- Smart export checks -->
        {#if checks.length}
          <div class="flex flex-col gap-2">
            {#each checks as ch, i (ch.message + "-" + i)}
              <div class="flex items-start gap-2.5 text-[0.8125rem] rounded-md p-3 {ch.level === 'warn' ? 'bg-orange/5 border border-orange/30' : 'panel-tint'}">
                <CircleAlert size={15} class="shrink-0 mt-0.5 {ch.level === 'warn' ? 'text-orange-dark' : 'text-text-muted'}" />
                <p class="flex-1 text-text-secondary">{ch.message}</p>
                {#if ch.fix}
                  <button type="button" class="shrink-0 text-[12px] font-semibold text-teal hover:underline" onclick={() => onFix(ch)}>{ch.fix.label}</button>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="flex items-center gap-2 text-[0.8125rem] text-teal">
            <Check size={15} /> Looks Etsy-ready — {scene.aspect}, within the recommended length.
          </div>
        {/if}

        <!-- Render progress / result -->
        {#if rendering}
          <div class="card p-5">
            <h2 class="text-sm font-semibold text-text-primary mb-3">{phaseLabel(phase)}</h2>
            <div class="h-2 rounded-full bg-bg-page overflow-hidden">
              <div class="h-full bg-teal transition-[width] duration-150" style="width: {Math.round(progress * 100)}%"></div>
            </div>
            <p class="entry-meta mt-2">{Math.round(progress * 100)}% · runs locally, your photos never leave your device.</p>
          </div>
        {:else if result}
          <div class="card p-5">
            <p class="section-kicker mb-1">Your video</p>
            <p class="lead text-sm mb-4">{result.w}×{result.h} · {result.dur.toFixed(1)}s · {result.ext.toUpperCase()} · {fmtBytes(result.size)}</p>
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={result.url} controls class="w-full rounded-md bg-black max-h-[50vh]"></video>
            <div class="flex flex-wrap gap-3 mt-4">
              <button type="button" class="btn btn-primary" onclick={download}><Download size={14} /> Download {result.ext.toUpperCase()}</button>
              <button type="button" class="btn btn-secondary" onclick={exportVideo}>Re-export</button>
            </div>
            {#if result.audioDropped}
              <p class="field-hint mt-3 text-orange-dark">Your music couldn't be encoded in this browser, so the video is silent. Try the latest Chrome or Edge.</p>
            {/if}
            {#if result.ext === "webm"}
              <p class="field-hint mt-3">Your browser exported WebM. For a guaranteed MP4 (Etsy's preferred format), use the latest Chrome or Edge.</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import ButterflyLoader from "$lib/components/ui/ButterflyLoader.svelte";
  import SparkleBurst from "$lib/components/ui/SparkleBurst.svelte";
  import { startFaviconFlap, stopFaviconFlap } from "$lib/faviconAnimator";
  import {
    Image, CircleAlert, Download, CircleCheck, Circle, Star,
    LoaderCircle, ArrowLeft, RotateCcw, History, Trash2, Video,
  } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import { generateImages, pollImageJobs } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import {
    listSessions, saveSession, deleteSession, type HistorySession,
  } from "$lib/imageStudioHistory";

  type GeneratedImage = { b64?: string; url?: string };
  type ImageResult = { mode: string; label: string; prompt: string; images: GeneratedImage[] };

  const SIZES = [
    { value: "1024x1024", label: "Square 1:1", note: "Recommended — thumbnail-safe on mobile & desktop" },
    { value: "1792x1024", label: "Landscape", note: "Safe crop for your first photo" },
    { value: "1024x1792", label: "Portrait", note: "Tall — may be cropped in the thumbnail" },
  ];

  // Named backdrop palette — model generates from a colour NAME far more reliably than a hex code.
  const BG_SWATCHES: { name: string | null; label: string; css: string }[] = [
    { name: null, label: "Auto", css: "" },
    { name: "white", label: "White", css: "#ffffff" },
    { name: "ivory cream", label: "Ivory", css: "#f4ecdd" },
    { name: "warm beige", label: "Beige", css: "#e7d8c2" },
    { name: "soft grey", label: "Grey", css: "#d9d9d9" },
    { name: "charcoal", label: "Charcoal", css: "#3c3c3c" },
    { name: "blush pink", label: "Blush", css: "#f1d7d7" },
    { name: "sage green", label: "Sage", css: "#cdd6c1" },
    { name: "pale blue", label: "Blue", css: "#d6e3ec" },
    { name: "terracotta", label: "Terracotta", css: "#c87f5f" },
  ];

  // Hero = Etsy's studio shot. The rest of the set is built from it (White background removed).
  const HERO_LABEL = "Studio shot";
  const SET_TYPES = [
    { key: "lifestyle", label: "Lifestyle scene", hint: "Staged in a warm, real-world setting." },
    { key: "detail", label: "Detail close-up", hint: "Macro of texture and craftsmanship." },
    { key: "scale", label: "Scale shot", hint: "Beside a familiar object for size." },
    { key: "group", label: "Group / variations", hint: "Colours or finishes side by side." },
  ];

  type Phase = "hero" | "set";
  type SetStatus = "idle" | "loading" | "done" | "error";
  type SetItem = {
    key: string; label: string; hint: string;
    selected: boolean; count: number; status: SetStatus; images: GeneratedImage[]; error?: string;
  };

  // --- shared inputs ---
  let phase = $state<Phase>("hero");
  let productDesc = $state("");
  let style = $state("");
  let size = $state("1024x1024");
  let background = $state<string | null>(null);

  // --- phase 1: hero ---
  let heroCount = $state(2);
  let heroOptions = $state<GeneratedImage[]>([]);
  let hero = $state<string | null>(null);
  let loadingHero = $state(false);
  let heroElapsed = $state(0);
  let heroTimer: ReturnType<typeof setInterval> | undefined;
  let heroPending = $state(2);

  // --- phase 2: set ---
  let setItems = $state<SetItem[]>([]);
  let buildingSet = $state(false);

  // --- session + history (client-side, IndexedDB) ---
  let sessionId = $state<string | null>(null);
  let sessionCreatedAt = $state(0);
  let history = $state<HistorySession[]>([]);

  // --- shared status ---
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  // When images route to the (sometimes busy) media server, show how long the queue is.
  let busyInfo = $state<{ seconds: number; pending: number } | null>(null);
  // Mascot delight: animated favicon while generating + sparkle burst when results land.
  let flapping = false;
  let sparkleHero = $state(false);
  let sparkleSet = $state(false);
  const flapOn = () => { if (!flapping) { flapping = true; startFaviconFlap(); } };
  const flapOff = () => { if (flapping) { flapping = false; stopFaviconFlap(); } };
  const popHero = () => { sparkleHero = true; setTimeout(() => (sparkleHero = false), 1400); };
  const popSet = () => { sparkleSet = true; setTimeout(() => (sparkleSet = false), 1400); };
  const fmtWait = (s: number) => (s >= 60 ? `~${Math.round(s / 60)} min` : `~${s}s`);
  const onQueued = (eta: { seconds: number; message: string | null } | null, pending: number) => {
    busyInfo = pending > 0 ? { seconds: eta?.seconds ?? 0, pending } : null;
  };

  const srcOf = (img: GeneratedImage) => (img.b64 ? `data:image/png;base64,${img.b64}` : (img.url ?? ""));
  const aspectOf = (s: string): [number, number] => {
    const [w, h] = s.split("x").map(Number);
    return [w || 1, h || 1];
  };
  const resultAspect = $derived(aspectOf(size));
  const selectedSetCount = $derived(setItems.filter((s) => s.selected).length);
  // Billed per image: 5 credits × total images across selected scenes.
  const selectedImageCount = $derived(
    setItems.filter((s) => s.selected).reduce((sum, s) => sum + (s.count ?? 1), 0)
  );

  const fail = (res: { status: number; message: string }) => {
    if (res.status === 402) { needsUpgrade = true; error = res.message; }
    else error = res.message;
  };

  const refreshHistory = async () => { history = await listSessions(); };

  // Resume an in-flight batch left by a previous page load (server jobs finish even if the tab was
  // closed). Restore the slots as "generating", re-poll the saved jobIds, then drop images in place.
  const resumeActive = async () => {
    const active = loadActive();
    if (!active) return;
    productDesc = active.inputs.productDesc;
    style = active.inputs.style;
    size = active.inputs.size;
    background = active.inputs.background;

    if (active.phase === "hero") {
      phase = "hero";
      const ids = active.jobsByKey.hero ?? [];
      if (!ids.length) { clearActive(); return; }
      loadingHero = true;
      flapOn();
      heroPending = ids.length;
      const results = await pollImageJobs(ids);
      heroOptions = results.filter((r) => r.status === "done" && r.url).map((r) => ({ url: r.url! }));
      loadingHero = false;
      flapOff();
      if (heroOptions.length) popHero();
      clearActive();
      await invalidateAll();
    } else {
      hero = active.hero ?? null;
      sessionId = active.sessionId ?? crypto.randomUUID();
      sessionCreatedAt = active.sessionCreatedAt ?? Date.now();
      setItems = SET_TYPES.map((t) => ({ ...t, selected: true, count: 1, status: "idle" as SetStatus, images: [] }));
      phase = "set";
      buildingSet = true;
      flapOn();
      await Promise.all(
        Object.entries(active.jobsByKey).map(async ([key, ids]) => {
          const item = setItems.find((s) => s.key === key);
          if (!item || !ids.length) return;
          item.status = "loading";
          const results = await pollImageJobs(ids);
          const done = results.filter((r) => r.status === "done" && r.url).map((r) => ({ url: r.url! }));
          if (done.length) { item.images = done; item.status = "done"; }
          else { item.status = "error"; item.error = "Generation failed"; }
        })
      );
      buildingSet = false;
      flapOff();
      if (setItems.some((s) => s.status === "done")) popSet();
      clearActive();
      await invalidateAll();
      await persist();
    }
  };

  onMount(async () => {
    await refreshHistory();
    await resumeActive();
  });
  onDestroy(flapOff);

  // Persist the current session (hero + completed shots) so the seller can revisit without paying.
  const persist = async () => {
    if (!sessionId || !hero) return;
    await saveSession({
      id: sessionId,
      createdAt: sessionCreatedAt,
      productDesc, style, size, background,
      hero,
      shots: setItems
        .filter((s) => s.status === "done" && s.images.length)
        .map((s) => ({ key: s.key, label: s.label, images: s.images.map(srcOf) })),
    });
    await refreshHistory();
  };

  // === Persistent job card (survives reload / leaving the page) ================
  // Image jobs live server-side (image_jobs) and finish via webhook even if the tab closes; we save
  // the in-flight batch's jobIds (+ enough context to rebuild the slots) so on return we resume
  // polling and drop the finished images back into place — no lost generations.
  const ACTIVE_KEY = "vierank_img_active";
  type ActiveBatch = {
    phase: Phase;
    inputs: { productDesc: string; style: string; size: string; background: string | null };
    jobsByKey: Record<string, string[]>; // "hero" for phase 1, else the set-item key
    hero?: string | null;
    heroCount?: number;
    sessionId?: string | null;
    sessionCreatedAt?: number;
    startedAt: number;
  };
  const saveActive = (b: ActiveBatch) => { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(b)); } catch { /* quota */ } };
  const loadActive = (): ActiveBatch | null => {
    try {
      const s = localStorage.getItem(ACTIVE_KEY);
      const b = s ? (JSON.parse(s) as ActiveBatch) : null;
      // Discard stale records (jobs long since finished or GC'd).
      if (b && Date.now() - b.startedAt > 20 * 60 * 1000) { localStorage.removeItem(ACTIVE_KEY); return null; }
      return b;
    } catch { return null; }
  };
  const clearActive = () => { try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ } };

  // === Phase 1: generate hero options ==========================================
  const generateHero = async (e: Event) => {
    e.preventDefault();
    if (!productDesc.trim() || loadingHero) return;
    loadingHero = true;
    flapOn();
    error = null;
    needsUpgrade = false;
    heroElapsed = 0;
    heroPending = heroCount;
    clearInterval(heroTimer);
    heroTimer = setInterval(() => (heroElapsed += 1), 1000);

    const active: ActiveBatch = {
      phase: "hero",
      inputs: { productDesc: productDesc.trim(), style: style.trim(), size, background },
      jobsByKey: {},
      heroCount,
      startedAt: Date.now(),
    };
    const res = await generateImages({
      mode: "mockup",
      productDesc: productDesc.trim(),
      style: style.trim() || undefined,
      size,
      n: heroCount,
      background: background || undefined,
    }, { onQueued, onSubmitted: (ids) => { active.jobsByKey.hero = ids; saveActive(active); } });
    clearInterval(heroTimer);
    busyInfo = null;
    clearActive();
    flapOff();

    if (res.ok) { heroOptions = res.data.images ?? []; if (heroOptions.length) popHero(); await invalidateAll(); }
    else fail(res);
    loadingHero = false;
  };

  // The hero is reused as the `referenceImage` (base64) when building the set, so it must be a data
  // URL. Generated images now come back as asset URLs (R2) → fetch + inline the chosen one once.
  const urlToDataUrl = async (url: string): Promise<string> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  };

  const chooseHero = async (img: GeneratedImage) => {
    const src = srcOf(img);
    hero = src.startsWith("data:") ? src : await urlToDataUrl(src);
    sessionId = crypto.randomUUID();
    sessionCreatedAt = Date.now();
    setItems = SET_TYPES.map((t) => ({ ...t, selected: true, count: 1, status: "idle" as SetStatus, images: [] }));
    error = null;
    needsUpgrade = false;
    phase = "set";
    await persist();
  };

  const backToHero = () => { phase = "hero"; };

  // === Phase 2: build the set from the hero ====================================
  const generateOne = async (item: SetItem, onSubmitted?: (ids: string[]) => void) => {
    item.status = "loading";
    item.error = undefined;
    const res = await generateImages({
      mode: item.key,
      productDesc: productDesc.trim(),
      style: style.trim() || undefined,
      size,
      n: item.count,
      referenceImage: hero || undefined,
      background: background || undefined,
    }, { onQueued, onSubmitted });
    busyInfo = null;
    if (res.ok && res.data.images?.length) {
      item.images = res.data.images;
      item.status = "done";
    } else {
      item.status = "error";
      item.error = res.ok ? "No image returned" : res.message;
      if (!res.ok && res.status === 402) needsUpgrade = true;
    }
  };

  // Build a persistable record of the in-flight set so a reload can resume it.
  const setActive = (): ActiveBatch => ({
    phase: "set",
    inputs: { productDesc: productDesc.trim(), style: style.trim(), size, background },
    jobsByKey: {},
    hero,
    sessionId,
    sessionCreatedAt,
    startedAt: Date.now(),
  });

  const generateSet = async () => {
    if (buildingSet || !hero) return;
    buildingSet = true;
    flapOn();
    error = null;
    needsUpgrade = false;
    const active = setActive();
    const targets = setItems.filter((s) => s.selected && s.status !== "done");
    await Promise.all(
      targets.map((item) =>
        generateOne(item, (ids) => { active.jobsByKey[item.key] = ids; saveActive(active); })
      )
    );
    clearActive();
    flapOff();
    if (targets.some((t) => t.status === "done")) popSet();
    await invalidateAll();
    await persist();
    buildingSet = false;
  };

  const retryOne = async (item: SetItem) => {
    if (buildingSet) return;
    buildingSet = true;
    const active = setActive();
    await generateOne(item, (ids) => { active.jobsByKey[item.key] = ids; saveActive(active); });
    clearActive();
    await persist();
    buildingSet = false;
  };

  // === History: open / delete ==================================================
  const openSession = (s: HistorySession) => {
    productDesc = s.productDesc;
    style = s.style;
    size = s.size;
    background = s.background;
    hero = s.hero;
    sessionId = s.id;
    sessionCreatedAt = s.createdAt;
    setItems = SET_TYPES.map((t) => {
      const shot = s.shots.find((x) => x.key === t.key);
      return {
        ...t,
        selected: true,
        count: shot ? Math.min(4, Math.max(1, shot.images.length)) : 1,
        status: (shot ? "done" : "idle") as SetStatus,
        images: shot ? shot.images.map((d) => ({ url: d })) : [],
      };
    });
    error = null;
    needsUpgrade = false;
    phase = "set";
  };

  const removeSession = async (id: string) => {
    await deleteSession(id);
    await refreshHistory();
  };

  // === Download (centre-crop to chosen aspect, scale shortest side to 2000px) ==
  const ETSY_MIN_SIDE = 2000;
  let upscaling = $state<string | null>(null);

  const upscaleToPng = (src: string, arW: number, arH: number): Promise<string | null> =>
    new Promise((resolve) => {
      const im = new window.Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          const targetAR = arW / arH;
          const natW = im.naturalWidth || 1;
          const natH = im.naturalHeight || 1;
          let cropW = natW;
          let cropH = natH;
          if (natW / natH > targetAR) cropW = natH * targetAR;
          else cropH = natW / targetAR;
          const sx = (natW - cropW) / 2;
          const sy = (natH - cropH) / 2;
          const outW = targetAR >= 1 ? Math.round(ETSY_MIN_SIDE * targetAR) : ETSY_MIN_SIDE;
          const outH = targetAR >= 1 ? ETSY_MIN_SIDE : Math.round(ETSY_MIN_SIDE / targetAR);
          const canvas = document.createElement("canvas");
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(im, sx, sy, cropW, cropH, 0, 0, outW, outH);
          canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), "image/png");
        } catch {
          resolve(null);
        }
      };
      im.onerror = () => resolve(null);
      im.src = src;
    });

  const downloadImage = async (img: GeneratedImage, name: string, busyKey: string) => {
    const src = srcOf(img);
    if (!src || upscaling !== null) return;
    upscaling = busyKey;
    try {
      const [arW, arH] = resultAspect;
      const upscaled = await upscaleToPng(src, arW, arH);
      const href = upscaled ?? src;
      const a = document.createElement("a");
      a.href = href;
      a.download = `${name}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (upscaled) setTimeout(() => URL.revokeObjectURL(upscaled), 10_000);
    } finally {
      upscaling = null;
    }
  };

  // Etsy photo-set coverage: hero (studio) + each completed set shot.
  const coverage = $derived([
    { key: "mockup", label: HERO_LABEL, done: !!hero },
    ...SET_TYPES.map((t) => ({
      key: t.key, label: t.label,
      done: setItems.some((s) => s.key === t.key && s.status === "done"),
    })),
  ]);
  const coverageDone = $derived(coverage.filter((c) => c.done).length);

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
</script>

<ToolPageLayout
  title="AI Image Studio"
  description="Build a full Etsy photo set the smart way: create one hero shot, then generate the rest from it so the same product — and the same backdrop colour — shows up in every photo."
  icon={Image}
  credits={5}
  creditsUnit="image"
>
  {#snippet controls()}
    {#if phase === "hero"}
      <form onsubmit={generateHero}>
        <div class="flex items-center gap-2 mb-3">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal text-white text-[0.6875rem] font-semibold">1</span>
          <p class="section-kicker !mb-0">Create your hero shot</p>
        </div>

        <label for="img-desc" class="field-label">What's the product?</label>
        <textarea id="img-desc" bind:value={productDesc} placeholder="A hand-poured soy candle in an amber glass jar, lavender scent…" rows={4} class="field resize-none" maxlength="800"></textarea>

        <label for="img-style" class="field-label mt-4">Style / mood <span class="text-text-muted font-normal">(optional)</span></label>
        <input id="img-style" bind:value={style} placeholder="rustic, warm tones, cozy" class="field" maxlength="300" />

        <p class="field-label mt-4">Background colour <span class="text-text-muted font-normal">(applied across the whole set)</span></p>
        <div class="flex flex-wrap gap-2">
          {#each BG_SWATCHES as sw (sw.label)}
            <button
              type="button"
              onclick={() => (background = sw.name)}
              title={sw.label}
              class="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.75rem] transition-colors {background === sw.name ? 'border-teal bg-teal/5 text-text-primary' : 'border-border text-text-muted hover:border-text-muted'}"
            >
              {#if sw.css}
                <span class="w-3.5 h-3.5 rounded-full border border-border" style="background: {sw.css}"></span>
              {:else}
                <span class="w-3.5 h-3.5 rounded-full border border-border bg-gradient-to-br from-white to-text-muted"></span>
              {/if}
              {sw.label}
            </button>
          {/each}
        </div>

        <div class="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label for="img-size" class="field-label">Aspect</label>
            <select id="img-size" bind:value={size} class="field appearance-none cursor-pointer">
              {#each SIZES as s}<option value={s.value}>{s.label}</option>{/each}
            </select>
            <p class="field-hint mt-1">{SIZES.find((s) => s.value === size)?.note}</p>
          </div>
          <div>
            <label for="img-count" class="field-label">Hero options</label>
            <select id="img-count" bind:value={heroCount} class="field appearance-none cursor-pointer">
              {#each [1, 2, 3, 4] as n}<option value={n}>{n}</option>{/each}
            </select>
          </div>
        </div>

        <button type="submit" disabled={loadingHero || !productDesc.trim()} class="btn btn-primary w-full justify-center mt-5">
          {#if loadingHero}Generating… {heroElapsed}s{:else}Generate hero shot · {heroCount * 5} credits{/if}
        </button>
        <p class="field-hint">A clear studio shot on a clean background — Etsy's recommended first photo. 5 credits per option. Pick your favourite, then build the rest of the set from it.</p>
      </form>
    {:else}
      <div>
        <div class="flex items-center gap-2 mb-3">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal text-white text-[0.6875rem] font-semibold">2</span>
          <p class="section-kicker !mb-0">Build the set</p>
        </div>

        {#if hero}
          <div class="flex items-center gap-3 rounded-lg border border-teal/40 bg-teal/5 p-2.5 mb-4">
            <img src={hero} alt="Hero shot" class="w-12 h-12 rounded object-cover shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-[0.8125rem] font-medium text-text-primary inline-flex items-center gap-1"><Star size={12} class="text-teal" /> Hero shot locked</p>
              <p class="text-[0.75rem] text-text-muted leading-snug">Every shot keeps this product{background ? ` & ${background} palette` : ""}.</p>
            </div>
            <button type="button" onclick={backToHero} class="copy-link shrink-0 !text-text-muted hover:!text-teal"><ArrowLeft size={12} /> Change</button>
          </div>
        {/if}

        <p class="field-label">Shots to generate</p>
        <div class="space-y-1.5 mb-4">
          {#each setItems as item (item.key)}
            <div class="rounded-lg border transition-colors {item.selected ? 'border-teal/50 bg-teal/5' : 'border-border'}">
              <label class="flex items-start gap-2.5 p-2 cursor-pointer">
                <input type="checkbox" bind:checked={item.selected} class="mt-0.5 accent-teal" />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-text-primary">{item.label}</span>
                  <span class="block text-[0.75rem] text-text-muted leading-snug">{item.hint}</span>
                </span>
                {#if item.status === "done"}<CircleCheck size={15} class="text-success mt-0.5 shrink-0" />{/if}
              </label>
              {#if item.selected}
                <div class="flex items-center justify-between gap-2 px-2 pb-2 pl-9">
                  <span class="text-[0.75rem] text-text-muted">Images</span>
                  <select bind:value={item.count} class="field !py-1 !px-2 !w-auto text-[0.8125rem] appearance-none cursor-pointer">
                    {#each [1, 2, 3, 4] as n}<option value={n}>{n}</option>{/each}
                  </select>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <button type="button" onclick={generateSet} disabled={buildingSet || !selectedSetCount} class="btn btn-primary w-full justify-center">
          {#if buildingSet}<LoaderCircle size={14} class="animate-spin" /> Generating set…{:else}Generate set ({selectedImageCount} {selectedImageCount === 1 ? "image" : "images"}) · {selectedImageCount * 5} credits{/if}
        </button>
        <p class="field-hint">5 credits per image. They run together and appear as they finish.</p>
      </div>
    {/if}
  {/snippet}

  {#if error}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
        {#if needsUpgrade}<a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>{/if}
      </div>
    </div>
  {/if}

  {#if busyInfo}
    <div class="mb-7 flex items-start gap-3 animate-fade-in rounded-xl border border-amber-200 bg-amber-50 p-3.5">
      <LoaderCircle size={18} class="text-amber-600 flex-shrink-0 mt-0.5 animate-spin" />
      <div class="flex-1">
        <p class="text-sm font-medium text-text-primary">The image server is busy — hang tight.</p>
        <p class="text-xs text-text-secondary mt-0.5">
          {busyInfo.pending} {busyInfo.pending === 1 ? "image is" : "images are"} queued{#if busyInfo.seconds > 0} · estimated wait {fmtWait(busyInfo.seconds)}{/if}. Keep this tab open — they'll appear automatically.
        </p>
      </div>
    </div>
  {/if}

  {#if phase === "hero"}
    {#if loadingHero}
      <div class="animate-fade-in">
        <div class="flex justify-center mb-4"><ButterflyLoader size={52} /></div>
        <p class="section-kicker mb-1">Generating</p>
        <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Painting your hero shot…</h2>
        <p class="lead text-sm mb-4">{heroElapsed > 90 ? "Taking a little longer than usual — still working, hang tight." : "High-quality renders can take up to ~90 seconds."}</p>
        <div class="mb-5 flex items-center gap-3" aria-live="polite">
          <div class="h-1.5 flex-1 rounded-full bg-bg-tint overflow-hidden">
            <div class="h-full bg-teal rounded-full transition-all duration-1000 ease-out {heroElapsed > 90 ? 'animate-pulse' : ''}" style="width: {Math.min(95, Math.round((heroElapsed / 90) * 100))}%"></div>
          </div>
          <span class="text-[0.8125rem] text-text-muted tabular-nums shrink-0">{heroElapsed}s</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each Array(Math.max(1, heroPending)) as _, i (i)}<Skeleton height="100%" rounded="lg" class="aspect-square" />{/each}
        </div>
      </div>
    {:else if heroOptions.length}
      <div class="animate-fade-in relative">
        {#if sparkleHero}<SparkleBurst count={16} />{/if}
        <p class="section-kicker mb-1">Your hero options</p>
        <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Pick your hero shot</h2>
        <p class="lead text-sm mb-5">Choose the best one — we'll keep this exact product across the rest of your set.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each heroOptions as img, i (i)}
            <div class="relative rounded-lg border border-border overflow-hidden bg-bg-page/40">
              <img src={srcOf(img)} alt="Hero option {i + 1}" loading="lazy" class="w-full object-cover" style="aspect-ratio: {resultAspect[0]} / {resultAspect[1]}" />
              <div class="flex items-center gap-2 p-2 border-t border-border bg-bg-card">
                <button type="button" onclick={() => chooseHero(img)} class="btn btn-primary flex-1 justify-center"><Star size={13} /> Use as hero</button>
                <button type="button" onclick={() => downloadImage(img, `hero-${i + 1}`, `hero-${i}`)} disabled={upscaling !== null} class="btn btn-secondary disabled:opacity-60">
                  {#if upscaling === `hero-${i}`}<LoaderCircle size={13} class="animate-spin" />{:else}<Download size={13} />{/if}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <ToolEmpty mascot icon={Image} title="Start with a hero shot" hint="Describe your product on the left and generate a studio shot. Pick your favourite, then build out the rest of your Etsy photo set from it — same product, same backdrop, in every photo." />
    {/if}
  {:else}
    <div class="animate-fade-in relative">
      {#if sparkleSet}<SparkleBurst count={16} />{/if}
      <p class="section-kicker mb-1">Your photo set</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Hero + {setItems.filter((s) => s.status === "done").length} shots</h2>
      <p class="lead text-sm mb-5">Each shot keeps the same product as your hero. Download the ones you like.</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#if hero}
          <div class="relative rounded-lg border-2 border-teal/50 overflow-hidden bg-bg-page/40">
            <img src={hero} alt="Hero shot" class="w-full object-cover" style="aspect-ratio: {resultAspect[0]} / {resultAspect[1]}" />
            <span class="absolute top-3 left-3 inline-flex items-center gap-1 rounded-md bg-teal text-white text-[0.6875rem] font-medium px-2 py-1"><Star size={11} /> Hero · {HERO_LABEL}</span>
            <div class="flex items-center justify-end p-2 border-t border-border bg-bg-card">
              <button type="button" onclick={() => downloadImage({ url: hero! }, "hero", "hero-locked")} disabled={upscaling !== null} class="btn btn-secondary disabled:opacity-60">
                {#if upscaling === "hero-locked"}<LoaderCircle size={13} class="animate-spin" /> Preparing…{:else}<Download size={13} /> Download{/if}
              </button>
            </div>
          </div>
        {/if}

        {#each setItems.filter((s) => s.selected || s.status !== "idle") as item (item.key)}
          {#if item.status === "done"}
            {#each item.images as img, idx (idx)}
              <div class="relative rounded-lg border border-border overflow-hidden bg-bg-page/40">
                <img src={srcOf(img)} alt="{item.label} {idx + 1}" loading="lazy" class="w-full object-cover" style="aspect-ratio: {resultAspect[0]} / {resultAspect[1]}" />
                <span class="absolute top-3 left-3 rounded-md bg-black/55 text-white text-[0.6875rem] font-medium px-2 py-1">{item.label}{item.images.length > 1 ? ` ${idx + 1}` : ""}</span>
                <div class="flex items-center justify-end p-2 border-t border-border bg-bg-card">
                  <button type="button" onclick={() => downloadImage(img, `${item.key}-${idx + 1}`, `set-${item.key}-${idx}`)} disabled={upscaling !== null} class="btn btn-secondary disabled:opacity-60">
                    {#if upscaling === `set-${item.key}-${idx}`}<LoaderCircle size={13} class="animate-spin" /> Preparing…{:else}<Download size={13} /> Download{/if}
                  </button>
                </div>
              </div>
            {/each}
          {:else if item.status === "loading"}
            {#each Array(Math.max(1, item.count)) as _, idx (idx)}
              <div class="rounded-lg border border-border overflow-hidden bg-bg-page/40 flex flex-col items-center justify-center text-center gap-2 p-4" style="aspect-ratio: {resultAspect[0]} / {resultAspect[1]}">
                <LoaderCircle size={22} class="text-teal animate-spin" />
                <p class="text-[0.8125rem] text-text-muted">Generating {item.label}…</p>
              </div>
            {/each}
          {:else if item.status === "error"}
            <div class="rounded-lg border border-border overflow-hidden bg-bg-page/40 flex flex-col items-center justify-center text-center gap-2 p-4" style="aspect-ratio: {resultAspect[0]} / {resultAspect[1]}">
              <CircleAlert size={20} class="text-danger" />
              <p class="text-[0.8125rem] text-text-secondary">{item.label} failed</p>
              <button type="button" onclick={() => retryOne(item)} disabled={buildingSet} class="copy-link !text-teal disabled:opacity-50"><RotateCcw size={12} /> Retry</button>
            </div>
          {:else}
            <div class="rounded-lg border border-dashed border-border bg-bg-page/40 flex flex-col items-center justify-center text-center gap-2 p-4" style="aspect-ratio: {resultAspect[0]} / {resultAspect[1]}">
              <Circle size={20} class="text-text-muted" />
              <p class="text-[0.8125rem] text-text-muted">{item.label} — queued{item.count > 1 ? ` (${item.count})` : ""}</p>
            </div>
          {/if}
        {/each}
      </div>

      <div class="card p-5 mt-6">
        <div class="flex items-baseline justify-between gap-3 mb-1">
          <p class="section-kicker !mb-0">Your Etsy photo set · {coverageDone}/{coverage.length}</p>
          <a href="https://www.etsy.com/seller-handbook/article/7-essential-types-of-product-photos/22504064051" target="_blank" rel="noopener" class="copy-link !text-text-muted hover:!text-teal text-[0.75rem]">Etsy Seller Handbook ↗</a>
        </div>
        <p class="text-[0.8125rem] text-text-secondary mb-3">Etsy lets you add up to 20 photos and using more of them lifts conversion. Cover these shot types:</p>
        <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {#each coverage as shot (shot.key)}
            <div class="flex items-center gap-2 text-sm">
              {#if shot.done}<CircleCheck size={15} class="text-success shrink-0" /><span class="text-text-primary">{shot.label}</span>
              {:else}<Circle size={15} class="text-text-muted shrink-0" /><span class="text-text-muted">{shot.label}</span>{/if}
            </div>
          {/each}
        </div>
        <div class="mt-4 pt-4 border-t border-border-light">
          <a href="/tools/video-studio" class="inline-flex items-center gap-1.5 copy-link !text-teal">
            <Video size={13} /> Turn these into a listing video →
          </a>
          <p class="text-[0.75rem] text-text-muted mt-1">Your shots carry over — pick one as the seed in AI Video Studio.</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Client-side history: revisit past sets without paying to regenerate -->
  {#if history.length}
      <div class="mt-8 pt-6 border-t border-border">
        <p class="section-kicker mb-1 inline-flex items-center gap-1.5"><History size={13} /> Saved on this device · {history.length}</p>
        <p class="text-[0.8125rem] text-text-muted mb-3">Your generated sets are kept in this browser so you can reopen and download them — no extra credits.</p>
        <div class="flex gap-3 overflow-x-auto pb-2">
          {#each history as s (s.id)}
            <div class="shrink-0 w-40 rounded-lg border border-border overflow-hidden bg-bg-card">
              {#if s.hero}
                <button type="button" onclick={() => openSession(s)} class="block w-full" title="Open this set">
                  <img src={s.hero} alt="Saved set" class="w-full aspect-square object-cover" />
                </button>
              {/if}
              <div class="p-2">
                <p class="text-[0.75rem] text-text-primary truncate" title={s.productDesc}>{s.productDesc || "Untitled"}</p>
                <p class="text-[0.6875rem] text-text-muted">{fmtDate(s.createdAt)} · {s.shots.length + (s.hero ? 1 : 0)} photos</p>
                <div class="flex items-center justify-between mt-1.5">
                  <button type="button" onclick={() => openSession(s)} class="copy-link !text-teal text-[0.75rem]">Open</button>
                  <button type="button" onclick={() => removeSession(s.id)} class="copy-link !text-text-muted hover:!text-danger" title="Delete"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
  {/if}
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import ButterflyLoader from "$lib/components/ui/ButterflyLoader.svelte";
  import SparkleBurst from "$lib/components/ui/SparkleBurst.svelte";
  import { startFaviconFlap, stopFaviconFlap } from "$lib/faviconAnimator";
  import {
    Video, CircleAlert, Download, CircleCheck, LoaderCircle, Upload,
    Film, Star, RotateCcw, Type as TypeIcon, Play,
  } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { listSessions, type HistorySession } from "$lib/imageStudioHistory";

  // Etsy listing-video rules (official) → shown as guarantees on a finished clip.
  const CLIP_TYPES = [
    { key: "turntable", label: "360 spin", hint: "Slow turntable rotation showing the whole product." },
    { key: "lifestyle", label: "In use / lifestyle", hint: "The product in a warm, real-world setting." },
    { key: "detail", label: "Detail glide", hint: "Macro camera gliding across texture & craft." },
    { key: "reveal", label: "Reveal", hint: "Gentle zoom-out revealing the full product." },
  ] as const;

  const ASPECTS = [
    { value: "portrait", label: "Portrait", note: "Mobile-first — most Etsy traffic" },
    { value: "landscape", label: "Landscape", note: "Wide shots & desktop" },
  ] as const;

  type JobStatus = "pending" | "done" | "error";
  interface VideoJob {
    id: string; status: JobStatus; clipType: string; aspect: string;
    duration: string; createdAt: number; url: string | null; error: string | null;
  }

  // --- source ---
  type SourceMode = "hero" | "describe";
  let sourceMode = $state<SourceMode>("hero");
  let heroImage = $state<string | null>(null); // data URL of the chosen seed
  let heroOptions = $state<string[]>([]); // candidate hero data URLs from Image Studio history
  let productDesc = $state("");

  // --- options ---
  let clipType = $state<(typeof CLIP_TYPES)[number]["key"]>("turntable");
  let aspect = $state<"portrait" | "landscape">("portrait");
  let duration = $state<"4s" | "6s" | "8s">("8s");

  // --- job + history ---
  let activeJob = $state<VideoJob | null>(null);
  let submitting = $state(false);
  let elapsed = $state(0);
  let history = $state<VideoJob[]>([]);

  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  // Server-reported queue wait (media.viemind.ai can be busy) — shown on the rendering card.
  let queueEta = $state<number | null>(null);
  const fmtWait = (s: number) => (s >= 60 ? `~${Math.round(s / 60)} min` : `~${s}s`);

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;

  // Mascot delight: animated favicon while rendering + a sparkle burst on completion.
  let flapping = false;
  let justDone = $state(false);
  const flapOn = () => { if (!flapping) { flapping = true; startFaviconFlap(); } };
  const flapOff = () => { if (flapping) { flapping = false; stopFaviconFlap(); } };

  const canGenerate = $derived(
    !submitting && (sourceMode === "describe" ? productDesc.trim().length > 2 : !!heroImage)
  );

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const clipLabel = (k: string) => CLIP_TYPES.find((c) => c.key === k)?.label ?? k;

  // Convert any image src to a data URL (backend decodes base64). http URLs are fetched + inlined.
  async function toDataUrl(src: string): Promise<string | null> {
    if (src.startsWith("data:")) return src;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function onUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") { heroImage = r.result; sourceMode = "hero"; }
    };
    r.readAsDataURL(file);
  }

  const fail = (res: { status: number; message: string }) => {
    if (res.status === 402) { needsUpgrade = true; error = res.message; }
    else error = res.message;
  };

  function stopTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = undefined; }
  }

  async function refreshJob(id: string): Promise<VideoJob | null> {
    try {
      const res = await fetch(`/api/tools/video-jobs/${id}`);
      if (!res.ok) return null;
      return (await res.json()) as VideoJob;
    } catch {
      return null;
    }
  }

  // Poll a pending job until done/error (~5s cadence, ~5min cap). The clock ticks elapsed seconds.
  function watch(id: string) {
    stopTimers();
    elapsed = 0;
    flapOn();
    clockTimer = setInterval(() => (elapsed += 1), 1000);
    let ticks = 0;
    pollTimer = setInterval(async () => {
      ticks += 1;
      const job = await refreshJob(id);
      if (job) {
        activeJob = job;
        if (job.status !== "pending") {
          stopTimers();
          flapOff();
          await loadHistory();
          if (job.status === "done") {
            justDone = true;
            setTimeout(() => (justDone = false), 1400);
            invalidateAll(); // refresh credits badge
          }
        }
      }
      if (ticks > 60) stopTimers(); // 5 min safety cap — leave it on the card, user can reopen
    }, 5000);
  }

  async function generate() {
    if (!canGenerate) return;
    error = null; needsUpgrade = false; submitting = true;
    try {
      const seed = sourceMode === "hero" && heroImage ? await toDataUrl(heroImage) : undefined;
      const res = await callTool<{ jobId: string; status: JobStatus; eta: { seconds: number } | null }>("video-studio", {
        clipType,
        aspect,
        duration,
        ...(seed ? { heroImage: seed } : {}),
        ...(productDesc.trim() ? { productDesc: productDesc.trim() } : {}),
      });
      if (!res.ok) { fail(res); return; }
      queueEta = res.data.eta?.seconds ?? null;
      activeJob = {
        id: res.data.jobId, status: "pending", clipType, aspect, duration,
        createdAt: Date.now(), url: null, error: null,
      };
      watch(res.data.jobId);
    } finally {
      submitting = false;
    }
  }

  async function openJob(job: VideoJob) {
    activeJob = job;
    error = null;
    if (job.status === "pending") watch(job.id);
    else stopTimers();
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/tools/video-jobs");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: VideoJob[] };
      history = data.jobs ?? [];
    } catch { /* best-effort */ }
  }

  onMount(async () => {
    // Heroes from Image Studio history (client IndexedDB) — the recommended seed source.
    const sessions = await listSessions().catch(() => [] as HistorySession[]);
    const heroes: string[] = [];
    for (const s of sessions) {
      if (s.hero) heroes.push(s.hero);
      for (const shot of s.shots) for (const img of shot.images) if (img) heroes.push(img);
    }
    heroOptions = heroes.slice(0, 12);
    if (!heroes.length) sourceMode = "describe";

    await loadHistory();
    // Resume watching the newest still-pending job (user came back to the page).
    const pending = history.find((j) => j.status === "pending");
    if (pending) openJob(pending);
  });

  onDestroy(() => { stopTimers(); flapOff(); });
</script>

<ToolPageLayout
  title="AI Video Studio"
  description="Turn one hero photo into a short, looping Etsy listing video. Pick a shot, we keep the same product on screen — silent and Etsy-ready, just like Etsy plays it."
  icon={Video}
  credits={20}
  creditsUnit="video"
>
  {#snippet controls()}
    <div class="flex items-center gap-2 mb-3">
      <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal text-white text-[0.6875rem] font-semibold">1</span>
      <p class="section-kicker !mb-0">Source</p>
    </div>

    <div class="flex gap-1.5 mb-3">
      <button type="button" onclick={() => (sourceMode = "hero")}
        class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[0.8125rem] transition-colors {sourceMode === 'hero' ? 'border-teal bg-teal/5 text-text-primary' : 'border-border text-text-muted hover:border-text-muted'}">
        <Star size={13} /> Hero shot
      </button>
      <button type="button" onclick={() => (sourceMode = "describe")}
        class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[0.8125rem] transition-colors {sourceMode === 'describe' ? 'border-teal bg-teal/5 text-text-primary' : 'border-border text-text-muted hover:border-text-muted'}">
        <TypeIcon size={13} /> Describe
      </button>
    </div>

    {#if sourceMode === "hero"}
      {#if heroOptions.length}
        <p class="field-hint mb-2">Pick a product image from your Image Studio — the video keeps this exact product.</p>
        <div class="grid grid-cols-4 gap-1.5 mb-3">
          {#each heroOptions as opt, i (opt + "-" + i)}
            <button type="button" onclick={() => (heroImage = opt)}
              class="relative aspect-square rounded-lg overflow-hidden border-2 transition-colors {heroImage === opt ? 'border-teal' : 'border-transparent hover:border-border'}">
              <img src={opt} alt="hero option" class="w-full h-full object-cover" />
              {#if heroImage === opt}<span class="absolute inset-0 bg-teal/20 flex items-center justify-center"><CircleCheck size={16} class="text-white drop-shadow" /></span>{/if}
            </button>
          {/each}
        </div>
      {:else}
        <p class="field-hint mb-2">No saved Image Studio shots found — upload a product photo or switch to Describe.</p>
      {/if}
      <label class="btn btn-ghost w-full justify-center cursor-pointer !text-[0.8125rem]">
        <Upload size={14} /> Upload a photo
        <input type="file" accept="image/*" class="hidden" onchange={onUpload} />
      </label>
      {#if heroImage && !heroOptions.includes(heroImage)}
        <img src={heroImage} alt="uploaded" class="mt-2 w-16 h-16 rounded-lg object-cover border border-border" />
      {/if}
    {/if}

    <label for="vid-desc" class="field-label mt-4">
      {sourceMode === "describe" ? "What's the product?" : "Product note "}<span class="text-text-muted font-normal">{sourceMode === "describe" ? "" : "(optional)"}</span>
    </label>
    <textarea id="vid-desc" bind:value={productDesc} rows={3} maxlength="800" class="field resize-none"
      placeholder="A hand-poured soy candle in an amber glass jar…"></textarea>
    {#if sourceMode === "describe"}
      <p class="field-hint mt-1.5">Heads up: with no photo, the video shows an <strong>AI-imagined</strong> product from your words — not your actual item. For your real product, use a Hero shot or upload a photo.</p>
    {/if}

    <div class="flex items-center gap-2 mt-5 mb-3">
      <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal text-white text-[0.6875rem] font-semibold">2</span>
      <p class="section-kicker !mb-0">The clip</p>
    </div>

    <div class="space-y-1.5">
      {#each CLIP_TYPES as ct (ct.key)}
        <label class="flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors {clipType === ct.key ? 'border-teal/50 bg-teal/5' : 'border-border'}">
          <input type="radio" name="cliptype" value={ct.key} bind:group={clipType} class="mt-0.5 accent-teal" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-text-primary">{ct.label}</span>
            <span class="block text-[0.75rem] text-text-muted leading-snug">{ct.hint}</span>
          </span>
        </label>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-3 mt-4">
      <div>
        <label for="vid-aspect" class="field-label">Aspect</label>
        <select id="vid-aspect" bind:value={aspect} class="field appearance-none cursor-pointer">
          {#each ASPECTS as a}<option value={a.value}>{a.label}</option>{/each}
        </select>
        <p class="field-hint mt-1">{ASPECTS.find((a) => a.value === aspect)?.note}</p>
      </div>
      <div>
        <label for="vid-dur" class="field-label">Length</label>
        <select id="vid-dur" bind:value={duration} class="field appearance-none cursor-pointer">
          <option value="4s">4 seconds</option>
          <option value="6s">6 seconds</option>
          <option value="8s">8 seconds</option>
        </select>
        <p class="field-hint mt-1">Etsy loops 3–15s, muted</p>
      </div>
    </div>

    <button type="button" onclick={generate} disabled={!canGenerate} class="btn btn-primary w-full justify-center mt-5">
      {#if submitting}<LoaderCircle size={14} class="animate-spin" /> Submitting…{:else}Generate video · 20 credits{/if}
    </button>
    <p class="field-hint">Rendering takes ~15s–2 min. You can leave this page — it'll be waiting in your history.</p>
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

  {#if activeJob}
    <div class="animate-fade-in mb-8 relative">
      {#if activeJob.status === "pending"}
        <div class="flex justify-center mb-4"><ButterflyLoader size={56} /></div>
        <p class="section-kicker mb-1">Rendering</p>
        <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Creating your {clipLabel(activeJob.clipType)} video…</h2>
        <p class="lead text-sm mb-2">VieRank AI is rendering your video. It'll appear here automatically — you can leave this page and come back.</p>
        {#if queueEta && queueEta > 0}
          <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-4 inline-flex items-center gap-1.5">
            <LoaderCircle size={12} class="animate-spin" /> The video server is busy — estimated wait {fmtWait(queueEta)}.
          </p>
        {:else}
          <p class="text-xs text-text-muted mb-4">{elapsed > 120 ? "Taking a little longer than usual — still rendering, hang tight." : "This usually takes 15s–2 minutes."}</p>
        {/if}
        <div class="flex items-center gap-3" aria-live="polite">
          <div class="h-1.5 flex-1 rounded-full bg-bg-tint overflow-hidden">
            <div class="h-full bg-teal rounded-full transition-all duration-1000 ease-out {elapsed > 120 ? 'animate-pulse' : ''}" style="width: {Math.min(95, Math.round((elapsed / 120) * 100))}%"></div>
          </div>
          <span class="text-[0.8125rem] text-text-muted tabular-nums shrink-0">{elapsed}s</span>
        </div>
      {:else if activeJob.status === "done" && activeJob.url}
        {#if justDone}<SparkleBurst count={16} />{/if}
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="section-kicker mb-1">Ready</p>
            <h2 class="text-lg font-semibold tracking-tight text-text-primary">{clipLabel(activeJob.clipType)} · {activeJob.duration}</h2>
          </div>
          <a href={activeJob.url} download={`vierank-${activeJob.id}.mp4`} class="btn btn-primary !py-1.5"><Download size={15} /> Download</a>
        </div>
        <div class="rounded-xl overflow-hidden border border-border bg-black {activeJob.aspect === 'portrait' ? 'max-w-[320px]' : 'max-w-[560px]'}">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={activeJob.url} controls loop autoplay muted playsinline class="w-full h-auto block"></video>
        </div>
        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-text-muted">
          <span class="inline-flex items-center gap-1"><CircleCheck size={12} class="text-success" /> 3–15s</span>
          <span class="inline-flex items-center gap-1"><CircleCheck size={12} class="text-success" /> No audio (Etsy mutes video)</span>
          <span class="inline-flex items-center gap-1"><CircleCheck size={12} class="text-success" /> {activeJob.aspect === "portrait" ? "Portrait" : "Landscape"}</span>
          <span class="inline-flex items-center gap-1"><CircleCheck size={12} class="text-success" /> Looping</span>
        </div>
      {:else}
        <div class="flex items-start gap-3">
          <CircleAlert size={18} class="text-danger mt-0.5" />
          <div>
            <p class="text-sm text-text-primary font-medium">This video couldn't be generated.</p>
            <p class="text-[0.8125rem] text-text-muted">VieRank AI couldn't finish this video. Your credits were refunded.</p>
            <button type="button" onclick={generate} class="copy-link mt-2 !text-teal inline-flex items-center gap-1"><RotateCcw size={12} /> Try again</button>
          </div>
        </div>
      {/if}
    </div>
  {:else if !error}
    <ToolEmpty mascot icon={Video} title="Your video will appear here" hint="Pick a hero shot and a clip type, then generate. Etsy allows one video per listing — we help you make the best one." />
  {/if}

  {#if history.length}
    <div class="border-t border-border-light pt-5">
      <p class="section-kicker mb-1">Your videos</p>
      <p class="text-[0.8125rem] text-text-muted mb-3">Kept on your account — reopen and download any time, no extra credits.</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {#each history as job (job.id)}
          <button type="button" onclick={() => openJob(job)}
            class="text-left rounded-lg border border-border hover:border-teal/50 transition-colors p-2.5">
            <div class="aspect-video rounded-md bg-bg-tint flex items-center justify-center mb-2 overflow-hidden relative">
              {#if job.status === "done" && job.url}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video src="{job.url}#t=0.001" preload="metadata" class="w-full h-full object-cover pointer-events-none" playsinline muted></video>
                <div class="absolute bottom-1.5 right-1.5 bg-black/60 rounded px-1 py-0.5 flex items-center justify-center text-white pointer-events-none">
                  <Play size={9} fill="currentColor" class="text-white" />
                </div>
              {:else if job.status === "pending"}
                <LoaderCircle size={18} class="animate-spin text-text-muted" />
              {:else}
                <CircleAlert size={18} class="text-danger" />
              {/if}
            </div>
            <p class="text-[0.8125rem] font-medium text-text-primary truncate">{clipLabel(job.clipType)}</p>
            <p class="text-[0.6875rem] text-text-muted">{fmtDate(job.createdAt)} · {job.status === "done" ? job.duration : job.status}</p>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</ToolPageLayout>

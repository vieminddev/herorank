<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import {
    WandSparkles,
    Check,
    ArrowRight,
    ArrowLeft,
    LoaderCircle,
    CircleAlert,
    Copy,
    Download,
    Video,
    Film,
    Store,
    Search,
    ExternalLink,
    Check as CheckIcon,
  } from "lucide-svelte";
  import { callTool, generateImages } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type TitleRow = { title: string; chars: number; score: number };
  type Level = "high" | "medium" | "low";
  type TagRow = { tag: string; competition: Level; searchVolume: Level };
  type TagResult = { tags: TagRow[]; materials: TagRow[]; styles: TagRow[] };
  type GeneratedImage = { b64?: string; url?: string };
  type ImageResult = { mode: string; label: string; prompt: string; images: GeneratedImage[] };

  const STEPS = ["Describe", "Title", "Tags", "Description", "Image"];

  let step = $state(0);
  let productDesc = $state("");

  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);

  // Step results
  let titles = $state<TitleRow[]>([]);
  let chosenTitle = $state("");
  let tags = $state<TagRow[]>([]);
  let chosenTags = $state<string[]>([]);
  let description = $state("");
  let images = $state<GeneratedImage[]>([]);

  // Remember the input each step's result was generated from, so navigating Back then forward
  // again does NOT re-run the AI (or re-charge credits) when nothing changed. A step only
  // regenerates when its relevant input differs from last time.
  let titlesFor = $state("");
  let tagsFor = $state("");
  let descFor = $state("");
  let imageFor = $state("");

  const srcOf = (img: GeneratedImage) => (img.b64 ? `data:image/png;base64,${img.b64}` : (img.url ?? ""));

  const fail = (res: { status: number; message: string }) => {
    if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
  };

  const generateTitles = async () => {
    if (!productDesc.trim() || loading) return;
    const input = productDesc.trim();
    // Already generated for this description → just move on, don't re-charge.
    if (titles.length && titlesFor === input) { step = 1; return; }
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<{ titles: TitleRow[] }>("title-generator", {
      description: input,
    });
    if (res.ok) {
      titles = res.data.titles ?? [];
      chosenTitle = titles[0]?.title ?? "";
      titlesFor = input;
      step = 1;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const generateTags = async () => {
    if (loading) return;
    const input = chosenTitle || productDesc.trim();
    // Tags depend on the chosen title — regenerate only if that changed.
    if (tags.length && tagsFor === input) { step = 2; return; }
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<TagResult>("tag-generator", {
      keyword: input,
      location: "Global",
    });
    if (res.ok) {
      tags = res.data.tags ?? [];
      chosenTags = tags.slice(0, 13).map((t) => t.tag);
      tagsFor = input;
      step = 2;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const generateDescription = async () => {
    if (loading) return;
    const input = productDesc.trim();
    if (description && descFor === input) { step = 3; return; }
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<{ description: string }>("description-generator", {
      productInfo: input,
      tone: "Friendly",
    });
    if (res.ok) {
      description = res.data.description ?? "";
      descFor = input;
      step = 3;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const generateImage = async () => {
    if (loading) return;
    const input = productDesc.trim();
    // Images are the priciest step (10 credits) — never re-charge on a Back→forward with no change.
    if (images.length && imageFor === input) { step = 4; return; }
    loading = true;
    error = null;
    needsUpgrade = false;
    // image-studio is async (job-based): generateImages submits then polls until the assets are
    // ready, returning the finished image URLs. Calling it raw via callTool returned the job
    // envelope (no `.images`) → the step charged credits but showed nothing.
    const res = await generateImages({
      mode: "mockup",
      productDesc: input,
      size: "1024x1024",
      n: 2,
    });
    if (res.ok) {
      images = res.data.images ?? [];
      imageFor = input;
      step = 4;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const toggleTag = (tag: string) => {
    if (chosenTags.includes(tag)) {
      chosenTags = chosenTags.filter((t) => t !== tag);
    } else if (chosenTags.length < 13) {
      chosenTags = [...chosenTags, tag];
    }
  };

  let copied = $state<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    copied = key;
    setTimeout(() => (copied = null), 2000);
  };

  const downloadImage = (img: GeneratedImage, idx: number) => {
    const src = srcOf(img);
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `listing-image-${idx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // === Create draft listing on Etsy (step 4 hand-off) ========================
  type ShipProfile = { id: number; title: string };
  type ShopCat = { taxonomyId: number; name: string };
  type TaxoResult = { taxonomyId: number; name: string; path: string | null };

  let showCreate = $state(false);
  let createMetaLoading = $state(false);
  let createNotConnected = $state(false);
  let createNeedsReconnect = $state(false);
  let createWriteEnabled = $state(true);
  let shipProfiles = $state<ShipProfile[]>([]);
  let shopCats = $state<ShopCat[]>([]);

  let cPrice = $state("");
  let cQty = $state(1);
  let cTaxonomyId = $state<number | null>(null);
  let cTaxonomyName = $state("");
  let cShippingId = $state<number | null>(null);

  let taxoQuery = $state("");
  let taxoResults = $state<TaxoResult[]>([]);
  let taxoSearching = $state(false);
  let taxoTimer: ReturnType<typeof setTimeout> | undefined;

  let creating = $state(false);
  let createError = $state<string | null>(null);
  let createdDraft = $state<{ url: string | null; imagesUploaded: number } | null>(null);

  const canCreate = $derived(
    !creating &&
      createWriteEnabled &&
      parseFloat(cPrice) > 0 &&
      cTaxonomyId != null &&
      cShippingId != null
  );

  const openCreate = async () => {
    showCreate = true;
    if (shipProfiles.length || shopCats.length || createMetaLoading) return;
    createMetaLoading = true;
    createNotConnected = false;
    createNeedsReconnect = false;
    createError = null;
    try {
      const res = await fetch("/api/my-shop/create-listing/meta");
      const body: any = await res.json().catch(() => null);
      if (res.ok) {
        shipProfiles = body?.shippingProfiles ?? [];
        shopCats = body?.shopCategories ?? [];
        createWriteEnabled = body?.writeEnabled ?? false;
        if (shipProfiles.length === 1) cShippingId = shipProfiles[0].id;
      } else if (res.status === 404) {
        createNotConnected = true;
      } else if (body?.error === "ETSY_REAUTH") {
        createNeedsReconnect = true;
      } else {
        createError = body?.message ?? "Could not load your shop settings.";
      }
    } catch {
      createError = "Could not reach the server. Please try again.";
    }
    createMetaLoading = false;
  };

  const onTaxoQuery = () => {
    clearTimeout(taxoTimer);
    const q = taxoQuery.trim();
    if (q.length < 2) {
      taxoResults = [];
      return;
    }
    taxoTimer = setTimeout(async () => {
      taxoSearching = true;
      try {
        const res = await fetch(`/api/my-shop/create-listing/taxonomy-search?q=${encodeURIComponent(q)}`);
        const body: any = await res.json().catch(() => null);
        taxoResults = res.ok ? (body?.results ?? []) : [];
      } catch {
        taxoResults = [];
      }
      taxoSearching = false;
    }, 300);
  };

  const pickTaxo = (taxonomyId: number, name: string) => {
    cTaxonomyId = taxonomyId;
    cTaxonomyName = name;
    taxoResults = [];
    taxoQuery = "";
  };

  const submitCreate = async () => {
    if (!canCreate) return;
    creating = true;
    createError = null;
    createdDraft = null;
    // Only real http(s) URLs can be fetched server-side for upload (data: URLs are skipped).
    const imageUrls = images
      .map((i) => i.url)
      .filter((u): u is string => !!u && u.startsWith("http"));
    try {
      const res = await fetch("/api/my-shop/create-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: chosenTitle,
          description,
          tags: chosenTags,
          price: parseFloat(cPrice),
          quantity: cQty,
          taxonomyId: cTaxonomyId,
          shippingProfileId: cShippingId,
          imageUrls,
        }),
      });
      const body: any = await res.json().catch(() => null);
      if (res.ok) {
        createdDraft = { url: body?.url ?? null, imagesUploaded: body?.imagesUploaded ?? 0 };
        await invalidateAll();
      } else if (res.status === 503) {
        createWriteEnabled = false;
        createError = body?.message ?? "Creating listings is awaiting Etsy write approval.";
      } else if (res.status === 404) {
        createNotConnected = true;
      } else if (body?.error === "ETSY_REAUTH") {
        createNeedsReconnect = true;
      } else {
        createError = body?.message ?? "Etsy could not create the draft. Please try again.";
      }
    } catch {
      createError = "Could not reach the server. Please try again.";
    }
    creating = false;
  };
</script>

<ToolPageLayout
  title="Listing Builder"
  description="Build a whole listing in one flow — title, tags, description, and a photo — each generated from your product, each yours to tweak."
  icon={WandSparkles}
  credits={14}
>
  <!-- Horizontal Stepper (Single Column UX) -->
  <div class="mb-6 p-4 bg-white border border-border rounded-xl shadow-sm">
    <div class="flex items-center justify-between gap-3 mb-3">
      <p class="section-kicker !mb-0">Build a full listing</p>
      <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-bg-page border border-border text-text-secondary text-[10px] font-bold rounded-full">Full build · up to 14 credits</span>
    </div>
    <ol class="flex flex-wrap items-center gap-x-6 gap-y-3">
      {#each STEPS as label, i}
        <li class="flex items-center gap-2">
          <span
            class="w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center transition-colors
                   {i < step
                     ? 'bg-success text-white'
                     : i === step
                       ? 'bg-teal text-white ring-4 ring-teal/15'
                       : 'bg-bg-page text-text-secondary border border-border'}"
          >
            {#if i < step}<Check size={12} />{:else}{i + 1}{/if}
          </span>
          <span class="text-xs font-semibold {i === step ? 'text-text-primary' : 'text-text-muted'}">{label}</span>
          
          {#if i < STEPS.length - 1}
            <span class="text-text-muted text-[10px] ml-2">→</span>
          {/if}
        </li>
      {/each}
    </ol>
  </div>

  {#if error}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
        {#if needsUpgrade}
          <a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>
        {/if}
      </div>
    </div>
  {/if}

  <div class="animate-fade-in">
    {#if step === 0}
      <p class="section-kicker mb-1">Step 1 · Describe your product</p>
      <p class="lead text-sm mb-4">A sentence or two — material, who it's for, the occasion. Everything else builds from this.</p>
      <textarea
        bind:value={productDesc}
        rows={6}
        placeholder="A hand-poured soy candle in an amber jar, lavender scent — a cozy housewarming gift…"
        class="field resize-none"
        maxlength="800"
      ></textarea>
      <button onclick={generateTitles} disabled={loading || !productDesc.trim()} class="btn btn-primary mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Working…{:else}Generate titles <ArrowRight size={15} />{/if}
      </button>
    {:else if step === 1}
      <p class="section-kicker mb-1">Step 2 · Pick a title</p>
      <p class="lead text-sm mb-4">Choose the one that fits — you can edit it later in your listing.</p>
      <div class="space-y-2">
        {#each titles as t}
          <label
            class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors {chosenTitle === t.title
              ? 'border-teal bg-teal/5'
              : 'border-border hover:border-text-muted'}"
          >
            <input type="radio" name="title" value={t.title} bind:group={chosenTitle} class="mt-1 accent-teal" />
            <span class="flex-1 min-w-0">
              <span class="block text-sm text-text-primary">{t.title}</span>
              <span class="block text-xs text-text-muted mt-0.5 tabular-nums">{t.chars} chars · score {t.score}</span>
            </span>
          </label>
        {/each}
      </div>
      <div class="flex gap-2 mt-4">
        <button onclick={() => (step = 0)} class="btn btn-secondary"><ArrowLeft size={15} /> Back</button>
        <button onclick={generateTags} disabled={loading || !chosenTitle} class="btn btn-primary">
          {#if loading}<LoaderCircle size={14} class="animate-spin" /> Working…{:else}Generate tags <ArrowRight size={15} />{/if}
        </button>
      </div>
    {:else if step === 2}
      <p class="section-kicker mb-1">Step 3 · Choose your tags</p>
      <p class="lead text-sm mb-4">Etsy allows up to 13 tags. Tap to add or remove — {chosenTags.length}/13 selected.</p>
      <div class="flex flex-wrap gap-2">
        {#each tags as t}
          <button
            type="button"
            onclick={() => toggleTag(t.tag)}
            class="px-3 py-1.5 rounded-full text-sm border transition-colors {chosenTags.includes(t.tag)
              ? 'border-teal bg-teal/10 text-teal'
              : 'border-border text-text-secondary hover:border-text-muted'}"
          >
            {t.tag}
          </button>
        {/each}
      </div>
      <div class="flex gap-2 mt-5">
        <button onclick={() => (step = 1)} class="btn btn-secondary"><ArrowLeft size={15} /> Back</button>
        <button onclick={generateDescription} disabled={loading} class="btn btn-primary">
          {#if loading}<LoaderCircle size={14} class="animate-spin" /> Working…{:else}Write description <ArrowRight size={15} />{/if}
        </button>
      </div>
    {:else if step === 3}
      <p class="section-kicker mb-1">Step 4 · Your description</p>
      <p class="lead text-sm mb-4">A warm, keyword-aware draft — read it over and make it yours.</p>
      <pre class="text-[0.9375rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans border border-border bg-bg-page/40 p-4 rounded-lg">{description}</pre>
      <button type="button" onclick={() => copy(description, 'desc')} class="copy-link mt-3">
        {#if copied === 'desc'}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
      </button>
      <div class="flex gap-2 mt-5">
        <button onclick={() => (step = 2)} class="btn btn-secondary"><ArrowLeft size={15} /> Back</button>
        <button onclick={generateImage} disabled={loading} class="btn btn-primary">
          {#if loading}<LoaderCircle size={14} class="animate-spin" /> Working…{:else}Generate image <ArrowRight size={15} />{/if}
        </button>
      </div>
    {:else if step === 4}
      <p class="section-kicker mb-1">Your listing is ready</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">Everything in one place — copy what you need.</h2>

      <div class="space-y-6">
        <div>
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <p class="section-kicker">Title</p>
            <button type="button" onclick={() => copy(chosenTitle, 'title')} class="copy-link">
              {#if copied === 'title'}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
            </button>
          </div>
          <p class="text-sm text-text-primary">{chosenTitle}</p>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <p class="section-kicker">Tags</p>
            <button type="button" onclick={() => copy(chosenTags.join(', '), 'tags')} class="copy-link">
              {#if copied === 'tags'}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each chosenTags as tag}
              <span class="px-3 py-1 rounded-full text-sm border border-border text-text-secondary">{tag}</span>
            {/each}
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <p class="section-kicker">Description</p>
            <button type="button" onclick={() => copy(description, 'desc2')} class="copy-link">
              {#if copied === 'desc2'}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
            </button>
          </div>
          <pre class="text-[0.9375rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans border border-border bg-bg-page/40 p-4 rounded-lg">{description}</pre>
        </div>

        {#if images.length}
          <div>
            <p class="section-kicker mb-2">Image</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {#each images as img, i}
                <div class="group relative rounded-lg border border-border overflow-hidden bg-bg-page/40">
                  <img src={srcOf(img)} alt="Listing image {i + 1}" loading="lazy" class="w-full aspect-square object-cover" />
                  <button
                    type="button"
                    onclick={() => downloadImage(img, i)}
                    class="btn btn-secondary absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Download size={13} /> Download
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Primary next action: push the finished listing to Etsy as a DRAFT (review + publish there). -->
        <div class="card-accent rounded-lg p-5">
          {#if createdDraft}
            <div class="flex items-start gap-3">
              <CheckIcon size={18} class="text-success shrink-0 mt-0.5" />
              <div class="flex-1">
                <h3 class="text-base font-semibold text-text-primary mb-1">Draft created on Etsy 🎉</h3>
                <p class="lead text-sm mb-3">
                  Your listing is saved as a draft{createdDraft.imagesUploaded > 0 ? ` with ${createdDraft.imagesUploaded} photo${createdDraft.imagesUploaded > 1 ? "s" : ""}` : ""}. Review the details and publish it on Etsy.
                </p>
                {#if createdDraft.url}
                  <a href={createdDraft.url} target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                    Finish on Etsy <ExternalLink size={14} />
                  </a>
                {/if}
                {#if createdDraft.imagesUploaded === 0 && images.length}
                  <p class="field-hint mt-2">Add your photos on Etsy — they couldn't be transferred automatically.</p>
                {/if}
              </div>
            </div>
          {:else}
            <p class="section-kicker mb-1">Publish</p>
            <h3 class="text-base font-semibold text-text-primary mb-1">Create this draft on Etsy</h3>
            <p class="lead text-sm mb-4">Push the title, tags, description{images.length ? " and photos" : ""} straight to your shop as a <strong>draft</strong> — review and publish it on Etsy.</p>

            {#if !showCreate}
              <button type="button" onclick={openCreate} class="btn btn-primary">
                <Store size={15} /> Create draft on Etsy
              </button>
            {:else if createMetaLoading}
              <div class="flex items-center gap-2 text-sm text-text-muted"><LoaderCircle size={15} class="animate-spin" /> Loading your shop settings…</div>
            {:else if createNotConnected}
              <div class="rounded-lg border border-warning/40 bg-warning/5 p-3.5">
                <p class="text-sm font-medium text-text-primary mb-1">Connect your Etsy shop first</p>
                <p class="text-[0.8125rem] text-text-secondary mb-2">Creating a draft writes to your shop, so we need a connection.</p>
                <a href="/settings/connections" class="btn btn-secondary !py-1.5">Connect your shop →</a>
              </div>
            {:else if createNeedsReconnect}
              <div class="rounded-lg border border-warning/40 bg-warning/5 p-3.5">
                <p class="text-sm font-medium text-text-primary mb-1">Reconnect your Etsy shop</p>
                <p class="text-[0.8125rem] text-text-secondary mb-2">Your Etsy connection expired. Reconnect to publish drafts.</p>
                <a href="/settings/connections" class="btn btn-secondary !py-1.5">Reconnect your shop →</a>
              </div>
            {:else if !createWriteEnabled}
              <div class="rounded-lg border border-warning/40 bg-warning/5 p-3.5">
                <p class="text-sm font-medium text-text-primary mb-1">Awaiting Etsy write approval</p>
                <p class="text-[0.8125rem] text-text-secondary">Creating listings switches on automatically once Etsy grants write access.</p>
              </div>
            {:else}
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label for="c-price" class="field-label">Price (USD)</label>
                    <input id="c-price" type="number" min="0.20" step="0.01" bind:value={cPrice} placeholder="0.00" class="field" />
                  </div>
                  <div>
                    <label for="c-qty" class="field-label">Quantity</label>
                    <input id="c-qty" type="number" min="1" max="999" step="1" bind:value={cQty} class="field" />
                  </div>
                </div>

                <div>
                  <p class="field-label">Category</p>
                  {#if cTaxonomyId}
                    <div class="flex items-center gap-2 rounded-lg border border-teal/50 bg-teal/5 px-3 py-2">
                      <CheckIcon size={14} class="text-teal shrink-0" />
                      <span class="text-sm text-text-primary flex-1 min-w-0 truncate">{cTaxonomyName}</span>
                      <button type="button" onclick={() => { cTaxonomyId = null; cTaxonomyName = ''; }} class="copy-link !text-text-muted hover:!text-teal text-xs">Change</button>
                    </div>
                  {:else}
                    {#if shopCats.length}
                      <p class="field-hint mb-1.5">Pick one you already use, or search below.</p>
                      <div class="flex flex-wrap gap-1.5 mb-2">
                        {#each shopCats as cat (cat.taxonomyId)}
                          <button type="button" onclick={() => pickTaxo(cat.taxonomyId, cat.name)} class="px-2.5 py-1 rounded-full text-[0.8125rem] border border-border text-text-secondary hover:border-teal hover:text-teal transition-colors">{cat.name}</button>
                        {/each}
                      </div>
                    {/if}
                    <div class="relative">
                      <div class="flex items-center gap-2 field !py-0 !pr-2">
                        <Search size={14} class="text-text-muted shrink-0" />
                        <input type="text" bind:value={taxoQuery} oninput={onTaxoQuery} placeholder="Search Etsy categories…" class="flex-1 bg-transparent border-0 outline-none py-2 text-sm" />
                        {#if taxoSearching}<LoaderCircle size={13} class="animate-spin text-text-muted shrink-0" />{/if}
                      </div>
                      {#if taxoResults.length}
                        <div class="mt-1 rounded-lg border border-border bg-white shadow-sm max-h-52 overflow-y-auto">
                          {#each taxoResults as r (r.taxonomyId)}
                            <button type="button" onclick={() => pickTaxo(r.taxonomyId, r.name)} class="block w-full text-left px-3 py-2 text-sm hover:bg-bg-page transition-colors">
                              <span class="text-text-primary">{r.name}</span>
                              {#if r.path}<span class="text-text-muted text-xs"> · {r.path}</span>{/if}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div>
                  <label for="c-ship" class="field-label">Shipping profile</label>
                  {#if shipProfiles.length}
                    <select id="c-ship" bind:value={cShippingId} class="field appearance-none cursor-pointer">
                      <option value={null} disabled>Choose a shipping profile…</option>
                      {#each shipProfiles as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
                    </select>
                  {:else}
                    <p class="field-hint">No shipping profiles found. Create one in your Etsy shop settings first, then come back.</p>
                  {/if}
                </div>

                {#if createError}
                  <div class="flex items-start gap-2 text-[0.8125rem] text-danger"><CircleAlert size={14} class="shrink-0 mt-0.5" /><span>{createError}</span></div>
                {/if}

                <button type="button" onclick={submitCreate} disabled={!canCreate} class="btn btn-primary w-full justify-center">
                  {#if creating}<LoaderCircle size={14} class="animate-spin" /> Creating draft…{:else}<Store size={15} /> Create draft on Etsy{/if}
                </button>
                <p class="field-hint text-center !-mt-1.5">Creates a <strong>draft</strong> — nothing goes live until you publish it on Etsy.</p>
              </div>
            {/if}
          {/if}
        </div>

        <!-- Optional hand-off: add a video. Kept OUT of the wizard on purpose — AI video is slow
             (async, minutes) + pricey (20 cr); slideshow is free. The listing is already done, so
             this is a one-click next step, not a forced step that inflates cost/latency. -->
        <div class="card-accent rounded-lg p-5">
          <p class="section-kicker mb-1">One more thing</p>
          <h3 class="text-base font-semibold text-text-primary mb-1">Add a video for this listing</h3>
          <p class="lead text-sm mb-4">Etsy surfaces listing videos in search and feeds — they tend to pull more views. Optional; the rest of your listing is ready to paste.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href="/tools/video-generator" class="flex items-start gap-3 p-3 rounded-lg border border-border bg-white hover:border-teal/40 transition-colors">
              <Video size={18} class="text-teal shrink-0 mt-0.5" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-text-primary">Slideshow from photos <span class="text-[11px] font-semibold text-success">· Free</span></span>
                <span class="block text-xs text-text-muted mt-0.5">Turn your product photos into a quick listing video.</span>
              </span>
            </a>
            <a href="/tools/video-studio" class="flex items-start gap-3 p-3 rounded-lg border border-border bg-white hover:border-teal/40 transition-colors">
              <Film size={18} class="text-teal shrink-0 mt-0.5" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-text-primary">AI video <span class="text-[11px] font-semibold text-text-muted">· 20 cr</span></span>
                <span class="block text-xs text-text-muted mt-0.5">Generate a short AI product video from a prompt.</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    {/if}
  </div>
</ToolPageLayout>

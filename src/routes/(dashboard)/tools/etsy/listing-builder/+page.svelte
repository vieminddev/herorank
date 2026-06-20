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
  } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
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
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<{ titles: TitleRow[] }>("title-generator", {
      description: productDesc.trim(),
    });
    if (res.ok) {
      titles = res.data.titles ?? [];
      chosenTitle = titles[0]?.title ?? "";
      step = 1;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const generateTags = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<TagResult>("tag-generator", {
      keyword: chosenTitle || productDesc.trim(),
      location: "Global",
    });
    if (res.ok) {
      tags = res.data.tags ?? [];
      chosenTags = tags.slice(0, 13).map((t) => t.tag);
      step = 2;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const generateDescription = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<{ description: string }>("description-generator", {
      productInfo: productDesc.trim(),
      tone: "Friendly",
    });
    if (res.ok) {
      description = res.data.description ?? "";
      step = 3;
      await invalidateAll();
    } else fail(res);
    loading = false;
  };

  const generateImage = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    const res = await callTool<ImageResult>("image-studio", {
      mode: "mockup",
      productDesc: productDesc.trim(),
      size: "1024x1024",
      n: 2,
    });
    if (res.ok) {
      images = res.data.images ?? [];
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
</script>

<ToolPageLayout
  title="Listing Builder"
  prefix="Etsy"
  description="Build a whole listing in one flow — title, tags, description, and a photo — each generated from your product, each yours to tweak."
  icon={WandSparkles}
  credits={9}
>
  {#snippet controls()}
    <p class="section-kicker mb-3">Steps</p>
    <ol class="space-y-1">
      {#each STEPS as label, i}
        <li class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg {i === step ? 'bg-teal/8' : ''}">
          <span
            class="w-5 h-5 rounded-full text-[0.6875rem] font-semibold flex items-center justify-center {i < step
              ? 'bg-success text-white'
              : i === step
                ? 'bg-teal text-white'
                : 'bg-surface-2 text-text-muted'}"
          >
            {#if i < step}<Check size={11} />{:else}{i + 1}{/if}
          </span>
          <span class="text-sm {i === step ? 'text-text-primary font-medium' : 'text-text-secondary'}">{label}</span>
        </li>
      {/each}
    </ol>
  {/snippet}

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
      </div>
    {/if}
  </div>
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Image, LoaderCircle, CircleAlert, Download } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type GeneratedImage = { b64?: string; url?: string };
  type ImageResult = { mode: string; label: string; prompt: string; images: GeneratedImage[] };

  const MODES = [
    { value: "mockup", label: "Studio mockup", hint: "Clean catalog-style product shot on a seamless background." },
    { value: "lifestyle", label: "Lifestyle scene", hint: "Your product staged in a warm, real-world setting." },
    { value: "remove-bg", label: "White background", hint: "Isolate the product on pure white (prompt-based — best effort)." },
  ];

  const SIZES = [
    { value: "1024x1024", label: "Square 1:1" },
    { value: "1024x1792", label: "Portrait 9:16" },
    { value: "1792x1024", label: "Landscape 16:9" },
  ];

  let mode = $state("mockup");
  let productDesc = $state("");
  let style = $state("");
  let size = $state("1024x1024");
  let count = $state(2);

  let result = $state<ImageResult | null>(null);
  let hasGenerated = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);

  const srcOf = (img: GeneratedImage) => (img.b64 ? `data:image/png;base64,${img.b64}` : (img.url ?? ""));

  const handleGenerate = async (e: Event) => {
    e.preventDefault();
    if (!productDesc.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<ImageResult>("image-studio", {
      mode,
      productDesc: productDesc.trim(),
      style: style.trim() || undefined,
      size,
      n: count,
    });

    if (res.ok) {
      result = res.data;
      hasGenerated = true;
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };

  const downloadImage = (img: GeneratedImage, idx: number) => {
    const src = srcOf(img);
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `image-studio-${idx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
</script>

<ToolPageLayout
  title="AI Image Studio"
  prefix="Etsy"
  description="Turn a sentence into listing-ready photos. Describe your product and pick a look — a studio mockup, a lifestyle scene, or a clean white-background packshot."
  icon={Image}
  credits={5}
>
  {#snippet controls()}
    <form onsubmit={handleGenerate}>
      <p class="section-kicker mb-3">The look</p>
      <div class="space-y-2 mb-5">
        {#each MODES as m}
          <label
            class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors {mode === m.value
              ? 'border-teal bg-teal/5'
              : 'border-border hover:border-text-muted'}"
          >
            <input type="radio" name="mode" value={m.value} bind:group={mode} class="mt-1 accent-teal" />
            <span>
              <span class="block text-sm font-medium text-text-primary">{m.label}</span>
              <span class="block text-[0.8125rem] text-text-muted mt-0.5">{m.hint}</span>
            </span>
          </label>
        {/each}
      </div>

      <label for="img-desc" class="field-label">What's the product?</label>
      <textarea
        id="img-desc"
        bind:value={productDesc}
        placeholder="A hand-poured soy candle in an amber glass jar, lavender scent…"
        rows={4}
        class="field resize-none"
        maxlength="800"
      ></textarea>

      <label for="img-style" class="field-label mt-4">Style / mood <span class="text-text-muted font-normal">(optional)</span></label>
      <input id="img-style" bind:value={style} placeholder="rustic, warm tones, cozy" class="field" maxlength="300" />

      <div class="grid grid-cols-2 gap-3 mt-4">
        <div>
          <label for="img-size" class="field-label">Aspect</label>
          <select id="img-size" bind:value={size} class="field appearance-none cursor-pointer">
            {#each SIZES as s}
              <option value={s.value}>{s.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="img-count" class="field-label">How many</label>
          <select id="img-count" bind:value={count} class="field appearance-none cursor-pointer">
            {#each [1, 2, 3, 4] as n}
              <option value={n}>{n}</option>
            {/each}
          </select>
        </div>
      </div>

      <button type="submit" disabled={loading || !productDesc.trim()} class="btn btn-primary w-full justify-center mt-5">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Generating…{:else}Generate images{/if}
      </button>
      <p class="field-hint">Images are AI-generated. Review for accuracy before publishing.</p>
    </form>
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

  {#if hasGenerated && result && result.images.length}
    <div class="animate-fade-in">
      <p class="section-kicker mb-1">{result.label}</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Your images are ready</h2>
      <p class="lead text-sm mb-5">Download the ones you like and drop them straight into your listing.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each result.images as img, i}
          <div class="group relative rounded-lg border border-border overflow-hidden bg-bg-page/40">
            <img src={srcOf(img)} alt="{result.label} {i + 1}" loading="lazy" class="w-full aspect-square object-cover" />
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
  {:else if !error}
    <ToolEmpty
      icon={Image}
      title="Your images will appear here"
      hint="Describe your product and choose a look on the left — we'll generate a few you can download and use."
    />
  {/if}
</ToolPageLayout>

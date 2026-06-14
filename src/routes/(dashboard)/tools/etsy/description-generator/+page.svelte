<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Copy, Check, LoaderCircle, CircleAlert, FileText } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  let productInfo = $state("");
  let tone = $state("Friendly");
  let generated = $state("");
  let hasGenerated = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let copied = $state(false);

  const TONES = ["Friendly", "Informative", "Short & Sweet", "Professional", "Creative"];

  const wordCount = $derived(generated ? generated.trim().split(/\s+/).filter(Boolean).length : 0);
  const charCount = $derived(generated ? generated.length : 0);

  const handleGenerate = async (e: Event) => {
    e.preventDefault();
    if (!productInfo.trim() || loading || productInfo.length > 2000) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ description: string }>("description-generator", {
      productInfo: productInfo.trim(),
      tone,
    });

    if (res.ok) {
      generated = res.data.description ?? "";
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

  const copyDesc = () => {
    navigator.clipboard.writeText(generated);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };
</script>

<ToolPageLayout
  title="Description Writer"
  description="Tell us about your piece and we'll write the listing copy for you — a warm, keyword-aware draft you can read over, tweak, and paste in."
  icon={FileText}
  credits={1}
>
  {#snippet controls()}
    <form onsubmit={handleGenerate}>
      <label for="desc-product-details" class="field-label">Tell us about your product</label>
      <textarea
        id="desc-product-details"
        bind:value={productInfo}
        placeholder="What it is, the materials and colors, the sizes, who it's for, and what makes it yours…"
        rows={6}
        class="field resize-none {productInfo.length > 2000 ? 'border-danger focus:border-danger' : ''}"
        maxlength="2200"
      ></textarea>
      <div class="flex justify-between items-start gap-4 mt-1.5">
        <p class="field-hint !mt-0 flex-1">The more you share, the more it sounds like you.</p>
        <span class="text-[0.8125rem] tabular-nums shrink-0 {productInfo.length > 2000 ? 'text-danger font-semibold' : 'text-text-muted'}">
          {productInfo.length}/2000
        </span>
      </div>

      <label for="desc-tone" class="field-label mt-4">Writing Tone</label>
      <select
        id="desc-tone"
        bind:value={tone}
        class="field appearance-none cursor-pointer"
      >
        {#each TONES as t}
          <option value={t}>{t}</option>
        {/each}
      </select>

      <button type="submit" disabled={loading || !productInfo.trim() || productInfo.length > 2000} class="btn btn-primary w-full justify-center mt-5">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Writing…{:else}Write it{/if}
      </button>
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

  {#if hasGenerated && generated}
    <div class="animate-fade-in">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <p class="section-kicker mb-1">Your draft · {tone} Tone</p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">A description, ready to paste</h2>
          <p class="lead text-sm">Read it over, make it yours, then drop it into your listing.</p>
        </div>
        <button type="button" onclick={copyDesc} class="copy-link shrink-0 pt-1">
          {#if copied}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
        </button>
      </div>
      <div class="text-xs text-text-muted mb-4 flex gap-3 tabular-nums font-mono">
        <span>{charCount} characters</span>
        <span>•</span>
        <span>{wordCount} words</span>
      </div>
      <pre class="text-[0.9375rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans border border-border bg-bg-page/40 p-4 rounded-lg">{generated}</pre>
    </div>
  {:else if !error}
    <ToolEmpty icon={FileText} title="Your description will appear here" hint="Tell us about your piece on the left and we'll write a warm, keyword-aware draft you can read over, tweak, and paste straight into your listing.">
      {#snippet preview()}
        <pre class="text-[0.8125rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans">Handmade with care, this dainty gold-plated name necklace is the kind of little detail that makes a gift feel personal. Each piece is finished by hand, so the lettering sits clean and catches the light just so — perfect for a birthday, a bridesmaid, or simply treating yourself.</pre>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

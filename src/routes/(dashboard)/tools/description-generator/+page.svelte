<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Copy, Check, LoaderCircle, CircleAlert, FileText, CircleCheck, TriangleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type DescCheck = { id: string; label: string; status: "pass" | "warn"; detail: string; etsyRule: string };
  type DescriptionAudit = { checks: DescCheck[]; metaPreview: string; metaChars: number; firstSentence: string; wordCount: number; charCount: number };

  let productInfo = $state("");
  let tone = $state("Friendly");
  let generated = $state("");
  let audit = $state<DescriptionAudit | null>(null);
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

    const res = await callTool<{ description: string; audit?: DescriptionAudit }>("description-generator", {
      productInfo: productInfo.trim(),
      tone,
    });

    if (res.ok) {
      generated = res.data.description ?? "";
      audit = res.data.audit ?? null;
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
  description="Tell us about your piece and we'll write the listing copy for you — then check it against Etsy's own description guidance and preview how it'll read as your Google search snippet."
  icon={FileText}
  credits={2}
>
  {#snippet controls()}
    <form onsubmit={handleGenerate}>
      <div class="flex justify-between items-baseline mb-1">
        <label for="desc-product-details" class="field-label !mb-0">Tell us about your product</label>
        <span class="text-[0.8125rem] tabular-nums {productInfo.length > 2000 ? 'text-danger font-semibold' : 'text-text-muted'}">
          {productInfo.length}/2000
        </span>
      </div>
      <textarea
        id="desc-product-details"
        bind:value={productInfo}
        placeholder="What it is, the materials and colors, the sizes, who it's for, and what makes it yours…"
        rows={6}
        class="field resize-none {productInfo.length > 2000 ? 'border-danger focus:border-danger' : ''}"
        maxlength="2200"
      ></textarea>
      <p class="field-hint mt-1.5">The more you share, the more it sounds like you.</p>

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

      {#if audit}
        <!-- Google snippet preview: Etsy uses the first 160 chars as the page meta description -->
        <div class="card p-4 mb-4">
          <p class="section-kicker mb-2">How it looks in Google search</p>
          <div class="rounded-lg border border-border bg-bg-page p-3">
            <p class="text-[0.8125rem] text-teal truncate">{tone} listing — Etsy</p>
            <p class="text-[0.8125rem] text-text-muted truncate">www.etsy.com › listing</p>
            <p class="text-sm text-text-primary leading-snug mt-0.5">{audit.metaPreview}{audit.charCount > audit.metaChars ? "…" : ""}</p>
          </div>
          <p class="field-hint mt-2">Etsy turns your first {audit.metaChars} characters into this snippet — keep it clear and keyword-aware.</p>
        </div>

        <!-- Etsy-rule audit: deterministic, traceable to Etsy's guidance (not an AI guess) -->
        <div class="card p-5 mb-4">
          <div class="flex items-baseline justify-between gap-3 mb-3">
            <p class="section-kicker !mb-0">Checked against Etsy's description rules</p>
            <a href="https://www.etsy.com/seller-handbook/article/1347574487014" target="_blank" rel="noopener" class="copy-link !text-text-muted hover:!text-teal text-[0.75rem]">Etsy Seller Handbook ↗</a>
          </div>
          <div class="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {#each audit.checks as check (check.id)}
              <div class="flex items-start gap-2.5">
                {#if check.status === "pass"}
                  <CircleCheck size={16} class="text-success shrink-0 mt-0.5" />
                {:else}
                  <TriangleAlert size={16} class="text-warning shrink-0 mt-0.5" />
                {/if}
                <div class="min-w-0">
                  <p class="text-sm text-text-primary font-medium">{check.label}</p>
                  <p class="text-[0.8125rem] text-text-secondary leading-snug">{check.detail}</p>
                  <p class="text-[0.75rem] text-text-muted leading-snug mt-0.5 italic">{check.etsyRule}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="card p-5">
        <pre class="text-[0.9375rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans">{generated}</pre>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty icon={FileText} title="Your description will appear here" hint="Tell us about your piece on the left and we'll write a warm, keyword-aware draft you can read over, tweak, and paste straight into your listing.">
      {#snippet preview()}
        <pre class="text-[0.8125rem] text-text-primary whitespace-pre-wrap leading-relaxed font-sans">Handmade with care, this dainty gold-plated name necklace is the kind of little detail that makes a gift feel personal. Each piece is finished by hand, so the lettering sits clean and catches the light just so — perfect for a birthday, a bridesmaid, or simply treating yourself.</pre>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

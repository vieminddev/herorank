<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Copy, Check, LoaderCircle, CircleAlert, Type } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type TitleRow = { title: string; chars: number; score: number };

  let description = $state("");
  let titles = $state<TitleRow[]>([]);
  let hasGenerated = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let copiedIdx = $state<number | null>(null);

  const handleGenerate = async (e: Event) => {
    e.preventDefault();
    if (!description.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ titles: TitleRow[] }>("title-generator", {
      description: description.trim(),
    });

    if (res.ok) {
      titles = res.data.titles ?? [];
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

  const copyTitle = (title: string, idx: number) => {
    navigator.clipboard.writeText(title);
    copiedIdx = idx;
    setTimeout(() => (copiedIdx = null), 2000);
  };

  const strength = (s: number) => (s >= 90 ? "strong" : s >= 80 ? "decent" : "weak");
</script>

<ToolPageLayout
  title="Title Generator"
  description="A good title is how buyers find you. Describe what you're selling and we'll draft a few, each scored so you can pick the one that fits."
  icon={Type}
  credits={1}
>
  {#snippet controls()}
    <form onsubmit={handleGenerate}>
      <label for="title-description" class="field-label">What are you selling?</label>
      <textarea
        id="title-description"
        bind:value={description}
        placeholder="A dainty gold-plated name necklace — a birthday or bridesmaid gift…"
        rows={5}
        class="field resize-none {description.length > 500 ? 'border-danger focus:border-danger focus:box-shadow-[0_0_0_3px_rgba(192,57,43,0.12)]' : ''}"
        maxlength="600"
      ></textarea>
      <div class="flex justify-between items-start gap-4 mt-1.5">
         <p class="field-hint !mt-0 flex-1">A sentence or two is plenty. Mention the material, who it's for, and the occasion.</p>
         <span class="text-[0.8125rem] tabular-nums shrink-0 {description.length > 500 ? 'text-danger font-semibold' : 'text-text-muted'}">
           {description.length}/500
         </span>
       </div>
      <button type="submit" disabled={loading || !description.trim() || description.length > 500} class="btn btn-primary w-full justify-center mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Writing…{:else}Draft titles{/if}
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

  {#if hasGenerated && titles.length}
    <div class="animate-fade-in">
      <p class="section-kicker mb-1">Your drafts</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">{titles.length} titles to try</h2>
      <p class="lead text-sm mb-5">Pick one, tweak it, paste it into your listing.</p>
      <div class="entry-list">
        {#each titles as item, i (i)}
          <div class="entry group">
            <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
            <div class="flex-1 min-w-0">
              <p class="text-[0.9375rem] text-text-primary leading-relaxed">{item.title}</p>
              <p class="entry-meta mt-1.5">
                <span style="color: {item.score >= 90 ? 'var(--success)' : item.score >= 80 ? 'var(--warning)' : 'var(--danger)'}">{strength(item.score)} · {item.score}</span>
                <span class="text-border mx-2">·</span>
                {item.chars}/140 characters
              </p>
            </div>
            <button type="button" onclick={() => copyTitle(item.title, i)} class="copy-link shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
              {#if copiedIdx === i}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
            </button>
          </div>
        {/each}
      </div>
    </div>
  {:else if !error}
    <ToolEmpty icon={Type} title="Your titles will appear here" hint="Describe your product on the left and we'll draft a few — each scored, so you can pick the one that fits.">
      {#snippet preview()}
        <div class="entry-list">
          {#each [{ t: "Handmade Ceramic Coffee Mug · Rustic Blue Pottery", n: 95 }, { t: "Rustic Blue Pottery Mug · Gift for Coffee Lovers", n: 90 }] as ex, i (i)}
            <div class="entry !py-2.5">
              <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] text-text-primary leading-snug">{ex.t}</p>
                <p class="entry-meta mt-1">strong · {ex.n}</p>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Copy, Check, LoaderCircle, CircleAlert, Type, ChevronDown } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type BreakdownItem = { label: string; points: number; max: number; note: string; etsyRule?: string };
  type TitleRow = { title: string; chars: number; score: number; breakdown: BreakdownItem[] };

  let description = $state("");
  let titles = $state<TitleRow[]>([]);
  let focusTerms = $state<string[]>([]);
  let hasGenerated = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let copiedIdx = $state<number | null>(null);
  let openIdx = $state<number | null>(null);

  const handleGenerate = async (e: Event) => {
    e.preventDefault();
    if (!description.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ titles: TitleRow[]; focusTerms?: string[] }>("title-generator", {
      description: description.trim(),
    });

    if (res.ok) {
      titles = res.data.titles ?? [];
      focusTerms = res.data.focusTerms ?? [];
      hasGenerated = true;
      openIdx = null;
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

  const strength = (s: number) => (s >= 90 ? "strong" : s >= 75 ? "decent" : s >= 55 ? "fair" : "weak");
  const scoreColor = (s: number) =>
    s >= 90 ? "var(--success)" : s >= 75 ? "var(--warning)" : "var(--danger)";
</script>

<ToolPageLayout
  title="Title Generator"
  description="A good title is how buyers find you. Describe what you're selling and we'll draft a few — each scored against Etsy's own listing-title guidance, so you can see exactly why one beats another."
  icon={Type}
  credits={1}
>
  {#snippet controls()}
    <form onsubmit={handleGenerate}>
      <div class="flex justify-between items-baseline mb-1">
        <label for="title-description" class="field-label !mb-0">What are you selling?</label>
        <span class="text-[0.8125rem] tabular-nums {description.length > 500 ? 'text-danger font-semibold' : 'text-text-muted'}">
          {description.length}/500
        </span>
      </div>
      <textarea
        id="title-description"
        bind:value={description}
        placeholder="A dainty gold-plated name necklace — a birthday or bridesmaid gift…"
        rows={5}
        class="field resize-none {description.length > 500 ? 'border-danger focus:border-danger focus:box-shadow-[0_0_0_3px_rgba(192,57,43,0.12)]' : ''}"
        maxlength="500"
      ></textarea>
      <p class="field-hint mt-1.5">A sentence or two is plenty. Mention the material, who it's for, and the occasion.</p>
      <button type="submit" disabled={loading || !description.trim() || description.length > 500} class="btn btn-primary w-full justify-center mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Writing…{:else}Draft titles{/if}
      </button>

      {#if hasGenerated && focusTerms.length}
        <div class="mt-5 pt-4 border-t border-border">
          <p class="section-kicker mb-2">Keywords we scored against</p>
          <div class="flex flex-wrap gap-1.5">
            {#each focusTerms as term, i (term + "-" + i)}
              <span class="inline-flex items-center rounded-md bg-bg-page border border-border px-2 py-0.5 text-[0.75rem] text-text-secondary">{term}</span>
            {/each}
          </div>
          <p class="field-hint mt-2">Pulled from your description. Titles score higher when they front-load and cover these.</p>
        </div>
      {/if}
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
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">{titles.length} titles, ranked by Etsy's title guidance</h2>
      <p class="lead text-sm mb-5">Each score follows <a href="https://www.etsy.com/seller-handbook/article/1399426136697" target="_blank" rel="noopener" class="copy-link !text-teal">Etsy's listing-title guidance ↗</a> — click <span class="font-medium text-text-secondary">Why this score</span> on any title to see every rule.</p>
      <div class="card p-5">
        <div class="entry-list">
          {#each titles as item, i (i)}
            <div class="entry-block">
              <div class="entry group">
                <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-[0.9375rem] text-text-primary leading-relaxed">{item.title}</p>
                  <p class="entry-meta mt-1.5 flex items-center flex-wrap gap-x-1">
                    <span class="font-semibold tabular-nums" style="color: {scoreColor(item.score)}">SEO {item.score}</span>
                    <span class="text-text-muted">· {strength(item.score)}</span>
                    <span class="text-border mx-1">·</span>
                    <span class="tabular-nums {item.chars > 140 ? 'text-danger' : 'text-text-muted'}">{item.chars}/140 characters</span>
                    <button
                      type="button"
                      onclick={() => (openIdx = openIdx === i ? null : i)}
                      class="copy-link ml-2 !text-text-muted hover:!text-teal"
                      aria-expanded={openIdx === i}
                    >
                      <ChevronDown size={12} class="transition-transform {openIdx === i ? 'rotate-180' : ''}" />
                      Why this score
                    </button>
                  </p>
                </div>
                <button type="button" onclick={() => copyTitle(item.title, i)} class="copy-link shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
                  {#if copiedIdx === i}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
                </button>
              </div>

              {#if openIdx === i}
                <div class="mt-2 ml-9 mr-1 rounded-lg bg-bg-page border border-border p-4 animate-fade-in">
                  <div class="space-y-2.5">
                    {#each item.breakdown as b (b.label)}
                      {@const pct = b.max ? Math.round((b.points / b.max) * 100) : 0}
                      <div>
                        <div class="flex items-center justify-between text-[0.8125rem] mb-1">
                          <span class="text-text-secondary">{b.label}</span>
                          <span class="tabular-nums text-text-muted">{b.points}/{b.max}</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all"
                            style="width: {pct}%; background: {pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'}"
                          ></div>
                        </div>
                        <p class="text-[0.75rem] text-text-muted mt-1 leading-snug">{b.note}</p>
                        {#if b.etsyRule}
                          <p class="text-[0.6875rem] text-text-muted mt-0.5 leading-snug italic">{b.etsyRule}</p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty icon={Type} title="Your titles will appear here" hint="Describe your product on the left and we'll draft a few — each scored by transparent SEO rules, so you can see exactly why one beats another.">
      {#snippet preview()}
        <div class="entry-list">
          {#each [{ t: "Handmade Ceramic Coffee Mug · Rustic Blue Pottery", n: 92 }, { t: "Rustic Blue Pottery Mug · Gift for Coffee Lovers", n: 84 }] as ex, i (i)}
            <div class="entry !py-2.5">
              <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] text-text-primary leading-snug">{ex.t}</p>
                <p class="entry-meta mt-1">SEO {ex.n} · strong</p>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

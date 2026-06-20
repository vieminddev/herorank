<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Tags, LoaderCircle, CircleAlert, Plus, Check } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // One tag as returned by POST /api/tools/tag-gap (etsy-tools.ts).
  interface TagRow {
    tag: string;
    count: number;
    inMine: boolean;
    sharePct: number;
  }
  interface TagGapResult {
    keyword: string;
    sampled: number;
    tags: TagRow[];
    gaps: TagRow[];
    hasMine: boolean;
  }

  let keyword = $state("");
  let myTagsText = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let result = $state<TagGapResult | null>(null);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!keyword.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const myTags = myTagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 13);

    const res = await callTool<TagGapResult>("tag-gap", {
      keyword: keyword.trim(),
      ...(myTags.length ? { myTags } : {}),
    });

    if (res.ok) {
      result = res.data;
      await invalidateAll(); // refresh Header credits badge
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };
</script>

<ToolPageLayout
  title="Tag Gap"
  prefix="Etsy"
  description="See the tags the top-ranking listings use for a search — and which ones you're missing. The fastest way to find keywords your competitors rank for and you don't."
  icon={Tags}
  credits={3}
>
  {#snippet controls()}
    <form onsubmit={handleSubmit}>
      <label for="tg-kw" class="field-label">Search keyword</label>
      <input id="tg-kw" bind:value={keyword} placeholder="personalized necklace" class="field" />
      <label for="tg-mine" class="field-label mt-4">
        Your current tags <span class="text-text-muted font-normal">(optional)</span>
      </label>
      <textarea
        id="tg-mine"
        bind:value={myTagsText}
        rows={4}
        placeholder="comma-separated — we'll highlight what you're missing"
        class="field resize-none"
      ></textarea>
      <button
        type="submit"
        disabled={loading || !keyword.trim()}
        class="btn btn-primary w-full justify-center mt-4"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Finding gaps…{:else}Find tag gaps{/if}
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

  {#if result}
    <div class="animate-fade-in space-y-8">
      <p class="section-kicker">
        Top tags across {result.sampled} listing{result.sampled === 1 ? "" : "s"} for “{result.keyword}”
      </p>

      <!-- Tags you're missing -->
      {#if result.gaps.length}
        <div>
          <p class="section-kicker mb-1">Tags you're missing</p>
          <p class="lead text-sm mb-3">Used by top listings for this search but not in your tags.</p>
          <div class="flex flex-wrap gap-2">
            {#each result.gaps as g (g.tag)}
              <span class="badge badge-medium inline-flex items-center gap-1.5">
                <Plus size={11} />
                {g.tag}
                <span class="text-text-muted font-normal">{g.sharePct}%</span>
              </span>
            {/each}
          </div>
        </div>
      {:else if result.hasMine}
        <div>
          <p class="section-kicker mb-1">Tags you're missing</p>
          <p class="text-sm text-text-secondary">Nice — you're already using the common tags for this search.</p>
        </div>
      {/if}

      <hr class="rule" />

      <!-- Full tag list -->
      <div>
        <p class="section-kicker mb-3">All top tags</p>
        <div class="entry-list">
          {#each result.tags as t (t.tag)}
            <div class="entry flex items-center justify-between gap-4 py-2.5">
              <span class="inline-flex items-center gap-2 text-sm text-text-primary">
                {#if t.inMine}<Check size={13} class="text-success shrink-0" />{/if}
                {t.tag}
              </span>
              <span class="text-sm tabular-nums text-text-muted shrink-0">
                {t.count} listing{t.count === 1 ? "" : "s"} · {t.sharePct}%
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty
      icon={Tags}
      title="Your tag gaps will appear here"
      hint="Enter a search keyword on the left. We'll pull the tags the top listings use and show what you're missing."
    />
  {/if}
</ToolPageLayout>

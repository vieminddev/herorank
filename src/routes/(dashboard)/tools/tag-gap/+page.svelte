<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Tags, LoaderCircle, CircleAlert, Plus, Check, Copy, ClipboardCheck, X } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

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

  // Per-tag copy feedback: tag string → true while "copied" indicator is showing.
  let copiedTag = $state<string | null>(null);
  let copiedAll = $state(false);

  const copyTag = async (tag: string) => {
    await navigator.clipboard.writeText(tag);
    copiedTag = tag;
    setTimeout(() => { copiedTag = null; }, 1500);
  };

  const copyAllGaps = async () => {
    if (!result?.gaps.length) return;
    await navigator.clipboard.writeText(result.gaps.map((g) => g.tag).join(", "));
    copiedAll = true;
    setTimeout(() => { copiedAll = false; }, 1500);
  };

  // Hand-off: open the Listing Editor with these missing tags queued — they merge into whichever
  // of the seller's listings they load (Editor caps at 13 + dedups).
  const editorHandoffHref = $derived(
    result?.gaps.length
      ? `/tools/listing-editor?addTags=${encodeURIComponent(result.gaps.slice(0, 13).map((g) => g.tag).join(","))}`
      : ""
  );

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
      await invalidateAll();
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
  description="See the tags the top-ranking listings use for a search — and which ones you're missing. The fastest way to find keywords your competitors rank for and you don't."
  icon={Tags}
  credits={3}
>
  {#snippet controls()}
    <form onsubmit={handleSubmit}>
      <label for="tg-kw" class="field-label">Search keyword</label>
      <input id="tg-kw" bind:value={keyword} placeholder="personalized necklace" class="field" />

      <div class="flex items-center justify-between mt-4 mb-1">
        <label for="tg-mine" class="field-label !mb-0">
          Your current tags <span class="text-text-muted font-normal">(optional)</span>
        </label>
        {#if myTagsText.trim()}
          <button
            type="button"
            onclick={() => { myTagsText = ""; }}
            class="inline-flex items-center gap-1 text-[0.7rem] text-text-muted hover:text-danger transition-colors"
          ><X size={11} /> Clear</button>
        {/if}
      </div>
      <textarea
        id="tg-mine"
        bind:value={myTagsText}
        rows={4}
        placeholder="Paste comma-separated tags from your Etsy listing — we'll highlight what you're missing"
        class="field resize-none"
      ></textarea>
      <p class="field-hint">In Etsy: Edit listing → Tags section → copy all tags, paste here.</p>

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
        Top tags across {result.sampled} listing{result.sampled === 1 ? "" : "s"} for "{result.keyword}"
      </p>

      <!-- Tags you're missing -->
      {#if result.gaps.length}
        <div>
          <div class="flex items-center justify-between mb-1">
            <p class="section-kicker">Tags you're missing</p>
            <button
              type="button"
              onclick={copyAllGaps}
              class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium transition-colors {copiedAll ? 'text-success' : 'text-text-secondary hover:text-teal'}"
              title="Copy all missing tags as comma-separated list"
            >
              {#if copiedAll}
                <ClipboardCheck size={13} /> Copied!
              {:else}
                <Copy size={13} /> Copy all
              {/if}
            </button>
          </div>
          <p class="lead text-sm mb-3">Used by top listings for this search but not in your tags. Click any tag to copy it.</p>
          <div class="flex flex-wrap gap-2">
            {#each result.gaps as g, i (g.tag + "-" + i)}
              <button
                type="button"
                onclick={() => copyTag(g.tag)}
                title="Copy tag: {g.tag}"
                class="badge badge-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors {copiedTag === g.tag ? '!border-success !text-success' : 'hover:border-teal hover:text-teal'}"
              >
                {#if copiedTag === g.tag}
                  <Check size={11} />
                {:else}
                  <Plus size={11} />
                {/if}
                {g.tag}
                <span class="text-text-muted font-normal">{g.sharePct}%</span>
              </button>
            {/each}
          </div>
          <a href={editorHandoffHref} class="mt-3 copy-link !text-teal inline-flex items-center gap-1.5">
            <Plus size={12} /> Add these to one of your listings in the Editor →
          </a>
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
          {#each result.tags as t, i (t.tag + "-" + i)}
            <div class="entry flex items-center justify-between gap-4 py-2.5 group">
              <span class="inline-flex items-center gap-2 text-sm text-text-primary">
                {#if t.inMine}<Check size={13} class="text-success shrink-0" />{/if}
                {t.tag}
              </span>
              <div class="flex items-center gap-3 shrink-0">
                <span class="text-sm tabular-nums text-text-muted">
                  {t.count} listing{t.count === 1 ? "" : "s"} · {t.sharePct}%
                </span>
                <button
                  type="button"
                  onclick={() => copyTag(t.tag)}
                  title="Copy tag"
                  class="opacity-0 group-hover:opacity-100 transition-opacity {copiedTag === t.tag ? 'text-success' : 'text-text-muted hover:text-teal'}"
                >
                  {#if copiedTag === t.tag}
                    <ClipboardCheck size={13} />
                  {:else}
                    <Copy size={13} />
                  {/if}
                </button>
              </div>
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

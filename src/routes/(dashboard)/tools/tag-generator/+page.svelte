<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Copy, X, Check, LoaderCircle, CircleAlert, Tags, CircleCheck, TriangleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type Level = "high" | "medium" | "low";
  type TagRow = { tag: string; competition: Level; searchVolume: Level };
  type TagFlag = { tag: string; chars: number; wordCount: number; singleWord: boolean; overLimit: boolean; longTail: boolean };
  type TagSetCheck = { id: string; label: string; status: "pass" | "warn"; detail: string; etsyRule: string };
  type TagAudit = { flags: TagFlag[]; checks: TagSetCheck[]; multiWordCount: number; singleWordTags: string[]; overusedWords: { word: string; count: number }[] };
  type TagResult = { tags: TagRow[]; materials: TagRow[]; styles: TagRow[]; audit?: TagAudit };

  const LOCATIONS = ["Global", "USA", "UK", "AUS", "CAN", "EU", "IND"];

  type TabType = "tags" | "materials" | "styles";
  const TABS: TabType[] = ["tags", "materials", "styles"];

  let keyword = $state("");
  let location = $state("Global");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let tags = $state<TagRow[]>([]);
  let materials = $state<TagRow[]>([]);
  let styles = $state<TagRow[]>([]);
  let audit = $state<TagAudit | null>(null);
  let selectedTags = $state<string[]>([]);
  let activeTab = $state<TabType>("tags");
  let copied = $state(false);

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!keyword.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<TagResult>("tag-generator", {
      keyword: keyword.trim(),
      location,
    });

    if (res.ok) {
      tags = res.data.tags ?? [];
      materials = res.data.materials ?? [];
      styles = res.data.styles ?? [];
      audit = res.data.audit ?? null;
      hasSearched = true;
      selectedTags = [];
      activeTab = "tags";
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter((t) => t !== tag);
    } else if (selectedTags.length < 13) {
      selectedTags = [...selectedTags, tag];
    }
  };

  const copyTags = () => {
    navigator.clipboard.writeText(selectedTags.join(", "));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };

  const currentData = $derived(
    activeTab === "materials" ? materials : activeTab === "styles" ? styles : tags
  );

  // Per-tag Etsy flags, keyed by tag text (only the 13 main tags are audited).
  const flagByTag = $derived(
    new Map((audit?.flags ?? []).map((f) => [f.tag, f]))
  );
</script>

<ToolPageLayout
  title="Tag Generator"
  description="Thirteen tags, built from what Etsy buyers are searching for — ready to drop straight into your listing. Competition and volume come as honest estimates."
  icon={Tags}
  credits={1}
>
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label class="field-label" for="tag-keyword">What are you tagging?</label>
      <input
        id="tag-keyword"
        type="text"
        bind:value={keyword}
        placeholder="personalized necklace"
        class="field"
        data-testid="tag-keyword"
      />
      <p class="field-hint">Your main product or phrase. We'll branch into tags, materials and styles around it.</p>

      <label class="field-label mt-4" for="tag-location">Where are your buyers?</label>
      <select
        id="tag-location"
        bind:value={location}
        class="field appearance-none cursor-pointer"
        data-testid="tag-location"
      >
        {#each LOCATIONS as loc}
          <option value={loc}>{loc}</option>
        {/each}
      </select>

      <button
        type="submit"
        disabled={loading || !keyword.trim()}
        class="btn btn-primary w-full justify-center mt-4"
        data-testid="tag-submit"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Finding…{:else}Find tags{/if}
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

  {#if hasSearched}
    <div class="animate-fade-in">
      <!-- Editorial intro -->
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <p class="section-kicker mb-1">For “{keyword}”{location !== "Global" ? ` · ${location}` : ""}</p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Pick your thirteen</h2>
          <p class="lead text-sm">Tick the ones that fit, then copy them across to your listing.</p>
        </div>
      </div>

      <!-- Etsy-rule audit: deterministic, traceable to Etsy's Seller Handbook (not an AI guess) -->
      {#if audit}
        <div class="card p-5 mb-6">
          <div class="flex items-baseline justify-between gap-3 mb-3">
            <p class="section-kicker !mb-0">Checked against Etsy's tag rules</p>
            <a href="https://www.etsy.com/seller-handbook/article/22794885498" target="_blank" rel="noopener" class="copy-link !text-text-muted hover:!text-teal text-[0.75rem]">Etsy Seller Handbook ↗</a>
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

      <!-- Honesty note: competition/volume are AI-estimated; the rule checks above are deterministic -->
      <p class="text-[0.8125rem] text-text-secondary mb-6 inline-flex items-center gap-2">
        Competition and volume are <EstimatedBadge label="Estimated" tooltip="Competition and volume are AI estimates, not official Etsy figures. The rule checks above are computed directly from Etsy's documented guidelines." />
      </p>

      <!-- Selected summary + copy -->
      <div class="flex items-center justify-between gap-4 pb-4 mb-2 border-b border-border">
        <p class="text-sm text-text-secondary">
          <span class="font-semibold tabular-nums" style="color: {selectedTags.length >= 13 ? 'var(--danger)' : 'var(--teal)'}">{selectedTags.length}</span> of 13 chosen
        </p>
        <div class="flex items-center gap-4">
          {#if selectedTags.length}
            <button type="button" onclick={() => (selectedTags = [])} class="copy-link" data-testid="tag-clear">
              <X size={13} /> Clear
            </button>
          {/if}
          <button
            type="button"
            onclick={copyTags}
            disabled={selectedTags.length === 0}
            class="copy-link disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="tag-copy"
          >
            {#if copied}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy selected{/if}
          </button>
        </div>
      </div>

      <!-- Group tabs -->
      <div class="flex gap-5 mb-2">
        {#each TABS as tab}
          <button
            type="button"
            onclick={() => (activeTab = tab)}
            class="py-2 text-sm capitalize transition-colors border-b-2 -mb-px {activeTab === tab ? 'text-text-primary font-medium border-teal' : 'text-text-muted hover:text-text-primary border-transparent'}"
            data-testid="tag-tab-{tab}"
          >
            {tab}
          </button>
        {/each}
      </div>

      <div class="card p-2">
        <div class="entry-list entry-list--divided">
          {#each currentData as item, i (item.tag + "-" + i)}
            {@const checked = selectedTags.includes(item.tag)}
            {@const flag = flagByTag.get(item.tag)}
            <button
              type="button"
              onclick={() => toggleTag(item.tag)}
              class="entry group text-left w-full hover-lift"
              data-testid="tag-checkbox-{item.tag}"
            >
              <span class="entry-index pt-0.5">
                {#if checked}
                  <Check size={15} class="text-teal" />
                {:else}
                  {String(i + 1).padStart(2, "0")}
                {/if}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-[0.9375rem] text-text-primary leading-relaxed {checked ? 'font-medium' : ''}">
                  {item.tag}
                  {#if flag?.singleWord}
                    <span class="ml-2 inline-flex items-center gap-1 rounded text-[0.6875rem] font-medium text-warning bg-warning/10 px-1.5 py-0.5 align-middle">single word</span>
                  {:else if flag?.longTail}
                    <span class="ml-2 inline-flex items-center gap-1 rounded text-[0.6875rem] font-medium text-success bg-success/10 px-1.5 py-0.5 align-middle">long-tail</span>
                  {/if}
                </p>
                <p class="entry-meta mt-1.5 inline-flex items-center gap-3">
                  <span class="inline-flex items-center gap-1.5">competition <Badge level={item.competition} /></span>
                  <span class="text-border">·</span>
                  <span class="inline-flex items-center gap-1.5">volume <Badge level={item.searchVolume} /></span>
                  {#if flag}
                    <span class="text-border">·</span>
                    <span class="tabular-nums {flag.overLimit ? 'text-danger font-medium' : 'text-text-muted'}">{flag.chars}/20</span>
                  {/if}
                </p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty icon={Tags} title="Your tags will appear here" hint="Tell us what you're tagging on the left and we'll branch out into thirteen tags, materials and styles — each with an honest competition and volume read.">
      {#snippet preview()}
        <div class="entry-list">
          {#each [{ tag: "personalized necklace", competition: "medium" as Level, searchVolume: "high" as Level }, { tag: "name necklace gold", competition: "low" as Level, searchVolume: "medium" as Level }] as ex, i (i)}
            <div class="entry !py-2.5">
              <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] text-text-primary leading-snug">{ex.tag}</p>
                <p class="entry-meta mt-1 inline-flex items-center gap-3">
                  <span class="inline-flex items-center gap-1.5">competition <Badge level={ex.competition} /></span>
                  <span class="text-border">·</span>
                  <span class="inline-flex items-center gap-1.5">volume <Badge level={ex.searchVolume} /></span>
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

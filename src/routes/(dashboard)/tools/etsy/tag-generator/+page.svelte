<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Copy, X, Check, LoaderCircle, CircleAlert, Tags } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type Level = "high" | "medium" | "low";
  type TagRow = { tag: string; competition: Level; searchVolume: Level };
  type TagResult = { tags: TagRow[]; materials: TagRow[]; styles: TagRow[] };

  // Phase 2: summary stats, price range, monthly trend and the Listings tab require real
  // Etsy data (Phase 3). They stay hardcoded/mock and are clearly labelled as such in the UI.
  const MOCK_TREND = [65, 72, 80, 85, 78, 90, 95, 88, 92, 97, 100, 94];

  const LOCATIONS = ["Global", "USA", "UK", "AUS", "CAN", "EU", "IND"];

  type TabType = "tags" | "materials" | "styles" | "listings";
  const TABS: TabType[] = ["tags", "materials", "styles", "listings"];

  let keyword = $state("");
  let location = $state("Global");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let tags = $state<TagRow[]>([]);
  let materials = $state<TagRow[]>([]);
  let styles = $state<TagRow[]>([]);
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
    activeTab === "tags"
      ? tags
      : activeTab === "materials"
      ? materials
      : activeTab === "styles"
      ? styles
      : []
  );

  const columnLabel = $derived(
    activeTab === "materials"
      ? "Materials"
      : activeTab === "styles"
      ? "Styles"
      : "Tags"
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

      <!-- Honesty note: tag/material/style metrics are AI-estimated (Phase 2) -->
      <p class="text-[0.8125rem] text-text-secondary mb-6 inline-flex items-center gap-2">
        Competition and volume are <EstimatedBadge label="Estimated" tooltip="These signals are estimated, not official Etsy figures. Real Etsy data is coming." />
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

      {#if activeTab !== "listings"}
        <div class="entry-list">
          {#each currentData as item, i (item.tag)}
            {@const checked = selectedTags.includes(item.tag)}
            <button
              type="button"
              onclick={() => toggleTag(item.tag)}
              class="entry group text-left w-full"
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
                <p class="text-[0.9375rem] text-text-primary leading-relaxed {checked ? 'font-medium' : ''}">{item.tag}</p>
                <p class="entry-meta mt-1.5 inline-flex items-center gap-3">
                  <span class="inline-flex items-center gap-1.5">competition <Badge level={item.competition} /></span>
                  <span class="text-border">·</span>
                  <span class="inline-flex items-center gap-1.5">volume <Badge level={item.searchVolume} /></span>
                </p>
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="resting">
          <p class="text-sm text-text-secondary">Matching listings aren't here yet.</p>
          <p class="text-[0.8125rem]">They'll appear once we're connected to live Etsy data.</p>
        </div>
      {/if}

      <!-- Sample-data honesty note for the aggregate stats / price / trend (placeholder until Etsy API) -->
      <div class="mt-10 pt-6 border-t border-border-light">
        <p class="text-[0.8125rem] text-text-secondary mb-5 inline-flex items-center gap-2">
          The figures below are <EstimatedBadge label="Sample data" tooltip="Aggregate stats, price range and trend use placeholder data until the Etsy API is connected." /> for now.
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5 mb-8">
          <div>
            <p class="text-[0.8125rem] text-text-muted mb-1">Keyword</p>
            <p class="text-sm font-medium text-text-primary truncate">{keyword}</p>
          </div>
          <div>
            <p class="text-[0.8125rem] text-text-muted mb-1">Location</p>
            <p class="text-sm font-medium text-text-primary">{location}</p>
          </div>
          <div>
            <p class="text-[0.8125rem] text-text-muted mb-1">Competition</p>
            <p class="text-sm font-medium text-text-primary tabular-nums">12,847</p>
          </div>
          <div>
            <p class="text-[0.8125rem] text-text-muted mb-1">Search volume</p>
            <p class="text-sm font-medium text-text-primary tabular-nums">8,320/mo</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <p class="text-[0.8125rem] text-text-muted mb-3">Price range</p>
            <div class="relative h-1.5 rounded-full overflow-hidden bg-gradient-to-r from-success via-warning to-danger"></div>
            <div class="flex items-center justify-between mt-2">
              <span class="text-sm font-medium text-text-primary tabular-nums">$1.91</span>
              <span class="text-sm font-medium text-text-primary tabular-nums">$21.40</span>
              <span class="text-sm font-medium text-text-primary tabular-nums">$1,260</span>
            </div>
            <div class="flex items-center justify-between mt-1 text-[0.6875rem] text-text-muted">
              <span>Bargain</span><span>Midrange</span><span>Premium</span>
            </div>
          </div>
          <div>
            <p class="text-[0.8125rem] text-text-muted mb-3">Monthly trend</p>
            <div class="flex items-end gap-1 h-16">
              {#each MOCK_TREND as val, i}
                <div
                  class="flex-1 rounded-t"
                  style="height: {val}%; background: {i === MOCK_TREND.length - 1 ? 'var(--teal)' : 'var(--teal-light)'}; opacity: {0.3 + (i / MOCK_TREND.length) * 0.7}"
                ></div>
              {/each}
            </div>
            <div class="flex justify-between mt-1 text-[0.6875rem] text-text-muted">
              <span>12mo ago</span><span>Now</span>
            </div>
          </div>
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

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { Search, Copy, X, AlertTriangle, Check } from "lucide-svelte";

  type Level = "high" | "medium" | "low";
  type TagRow = { tag: string; competition: Level; searchVolume: Level };

  // Mock data matching RankHero's tag generator output
  const MOCK_TAGS: TagRow[] = [
    { tag: "personalized gifts", competition: "high", searchVolume: "high" },
    { tag: "custom name necklace", competition: "medium", searchVolume: "high" },
    { tag: "handmade jewelry", competition: "high", searchVolume: "high" },
    { tag: "birthday gift for her", competition: "medium", searchVolume: "medium" },
    { tag: "minimalist necklace", competition: "medium", searchVolume: "medium" },
    { tag: "dainty gold necklace", competition: "low", searchVolume: "medium" },
    { tag: "name plate necklace", competition: "low", searchVolume: "low" },
    { tag: "sterling silver jewelry", competition: "medium", searchVolume: "medium" },
    { tag: "bridesmaid gift", competition: "high", searchVolume: "high" },
    { tag: "mothers day gift", competition: "high", searchVolume: "medium" },
    { tag: "initial necklace", competition: "low", searchVolume: "medium" },
    { tag: "anniversary gift wife", competition: "low", searchVolume: "low" },
    { tag: "engraved necklace", competition: "medium", searchVolume: "medium" },
    { tag: "gold filled jewelry", competition: "low", searchVolume: "low" },
    { tag: "custom jewelry", competition: "medium", searchVolume: "high" },
  ];

  const MOCK_MATERIALS: TagRow[] = [
    { tag: "Sterling Silver", competition: "medium", searchVolume: "high" },
    { tag: "Gold Filled", competition: "low", searchVolume: "medium" },
    { tag: "14K Gold", competition: "medium", searchVolume: "high" },
    { tag: "Rose Gold", competition: "low", searchVolume: "medium" },
    { tag: "Stainless Steel", competition: "low", searchVolume: "low" },
  ];

  const MOCK_STYLES: TagRow[] = [
    { tag: "Minimalist", competition: "medium", searchVolume: "high" },
    { tag: "Bohemian", competition: "low", searchVolume: "medium" },
    { tag: "Vintage", competition: "medium", searchVolume: "medium" },
    { tag: "Modern", competition: "low", searchVolume: "low" },
  ];

  const MOCK_TREND = [65, 72, 80, 85, 78, 90, 95, 88, 92, 97, 100, 94];

  const LOCATIONS = ["Global", "USA", "UK", "AUS", "CAN", "EU", "IND"];

  type TabType = "tags" | "materials" | "styles" | "listings";
  const TABS: TabType[] = ["tags", "materials", "styles", "listings"];

  let keyword = $state("");
  let location = $state("Global");
  let hasSearched = $state(false);
  let selectedTags = $state<string[]>([]);
  let activeTab = $state<TabType>("tags");
  let copied = $state(false);

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    if (keyword.trim()) {
      hasSearched = true;
      selectedTags = [];
    }
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
      ? MOCK_TAGS
      : activeTab === "materials"
      ? MOCK_MATERIALS
      : activeTab === "styles"
      ? MOCK_STYLES
      : []
  );

  const columnLabel = $derived(
    activeTab === "materials"
      ? "Material"
      : activeTab === "styles"
      ? "Style"
      : "Tag"
  );

  const features = [
    { title: "Free & no signup", desc: "No credit card. No account required. Start generating tags instantly." },
    { title: "All-in-one analysis", desc: "Tags, materials, and styles for your keyword in one view." },
    { title: "Competition insights", desc: "See exactly how many other listings compete for each tag." },
    { title: "Search volume data", desc: "Discover how many buyers search for each tag every month." },
    { title: "Select & copy in one click", desc: "Tick the tags you want and copy them all at once." },
    { title: "Location-specific insights", desc: "Filter results by country to see regional search data." },
    { title: "Visual price distribution", desc: "Bargain, midrange, and premium pricing for your keyword." },
    { title: "Materials & styles included", desc: "Material and style suggestions with full metrics." },
    { title: "Monthly trend graph", desc: "12 months of search volume on a single chart." },
  ];
</script>

<ToolPageLayout
  title="Tag Generator"
  description="Find high-search, low-competition tags that help your listings stand out. Enter a keyword to see real Etsy tag data."
>
  <!-- Search Input -->
  <form onsubmit={handleSearch} class="mb-8">
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="flex-1">
        <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1" for="tag-keyword">
          Seed keyword
          <span class="text-danger text-xs font-normal">(required)</span>
        </label>
        <div class="relative">
          <Search
            size={16}
            class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            id="tag-keyword"
            type="text"
            bind:value={keyword}
            placeholder="e.g. personalized necklace"
            class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 transition-colors bg-white"
            data-testid="tag-keyword"
          />
        </div>
      </div>

      <div class="w-full sm:w-36">
        <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 block" for="tag-location">
          Location
        </label>
        <select
          id="tag-location"
          bind:value={location}
          class="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white appearance-none cursor-pointer"
          data-testid="tag-location"
        >
          {#each LOCATIONS as loc}
            <option value={loc}>
              {loc}
            </option>
          {/each}
        </select>
      </div>

      <div class="flex items-end">
        <button
          type="submit"
          class="w-full sm:w-auto px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
          style="background: var(--navy)"
          data-testid="tag-submit"
        >
          Search
        </button>
      </div>
    </div>
  </form>

  <!-- Results -->
  {#if hasSearched}
    <div class="animate-fade-in">
      <!-- Summary Cards -->
      <div class="card p-5 mb-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
              Keyword
            </div>
            <div class="text-sm font-bold text-text-primary">
              {keyword}
            </div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
              Location
            </div>
            <div class="text-sm font-bold text-text-primary">
              {location}
            </div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
              Competition
            </div>
            <div class="text-sm font-bold text-text-primary">
              12,847
            </div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
              Search Volume
            </div>
            <div class="text-sm font-bold text-text-primary">
              8,320/mo
            </div>
          </div>
        </div>
      </div>

      <!-- Price Range & Trend -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <!-- Price Range -->
        <div class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Bargain
            </span>
            <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Midrange
            </span>
            <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Premium
            </span>
          </div>
          <div class="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-success via-warning to-danger"></div>
          <div class="flex items-center justify-between mt-2">
            <span class="text-sm font-bold text-text-primary">$1.91</span>
            <span class="text-sm font-bold text-text-primary">$21.40</span>
            <span class="text-sm font-bold text-text-primary">$1,260</span>
          </div>
        </div>

        <!-- Monthly Trend -->
        <div class="card p-5">
          <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Monthly Trend
          </div>
          <div class="flex items-end gap-1 h-16">
            {#each MOCK_TREND as val, i}
              <div
                class="flex-1 rounded-t transition-all hover:opacity-80"
                style="height: {val}%; background: {i === MOCK_TREND.length - 1 ? 'var(--teal)' : 'var(--teal-light)'}; opacity: {0.3 + (i / MOCK_TREND.length) * 0.7}"
              ></div>
            {/each}
          </div>
          <div class="flex justify-between mt-1">
            <span class="text-[10px] text-text-muted">12mo ago</span>
            <span class="text-[10px] text-text-muted">Now</span>
          </div>
        </div>
      </div>

      <!-- Tags Table + Copy Sidebar -->
      <div class="flex flex-col lg:flex-row gap-4">
        <!-- Main Table -->
        <div class="flex-1 card overflow-hidden">
          <!-- Tabs -->
          <div class="flex border-b border-border">
            {#each TABS as tab}
              <button
                onclick={() => (activeTab = tab)}
                class="px-5 py-3 text-sm font-medium capitalize transition-colors relative {activeTab === tab ? 'text-teal' : 'text-text-muted hover:text-text-primary'}"
                data-testid="tag-tab-{tab}"
              >
                {tab}
                {#if activeTab === tab}
                  <div
                    class="absolute bottom-0 left-0 right-0 h-0.5"
                    style="background: var(--teal)"
                  ></div>
                {/if}
              </button>
            {/each}
          </div>

          <!-- Table -->
          {#if activeTab !== "listings"}
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-border-light">
                    <th class="w-10 px-4 py-3"></th>
                    <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      {columnLabel}
                    </th>
                    <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Competition
                    </th>
                    <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Search Volume
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#each currentData as item (item.tag)}
                    <tr
                      class="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer"
                      onclick={() => toggleTag(item.tag)}
                    >
                      <td class="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(item.tag)}
                          onchange={() => toggleTag(item.tag)}
                          onclick={(e) => e.stopPropagation()}
                          class="w-4 h-4 rounded border-border accent-teal cursor-pointer"
                          data-testid="tag-checkbox-{item.tag}"
                        />
                      </td>
                      <td class="px-4 py-3">
                        <span class="text-sm text-text-primary font-medium">
                          {item.tag}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <Badge level={item.competition} />
                      </td>
                      <td class="px-4 py-3">
                        <Badge level={item.searchVolume} />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="p-8 text-center text-text-muted text-sm">
              Listings data will be available when connected to the Etsy API.
            </div>
          {/if}
        </div>

        <!-- Copy & Paste Sidebar -->
        <div class="w-full lg:w-64 flex-shrink-0">
          <div class="card p-4 sticky top-20">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-bold text-text-primary">
                Copy & Paste
              </h4>
              <span
                class="text-sm font-bold"
                style="color: {selectedTags.length >= 13 ? 'var(--danger)' : 'var(--teal)'}"
              >
                {selectedTags.length}/13
              </span>
            </div>

            <!-- Selected tags -->
            <div class="min-h-[120px] mb-3 p-3 rounded-lg border border-border-light bg-bg-page">
              {#if selectedTags.length === 0}
                <p class="text-xs text-text-muted text-center pt-6">
                  Select tags from the table
                </p>
              {:else}
                <div class="flex flex-wrap gap-1.5">
                  {#each selectedTags as tag (tag)}
                    <span
                      class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-white border border-border"
                    >
                      {tag}
                      <button
                        onclick={() => toggleTag(tag)}
                        class="hover:text-danger transition-colors"
                        data-testid="tag-remove-{tag}"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <button
                onclick={() => (selectedTags = [])}
                class="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-page transition-colors"
                data-testid="tag-clear"
              >
                Clear
              </button>
              <button
                onclick={copyTags}
                disabled={selectedTags.length === 0}
                class="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                style="background: var(--navy)"
                data-testid="tag-copy"
              >
                {#if copied}
                  <Check size={12} /> Copied!
                {:else}
                  <Copy size={12} /> Copy Tags
                {/if}
              </button>
            </div>

            <!-- Pro Tip -->
            <div class="mt-4 p-3 rounded-lg bg-warning/5 border border-warning/20">
              <div class="flex items-start gap-2">
                <AlertTriangle
                  size={14}
                  class="text-warning flex-shrink-0 mt-0.5"
                />
                <div>
                  <h5 class="text-xs font-bold text-text-primary mb-1">
                    Pro Tip
                  </h5>
                  <p class="text-[11px] text-text-secondary leading-relaxed">
                    Use all 13 tag slots — every empty slot is a missed
                    opportunity. Mix high and low competition tags for best
                    results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Overview Section (shown when no search) -->
  {#if !hasSearched}
    <div class="mt-12 space-y-8">
      <h3 class="text-xl font-bold text-text-primary">
        Pick the right Etsy tags with real data, not guesswork.
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card p-6">
          <h4 class="text-base font-bold text-text-primary mb-2">
            What it does
          </h4>
          <p class="text-sm text-text-secondary leading-relaxed">
            HeroRank&apos;s Tag Generator helps Etsy sellers prioritize
            high-impact tags and keywords using search volume and competition
            insights — so your listings get in front of the right buyers.
          </p>
        </div>
        <div class="card p-6">
          <h4 class="text-base font-bold text-text-primary mb-2">
            Why it matters
          </h4>
          <p class="text-sm text-text-secondary leading-relaxed">
            Tags are Etsy&apos;s most direct lever for search visibility.
            Picking the wrong ones — or missing high-volume opportunities —
            quietly buries your listing. We remove the guesswork so you can
            focus on selling.
          </p>
        </div>
      </div>

      <!-- Features Grid -->
      <div>
        <h3 class="text-xl font-bold text-text-primary mb-4">
          Every signal you need to pick the right tag.
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {#each features as feature (feature.title)}
            <div class="card p-5">
              <h5 class="text-sm font-bold text-text-primary mb-1.5">
                {feature.title}
              </h5>
              <p class="text-xs text-text-secondary leading-relaxed">
                {feature.desc}
              </p>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</ToolPageLayout>

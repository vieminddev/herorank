<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import StatCard from "$lib/components/ui/StatCard.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, ExternalLink, Share2, Star, LoaderCircle, CircleAlert, Zap, CircleCheck, MapPin, Calendar, Store } from "lucide-svelte";
  import { callTool, startShopAnalysis, pollJob, type JobStatus } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { onDestroy } from "svelte";

  type TabType = "overview" | "reviews" | "about";
  type TagView = "tags" | "categories";

  // Response shape per BA spec §4.2 (maps onto former MOCK_SHOP). `percentile` REMOVED
  // (PM Q7 — requires cross-shop sales distribution we don't have). Listing `views` REMOVED
  // (not available via Etsy v3). Sales/revenue figures are estimates → EstimatedBadge.
  interface ShopStats {
    monthlySales: number;
    monthlyRevenue: string;
    monthlyRevenuePerDay?: string;
    totalSales: number;
    totalRevenue: string;
    activeListings: number;
    salesPerListing: number;
    averagePrice: string;
    totalFaves: number;
    totalReviews: number;
    reviewRate: string;
  }
  interface ShopListing {
    id: number;
    title: string;
    imageUrl: string | null;
    price: string;
    grade: string;
    scores: { title: number; tags: number; images: number; video: number; description: number };
    sales: number;
    revenue: string;
    faves: number;
  }
  interface ShopResult {
    name: string;
    title: string;
    icon: string | null;
    rating: number;
    numRatings: number;
    location: string;
    created: string;
    stats: ShopStats;
    tags: { name: string; count: number }[];
    listings: ShopListing[];
    // Backend shape: reviews.distribution (Record<'1'..'5', count>) + reviews.recent
    reviews: {
      distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
      recent: { rating: number; text: string; date: string }[];
    };
    about: {
      location: string;
      currency: string;
      vacation: boolean;
      announcement: string | null;
    };
  }

  let shopInput = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let notFound = $state(false);
  let activeTab = $state<TabType>("overview");
  let tagView = $state<TagView>("tags");
  let shop = $state<ShopResult | null>(null);

  // --- Deep analysis (Phase 4, async queue job, 8 credits) ---
  // Quick analysis (Phase 3) stays the default. Deep runs the FULL shop off the request path:
  // enqueue → poll queued/running → render when done. Credits deduct ONLY on success
  // (BR-P4-01); a failed job charges nothing and surfaces a banner.
  type Mode = "quick" | "deep";
  let mode = $state<Mode>("quick");
  let deepStatus = $state<JobStatus | null>(null);
  let deepFailed = $state<string | null>(null);
  let paymentFailed = $state(false);
  let pollController: AbortController | null = null;

  onDestroy(() => pollController?.abort());

  const DEEP_COST = 8;
  const tabs: TabType[] = ["overview", "reviews", "about"];
  const tagViews: TagView[] = ["tags", "categories"];

  // Friendly label for the async job phases.
  const statusLabel = (s: JobStatus | null): string => {
    switch (s) {
      case "queued":
        return "Queued — your deep analysis is in line...";
      case "running":
        return "Analyzing the full shop — this can take a moment...";
      case "deferred":
        return "Paused for rate limits — resuming shortly...";
      default:
        return "Analyzing...";
    }
  };

  const maxTagCount = $derived(shop && shop.tags.length ? Math.max(...shop.tags.map((t) => t.count)) : 1);

  // Sales-derived sidebar stats are estimates → flagged with an Est. badge.
  const estimatedStats = new Set(["Total Sales", "Total Revenue", "Sales per Listing", "Review Rate"]);

  const shopStats = $derived<[string, string][]>(
    shop
      ? [
          ["Total Sales", shop.stats.totalSales.toLocaleString()],
          ["Total Revenue", shop.stats.totalRevenue],
          ["Active Listings", shop.stats.activeListings.toLocaleString()],
          ["Sales per Listing", shop.stats.salesPerListing.toLocaleString()],
          ["Average Price", shop.stats.averagePrice],
          ["Total Faves", shop.stats.totalFaves.toLocaleString()],
          ["Total Reviews", shop.stats.totalReviews.toLocaleString()],
          ["Review Rate", shop.stats.reviewRate],
        ]
      : [],
  );

  const shopDetails = $derived<[string, string][]>(
    shop
      ? [
          ["Shop Location", shop.location],
          ["Currency", shop.about.currency ?? "—"],
          ["On Vacation", shop.about.vacation ? "Yes" : "No"],
          ["Total Faves", shop.stats.totalFaves.toLocaleString()],
          ["Created", shop.created],
        ]
      : [],
  );

  const communication = $derived<[string, string][]>(
    shop
      ? [
          ["Shop Announcement", shop.about.announcement ?? "—"],
        ]
      : [],
  );

  const resetSearchState = () => {
    error = null;
    needsUpgrade = false;
    notFound = false;
    deepFailed = null;
    paymentFailed = false;
    deepStatus = null;
  };

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!shopInput.trim() || loading) return;
    if (mode === "deep") {
      await runDeep();
      return;
    }
    loading = true;
    resetSearchState();

    const res = await callTool<ShopResult>("shop-analyzer", {
      shop: shopInput.trim(),
    });

    if (res.ok) {
      shop = res.data;
      hasSearched = true;
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else if (res.status === 404) {
      notFound = true;
      shop = null;
      hasSearched = true;
    } else {
      error = res.message;
    }
    loading = false;
  };

  // Deep analysis: enqueue then poll until done/failed. Keeps `loading` true for the whole
  // async lifetime so the form button stays in its busy state and re-submits are blocked.
  const runDeep = async () => {
    loading = true;
    resetSearchState();
    shop = null;

    const start = await startShopAnalysis(shopInput.trim());
    if (!start.ok) {
      if (start.status === 402) {
        needsUpgrade = true;
        error = start.message;
      } else if (start.status === 404) {
        notFound = true;
        hasSearched = true;
      } else {
        error = start.message;
      }
      loading = false;
      return;
    }

    deepStatus = start.data.status ?? "queued";

    pollController?.abort();
    pollController = new AbortController();

    const res = await pollJob<ShopResult>(start.data.jobId, {
      intervalMs: 3000,
      signal: pollController.signal,
      onTick: (s) => {
        deepStatus = s;
      },
    });

    if (!res.ok) {
      if (res.error !== "ABORTED") error = res.message;
      loading = false;
      deepStatus = null;
      return;
    }

    if (res.data.status === "done" && res.data.result) {
      shop = res.data.result;
      hasSearched = true;
      paymentFailed = res.data.paymentFailed === true;
      await invalidateAll(); // refresh credits badge — deduct happened on success
    } else {
      // Failed after retries → NO charge (BR-P4-01).
      deepFailed = "The deep analysis didn't complete. You haven't been charged — please try again.";
    }
    deepStatus = null;
    loading = false;
  };
</script>

<ToolPageLayout
  title="Shop Research"
  description="Look up any Etsy shop and learn from it — its listings, reviews, and public stats, all in one quiet view. Sales figures are our estimate; review counts are real."
>
  {#snippet controls()}
    <!-- Search -->
    <form onsubmit={handleSearch}>
      <!-- Mode: quick (Phase 3, free/cheap, instant) vs deep (Phase 4, 8 credits, full shop, async). -->
      <div class="flex gap-1 bg-bg-page rounded-lg p-0.5 mb-3" role="group" aria-label="Analysis depth">
        <button
          type="button"
          onclick={() => (mode = "quick")}
          disabled={loading}
          class={`flex-1 justify-center px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
            mode === "quick" ? "bg-white text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
          }`}
          data-testid="mode-quick"
        >
          Quick analysis
        </button>
        <button
          type="button"
          onclick={() => (mode = "deep")}
          disabled={loading}
          class={`flex-1 justify-center px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
            mode === "deep" ? "bg-white text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
          }`}
          data-testid="mode-deep"
        >
          <Zap size={12} class="text-teal" /> Deep
          <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-navy/10 text-teal">{DEEP_COST}</span>
        </button>
      </div>
      {#if mode === "deep"}
        <p class="text-xs text-text-muted mb-3 -mt-1">
          Reads the <strong class="text-text-secondary">entire</strong> shop — every listing and review, with per-category estimates. Runs in the background; you're charged only when it finishes.
        </p>
      {/if}

      <label for="shop-analyzer-input" class="field-label">Which shop would you like to study?</label>
      <div class="field-wrap">
        <span class="field-affix"><Search size={16} /></span>
        <input
          id="shop-analyzer-input"
          type="text"
          bind:value={shopInput}
          placeholder="e.g. CaitlynMinimalist"
          class="field"
        />
      </div>
      <p class="field-hint">A shop name or its Etsy URL — either one works.</p>
      <button
        type="submit"
        disabled={loading || !shopInput.trim()}
        class="btn btn-primary w-full justify-center mt-4"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> {mode === "deep" ? "Analyzing…" : "Looking…"}{:else if mode === "deep"}<Zap size={14} /> Run deep analysis{:else}Look up shop{/if}
      </button>
    </form>
  {/snippet}

  {#if loading && mode === "deep"}
    <div class="mb-7 flex items-start gap-3 py-4 border-y border-border-light animate-fade-in" role="status" aria-live="polite">
      <LoaderCircle size={18} class="text-teal animate-spin flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm font-semibold text-text-primary">{statusLabel(deepStatus)}</p>
        <p class="text-xs text-text-muted mt-0.5">Feel free to keep using other tools — we'll have results here when it's done.</p>
      </div>
    </div>
  {/if}

  {#if deepFailed}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <p class="text-sm text-text-primary">{deepFailed}</p>
    </div>
  {/if}

  {#if paymentFailed}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-warning flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">Your analysis is ready, but we couldn't deduct the {DEEP_COST} credits — your balance changed mid-run. Top up to keep using deep analysis.</p>
        <a href="/pricing" class="copy-link mt-2 !text-teal">Top up credits →</a>
      </div>
    </div>
  {/if}

  {#if hasSearched && shop && mode === "deep"}
    <div class="mb-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal/10 text-teal animate-fade-in">
      <CircleCheck size={13} /> Deep analysis — full shop
    </div>
  {/if}

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

  {#if notFound}
    <div class="resting animate-fade-in">
      <p class="text-sm text-text-secondary">We couldn't find that shop.</p>
      <p class="text-[0.8125rem]">Double-check the name or URL and try again.</p>
    </div>
  {/if}

  {#if hasSearched && shop}
    <div class="animate-fade-in">
      <!-- Shop Header -->
      <div class="mb-6">
        <div class="flex flex-col sm:flex-row items-start gap-5">
          <!-- Avatar (real shop icon, fallback to initials) -->
          {#if shop.icon}
            <img src={shop.icon} alt={shop.name} loading="lazy" class="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
          {:else}
            <div class="w-20 h-20 rounded-xl bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {shop.name.substring(0, 2).toUpperCase()}
            </div>
          {/if}

          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-semibold tracking-tight text-text-primary">
              {shop.name}
            </h2>
            <p class="text-sm text-text-secondary mt-0.5">
              {shop.title}
            </p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5">
              <div class="flex items-center gap-1">
                <Star size={14} class="text-warning fill-warning" />
                <span class="text-sm font-semibold text-text-primary">
                  {shop.rating}
                </span>
                <span class="text-xs text-text-muted">
                  ({shop.numRatings.toLocaleString()})
                </span>
              </div>
              <span class="text-xs text-text-muted inline-flex items-center gap-1"><MapPin size={12} /> {shop.location}</span>
              <span class="text-xs text-text-muted inline-flex items-center gap-1"><Calendar size={12} /> {shop.created}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <a
              href={`https://www.etsy.com/shop/${encodeURIComponent(shop.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-secondary"
              style="padding: 8px 18px;"
            >
              <ExternalLink size={14} /> View on Etsy
            </a>
            <button type="button" class="btn btn-secondary" style="padding: 8px 18px;">
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mt-5 border-b border-border">
          {#each tabs as tab (tab)}
            <button
              type="button"
              onclick={() => (activeTab = tab)}
              class={`px-4 py-2 text-sm font-medium capitalize transition-colors relative ${
                activeTab === tab
                  ? "text-teal"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
              {#if activeTab === tab}
                <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-teal"></div>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Overview Tab -->
      {#if activeTab === "overview"}
        <!-- Stats Row. "More sales than X%" percentile card REMOVED (PM Q7): it requires a
             cross-shop sales distribution Etsy does not expose. Monthly sales/revenue are
             estimates → EstimatedBadge. -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div class="relative">
            <StatCard
              label="Monthly Sales"
              value={shop.stats.monthlySales.toLocaleString()}
              subtitle={`${Math.round(shop.stats.monthlySales / 30).toLocaleString()} per day`}
            />
            <div class="absolute top-3 right-3"><EstimatedBadge /></div>
          </div>
          <div class="relative">
            <StatCard
              label="Monthly Revenue"
              value={shop.stats.monthlyRevenue}
              subtitle={shop.stats.monthlyRevenuePerDay ? `${shop.stats.monthlyRevenuePerDay} per day` : "estimated"}
            />
            <div class="absolute top-3 right-3"><EstimatedBadge /></div>
          </div>
        </div>

        <!-- Tags + Shop Stats -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <!-- Most Used Tags -->
          <div class="lg:col-span-2 card p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-semibold text-text-primary">
                Most Used Tags
              </h3>
              <div class="flex gap-1 bg-bg-page rounded-lg p-0.5">
                {#each tagViews as v (v)}
                  <button
                    type="button"
                    onclick={() => (tagView = v)}
                    class={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                      tagView === v
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {v}
                  </button>
                {/each}
              </div>
            </div>
            <div class="space-y-3">
              {#each shop.tags as tag (tag.name)}
                <div class="flex items-center gap-3">
                  <span class="text-sm text-text-primary w-36 truncate flex-shrink-0">
                    {tag.name}
                  </span>
                  <div class="flex-1 h-5 bg-bg-page rounded overflow-hidden">
                    <div
                      class="h-full rounded transition-all"
                      style={`width: ${(tag.count / maxTagCount) * 100}%; background: var(--teal); opacity: 0.7`}
                    ></div>
                  </div>
                  <span class="text-xs font-semibold text-text-muted w-10 text-right flex-shrink-0">
                    {tag.count}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Shop Stats Sidebar. Sales-derived figures (Total Sales/Revenue, Sales per
               Listing, Review Rate) are estimates — flagged with an Est. badge. -->
          <div class="card p-5">
            <h3 class="text-base font-semibold text-text-primary mb-4">
              Shop Stats
            </h3>
            <ul class="space-y-3">
              {#each shopStats as [label, value] (label)}
                <li class="flex items-center justify-between text-sm">
                  <span class="text-text-secondary flex items-center gap-1.5">{label}{#if estimatedStats.has(label)}<EstimatedBadge label="Est." />{/if}</span>
                  <span class="font-semibold text-text-primary">
                    {value}
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        </div>

        <!-- Listings -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <div>
              <p class="section-kicker mb-1">From the shelves</p>
              <h3 class="text-lg font-semibold tracking-tight text-text-primary">Listings</h3>
            </div>
            <select aria-label="Sort listings" class="text-xs px-3 py-1.5 border border-border rounded-lg bg-white text-text-secondary focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition-colors">
              <option>Score</option>
              <option>Sales</option>
              <option>Revenue</option>
              <option>Faves</option>
              <option>Created</option>
            </select>
          </div>
          <hr class="rule mt-3 mb-5" />

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each shop.listings as listing (listing.id)}
              <div class="card overflow-hidden">
                <!-- Listing image (real Etsy photo) + Grade -->
                <div class="relative h-48 bg-gradient-to-br from-bg-page to-border flex items-center justify-center">
                  {#if listing.imageUrl}
                    <img src={listing.imageUrl} alt={listing.title} loading="lazy" class="absolute inset-0 w-full h-full object-cover" />
                  {:else}
                    <span class="text-text-muted text-xs">No image</span>
                  {/if}
                  <div class={`grade-badge grade-${listing.grade.toLowerCase()}`}>
                    {listing.grade}
                  </div>
                </div>

                <div class="p-3">
                  <h4 class="text-sm font-medium text-text-primary line-clamp-2 mb-2 leading-snug">
                    {listing.title}
                  </h4>
                  <div class="text-base font-bold text-text-primary mb-3">
                    {listing.price}
                  </div>

                  <!-- Score Bars -->
                  <div class="space-y-2">
                    <ScoreBar label="Title" score={listing.scores.title} />
                    <ScoreBar label="Tags" score={listing.scores.tags} />
                    <ScoreBar label="Images" score={listing.scores.images} />
                    <ScoreBar label="Video" score={listing.scores.video} />
                    <ScoreBar label="Description" score={listing.scores.description} />
                  </div>

                  <!-- Stats. Views column REMOVED (not available via Etsy v3). Sales/Revenue
                       are estimates → Est. badge. -->
                  <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-light">
                    <div>
                      <div class="text-[10px] text-text-muted uppercase flex items-center gap-1">Sales <EstimatedBadge label="Est." /></div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.sales.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div class="text-[10px] text-text-muted uppercase flex items-center gap-1">Revenue <EstimatedBadge label="Est." /></div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.revenue}
                      </div>
                    </div>
                    <div>
                      <div class="text-[10px] text-text-muted uppercase">Faves</div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.faves.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <button type="button" class="btn btn-secondary w-full mt-4">
            Load more listings
          </button>
        </div>
      {/if}

      <!-- Reviews Tab -->
      {#if activeTab === "reviews"}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="card p-5">
            <h3 class="text-base font-semibold text-text-primary mb-4">
              Review Distribution
            </h3>
            <div class="text-center mb-4">
              <div class="text-3xl font-bold text-text-primary">{shop.rating}</div>
              <div class="flex items-center justify-center gap-0.5 mt-1">
                {#each [1, 2, 3, 4, 5] as s (s)}
                  <Star
                    size={16}
                    class={s <= Math.round(shop.rating) ? "text-warning fill-warning" : "text-border"}
                  />
                {/each}
              </div>
              <div class="text-xs text-text-muted mt-1">
                based on the most recent {shop.numRatings.toLocaleString()} reviews
              </div>
            </div>
            {#each [5, 4, 3, 2, 1] as star (star)}
              {@const count = shop.reviews.distribution[String(star) as '1'|'2'|'3'|'4'|'5'] ?? 0}
              {@const total = Object.values(shop.reviews.distribution).reduce((a, b) => a + b, 0)}
              {@const pct = total > 0 ? Math.round((count / total) * 100) : 0}
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-text-secondary w-12">{star} star</span>
                <div class="flex-1 h-2 bg-bg-page rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full bg-warning"
                    style={`width: ${pct}%`}
                  ></div>
                </div>
                <span class="text-xs font-semibold text-text-muted w-8 text-right">
                  {pct}%
                </span>
              </div>
            {/each}
          </div>

          <div class="lg:col-span-2 card p-5">
            <h3 class="text-base font-semibold text-text-primary mb-4">
              Recent Reviews
            </h3>
            <div class="flex gap-2 mb-4">
              {#each ["All", "Positive", "Neutral", "Negative"] as f (f)}
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-full text-xs font-medium border border-border text-text-secondary hover:bg-bg-page transition-colors"
                >
                  {f}
                </button>
              {/each}
            </div>
            <div class="space-y-4">
              {#each shop.reviews.recent as review, i (i)}
                <div class="pb-4 border-b border-border-light last:border-0">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="flex gap-0.5">
                      {#each [1, 2, 3, 4, 5] as s (s)}
                        <Star
                          size={12}
                          class={s <= review.rating ? "text-warning fill-warning" : "text-border"}
                        />
                      {/each}
                    </div>
                    <span class="text-xs text-text-muted">{review.date}</span>
                  </div>
                  <p class="text-sm text-text-secondary">{review.text}</p>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- About Tab -->
      {#if activeTab === "about"}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card p-5">
            <h3 class="text-base font-semibold text-text-primary mb-4">
              Shop Details
            </h3>
            <ul class="space-y-3">
              {#each shopDetails as [label, value] (label)}
                <li class="flex items-center justify-between text-sm border-b border-border-light pb-2 last:border-0">
                  <span class="text-text-secondary">{label}</span>
                  <span class="font-medium text-text-primary">{value}</span>
                </li>
              {/each}
            </ul>
          </div>
          <div class="card p-5">
            <h3 class="text-base font-semibold text-text-primary mb-4">
              Communication
            </h3>
            <div class="space-y-4">
              {#each communication as [title, content] (title)}
                <div>
                  <h4 class="text-sm font-semibold text-text-primary mb-1">{title}</h4>
                  <p class="text-xs text-text-secondary bg-bg-page rounded-lg p-3">
                    {content}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else if !hasSearched && !error && !(loading && mode === "deep")}
    <ToolEmpty
      icon={Store}
      title="A shop's full picture will appear here"
      hint="Enter a shop name on the left and we'll lay out its listings, reviews, and public stats — quietly, in one place."
    >
      {#snippet preview()}
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-teal to-teal-dark"></div>
          <div>
            <p class="text-[0.9375rem] font-semibold text-text-primary leading-tight">CaitlynMinimalist</p>
            <p class="entry-meta mt-0.5">Dainty, personalized jewelry</p>
          </div>
        </div>
        <ul class="space-y-2.5">
          {#each [["Monthly sales", "—"], ["Active listings", "—"], ["Average price", "—"], ["Total reviews", "—"]] as [label, value] (label)}
            <li class="flex items-center justify-between text-sm border-b border-border-light pb-2 last:border-0">
              <span class="text-text-secondary">{label}</span>
              <span class="font-medium text-text-muted">{value}</span>
            </li>
          {/each}
        </ul>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

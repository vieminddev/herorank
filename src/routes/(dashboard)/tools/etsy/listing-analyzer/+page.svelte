<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, ExternalLink, Star, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, LoaderCircle, CircleAlert, FileText } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type ScoreKey = "title" | "tags" | "images" | "video" | "description";
  type FeedbackItem = { status: "good" | "warning" | "error"; text: string };
  type ScoreData = { score: number; feedback: { clarity: FeedbackItem[]; seo: FeedbackItem[] } };

  // Response shape per BA spec §4.1 (maps onto the former MOCK_LISTING). `stats.views` is
  // intentionally absent — Etsy v3 exposes no views for others' listings (PM Q7: remove,
  // don't fabricate). `estimatedSales`/`estimatedRevenue` are estimates → EstimatedBadge.
  interface ListingResult {
    title: string;
    shop: string;
    price: string;
    rating: number;
    numRatings: number;
    date: string;
    url?: string;
    imageUrl: string | null;
    scores: Record<ScoreKey, ScoreData>;
    stats: {
      estimatedSales: number;
      estimatedRevenue: string;
      faves: number;
    };
  }

  let listingInput = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let notFound = $state(false);
  let expandedScore = $state<ScoreKey | null>(null);
  let listing = $state<ListingResult | null>(null);

  const scoreKeys: ScoreKey[] = ["title", "tags", "images", "video", "description"];
  const cap = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!listingInput.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    notFound = false;

    const res = await callTool<ListingResult>("listing-analyzer", {
      listing: listingInput.trim(),
    });

    if (res.ok) {
      listing = res.data;
      hasSearched = true;
      await invalidateAll(); // refresh Header credits badge
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else if (res.status === 404) {
      notFound = true;
      listing = null;
      hasSearched = true;
    } else {
      error = res.message;
    }
    loading = false;
  };
</script>

<ToolPageLayout
  title="Listing Optimizer"
  description="Paste a listing and we'll read it the way a buyer's search does — then point out the small fixes that help it get found."
>
  {#snippet controls()}
    <!-- Search -->
    <form onsubmit={handleSearch}>
      <label class="field-label" for="listing-input">Which listing should we look at?</label>
      <div class="field-wrap">
        <span class="field-affix"><Search size={16} /></span>
        <input
          id="listing-input"
          type="text"
          bind:value={listingInput}
          placeholder="e.g. 4511075902"
          class="field"
          data-testid="listing-input"
        />
      </div>
      <p class="field-hint">A full Etsy URL or just the listing ID — either works.</p>
      <button
        type="submit"
        disabled={loading || !listingInput.trim()}
        class="btn btn-primary w-full justify-center mt-4"
        data-testid="listing-submit"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Reading it...{:else}Check it{/if}
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

  {#if notFound}
    <ToolEmpty icon={FileText} title="We couldn't find that listing" hint="Double-check the URL or ID and give it another go — a full Etsy link or just the listing ID both work." />
  {/if}

  {#if hasSearched && listing}
    <div class="animate-fade-in">
      <!-- Listing Header -->
      <div class="flex flex-col md:flex-row gap-6">
        <!-- Product image (real Etsy photo) -->
        {#if listing.imageUrl}
          <img src={listing.imageUrl} alt={listing.title} loading="lazy" class="w-full md:w-56 h-56 rounded-lg object-cover flex-shrink-0" />
        {:else}
          <div class="w-full md:w-56 h-56 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0">
            <span class="text-text-muted text-xs">No image</span>
          </div>
        {/if}

        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1 leading-snug">
            {listing.title}
          </h2>
          <span class="text-sm text-teal">
            {listing.shop}
          </span>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
            <span class="text-lg font-semibold text-text-primary">
              {listing.price}
            </span>
            <div class="flex items-center gap-1">
              {#each [1, 2, 3, 4, 5] as s}
                <Star
                  size={12}
                  class={s <= listing.rating ? "text-warning fill-warning" : "text-border"}
                />
              {/each}
              <span class="text-xs text-text-muted">
                {listing.rating} ({listing.numRatings})
              </span>
            </div>
            <span class="text-xs text-text-muted">{listing.date}</span>
            {#if listing.url}
              <a
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                class="copy-link"
              >
                <ExternalLink size={11} /> View on Etsy
              </a>
            {/if}
          </div>

          <!-- Score Summary Bars -->
          <div class="mt-5 space-y-2.5">
            {#each scoreKeys as key}
              <ScoreBar label={cap(key)} score={listing.scores[key].score} />
            {/each}
          </div>
        </div>
      </div>

      <hr class="rule my-8" />

      <!-- Stats Row. Views StatCard removed (PM Q7): Etsy v3 exposes no views for others'
           listings, so we do not fabricate one. Sales/Revenue carry an Estimated badge. -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-5">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="section-kicker">Estimated sales</span>
            <EstimatedBadge />
          </div>
          <div class="text-2xl font-semibold tracking-tight text-text-primary">{listing.stats.estimatedSales}</div>
          <p class="text-xs text-text-muted mt-0.5">per month</p>
        </div>
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="section-kicker">Estimated revenue</span>
            <EstimatedBadge />
          </div>
          <div class="text-2xl font-semibold tracking-tight text-text-primary">{listing.stats.estimatedRevenue}</div>
          <p class="text-xs text-text-muted mt-0.5">per month</p>
        </div>
        <div>
          <span class="section-kicker">Faves</span>
          <div class="text-2xl font-semibold tracking-tight text-text-primary mt-1">{listing.stats.faves}</div>
        </div>
      </div>

      <hr class="rule my-8" />

      <!-- Detailed Score Sections -->
      <p class="section-kicker mb-1">Where to look next</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">A closer read, section by section</h2>
      <p class="lead text-sm mb-5">Open any line to see what's working and what's worth a tweak.</p>
      <div class="entry-list">
        {#each scoreKeys as key}
          {@const scoreData = listing.scores[key]}
          {@const isExpanded = expandedScore === key}
          {@const label = cap(key)}
          <div class="entry !block !py-0">
            <button
              onclick={() => (expandedScore = isExpanded ? null : key)}
              class="w-full flex items-center justify-between py-4 text-left"
              data-testid="score-toggle-{key}"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="text-sm font-medium text-text-primary">{label}</span>
                <EstimatedBadge label="Est." tooltip="Rule-based audit score estimated from public listing data — not an official Etsy figure." />
                <div class="flex-1 max-w-md hidden sm:block">
                  <div class="score-bar">
                    <div
                      class="score-bar-fill"
                      style="width: {scoreData.score}%; background: {scoreData.score >= 70 ? 'var(--score-high)' : scoreData.score >= 40 ? 'var(--score-medium)' : 'var(--score-low)'}"
                    ></div>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="text-sm font-semibold tabular-nums"
                  style="color: {scoreData.score >= 70 ? 'var(--score-high)' : scoreData.score >= 40 ? 'var(--score-medium)' : 'var(--score-low)'}"
                >
                  {scoreData.score}/100
                </span>
                {#if isExpanded}<ChevronUp size={16} class="text-text-muted" />{:else}<ChevronDown size={16} class="text-text-muted" />{/if}
              </div>
            </button>

            {#if isExpanded}
              <div class="pb-5 pl-1 animate-fade-in">
                {#if scoreData.feedback.clarity.length > 0}
                  <div class="mb-4">
                    <h4 class="section-kicker mb-2 flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                      Clarity
                    </h4>
                    <ul class="space-y-1.5">
                      {#each scoreData.feedback.clarity as item}
                        <li class="flex items-start gap-2 text-xs text-text-secondary">
                          {#if item.status === "good"}
                            <CheckCircle size={12} class="text-success flex-shrink-0 mt-0.5" />
                          {:else if item.status === "warning"}
                            <AlertCircle size={12} class="text-warning flex-shrink-0 mt-0.5" />
                          {:else}
                            <XCircle size={12} class="text-danger flex-shrink-0 mt-0.5" />
                          {/if}
                          <span>{item.text}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                {#if scoreData.feedback.seo.length > 0}
                  <div>
                    <h4 class="section-kicker mb-2 flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-teal"></span>
                      SEO
                    </h4>
                    <ul class="space-y-1.5">
                      {#each scoreData.feedback.seo as item}
                        <li class="flex items-start gap-2 text-xs text-text-secondary">
                          {#if item.status === "good"}
                            <CheckCircle size={12} class="text-success flex-shrink-0 mt-0.5" />
                          {:else if item.status === "warning"}
                            <AlertCircle size={12} class="text-warning flex-shrink-0 mt-0.5" />
                          {:else}
                            <XCircle size={12} class="text-danger flex-shrink-0 mt-0.5" />
                          {/if}
                          <span>{item.text}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if !error && !notFound}
    <ToolEmpty icon={FileText} title="Your listing's read will appear here" hint="Paste a listing on the left and we'll read it the way a buyer's search does — section by section, with the small fixes that help it get found.">
      {#snippet preview()}
        <div class="flex items-start gap-4">
          <div class="w-16 h-16 rounded-lg bg-gradient-to-br from-bg-page to-border shrink-0"></div>
          <div class="flex-1 min-w-0">
            <p class="text-[0.8125rem] font-medium text-text-primary leading-snug">Handmade Ceramic Coffee Mug · Rustic Blue Pottery</p>
            <span class="text-xs text-teal">BlueClayStudio</span>
          </div>
        </div>
        <div class="mt-4 space-y-2.5">
          {#each [{ l: "Title", n: 88 }, { l: "Tags", n: 72 }, { l: "Images", n: 95 }] as ex (ex.l)}
            <ScoreBar label={ex.l} score={ex.n} />
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

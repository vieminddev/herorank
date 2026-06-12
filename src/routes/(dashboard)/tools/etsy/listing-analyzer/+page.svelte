<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import StatCard from "$lib/components/ui/StatCard.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import { Search, ExternalLink, Star, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle } from "lucide-svelte";

  const MOCK_LISTING = {
    title: 'KIT-836 WEEKLY || "Class Time" - Weekly Kit Planner Stickers',
    shop: "PlannerKate1",
    price: "$3.00",
    rating: 0,
    numRatings: 0,
    date: "May 25, 2026",
    scores: {
      title: { score: 100, feedback: {
        clarity: [
          { status: "good", text: "No heavily repeated words in the title. Great job!" },
          { status: "good", text: "The title length is within the recommended range for clarity and scannability. Good job!" },
          { status: "good", text: "The average word length in the title is 5.8 characters, which is comfortable for reading." },
          { status: "good", text: "The use of capitalization in the title is within a reasonable range." },
          { status: "good", text: "The title uses a consistent delimiter style, enhancing readability." },
          { status: "good", text: "No emoji or decorative symbols detected in the title. Good job!" },
        ],
        seo: [
          { status: "good", text: "The title has a good variety of unique words, enhancing searchability." },
          { status: "good", text: "The title length and word count are within the recommended range for searchability. Good job!" },
          { status: "good", text: 'The title includes 1 tag(s): Planner Stickers. This helps improve searchability.' },
        ],
      }},
      tags: { score: 90, feedback: {
        clarity: [
          { status: "good", text: "Tags are relevant and descriptive." },
          { status: "warning", text: "Consider adding more long-tail keywords for better targeting." },
        ],
        seo: [
          { status: "good", text: "Good mix of broad and specific tags." },
        ],
      }},
      images: { score: 77, feedback: {
        clarity: [
          { status: "good", text: "Multiple product images provided." },
          { status: "warning", text: "Consider adding lifestyle/mockup images to show the product in use." },
          { status: "error", text: "Main image could benefit from better contrast." },
        ],
        seo: [],
      }},
      video: { score: 0, feedback: {
        clarity: [
          { status: "error", text: "No video attached to this listing." },
          { status: "warning", text: "Listings with video receive 40% more views on average." },
        ],
        seo: [],
      }},
      description: { score: 100, feedback: {
        clarity: [
          { status: "good", text: "Description is well-structured with clear sections." },
          { status: "good", text: "Good use of bullet points for readability." },
        ],
        seo: [
          { status: "good", text: "Description includes relevant keywords." },
        ],
      }},
    },
    stats: {
      estimatedSales: 3,
      estimatedRevenue: "$9.00",
      faves: 1,
      views: 60,
    },
  };

  type ScoreKey = "title" | "tags" | "images" | "video" | "description";

  let listingInput = $state("");
  let hasSearched = $state(false);
  let expandedScore = $state<ScoreKey | null>(null);

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    if (listingInput.trim()) hasSearched = true;
  };

  const listing = MOCK_LISTING;
  const scoreKeys = Object.keys(listing.scores) as ScoreKey[];
  const cap = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
</script>

<ToolPageLayout
  title="Listing Analyzer"
  description="Get instant feedback on any Etsy listing and clear fixes to improve visibility. Paste a listing URL or ID to start."
>
  <!-- Search -->
  <form onsubmit={handleSearch} class="mb-8">
    <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1" for="listing-input">
      Listing URL or ID
      <span class="text-danger text-xs font-normal">(required)</span>
    </label>
    <div class="flex gap-3">
      <div class="relative flex-1">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          id="listing-input"
          type="text"
          bind:value={listingInput}
          placeholder="e.g. 4511075902"
          class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white"
          data-testid="listing-input"
        />
      </div>
      <button
        type="submit"
        class="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
        style="background: var(--navy)"
        data-testid="listing-submit"
      >
        Analyze
      </button>
    </div>
  </form>

  {#if hasSearched}
    <div class="animate-fade-in">
      <!-- Listing Header -->
      <div class="card p-6 mb-6">
        <div class="flex flex-col md:flex-row gap-6">
          <!-- Image placeholder -->
          <div class="w-full md:w-64 h-64 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0">
            <span class="text-text-muted text-xs">Product Image</span>
          </div>

          <div class="flex-1 min-w-0">
            <h2 class="text-lg font-bold text-text-primary mb-1 leading-snug">
              {listing.title}
            </h2>
            <a href="#" class="text-sm text-teal hover:underline">
              {listing.shop}
            </a>

            <div class="flex flex-wrap items-center gap-3 mt-2">
              <span class="text-lg font-bold text-text-primary">
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
              <span class="text-xs text-text-muted">📅 {listing.date}</span>
              <a
                href="#"
                class="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded px-2 py-1"
              >
                <ExternalLink size={10} /> View on Etsy
              </a>
            </div>

            <!-- Score Summary Bars -->
            <div class="mt-4 space-y-2">
              {#each scoreKeys as key}
                <ScoreBar label={cap(key)} score={listing.scores[key].score} />
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Estimated Sales" value={listing.stats.estimatedSales} subtitle="0.2 per day" />
        <StatCard label="Estimated Revenue" value={listing.stats.estimatedRevenue} subtitle="0.53 per day" />
        <StatCard label="Faves" value={listing.stats.faves} subtitle="0.1 per day" />
        <StatCard label="Views" value={listing.stats.views} subtitle="3.5 per day" />
      </div>

      <!-- Detailed Score Sections -->
      <div class="space-y-3">
        {#each scoreKeys as key}
          {@const scoreData = listing.scores[key]}
          {@const isExpanded = expandedScore === key}
          {@const label = cap(key)}
          <div class="card overflow-hidden">
            <button
              onclick={() => (expandedScore = isExpanded ? null : key)}
              class="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-page/50 transition-colors"
              data-testid="score-toggle-{key}"
            >
              <div class="flex items-center gap-4 flex-1 min-w-0">
                <span class="text-sm font-bold text-text-primary">{label}</span>
                <div class="flex-1 max-w-md">
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
                  class="text-sm font-bold"
                  style="color: {scoreData.score >= 70 ? 'var(--score-high)' : scoreData.score >= 40 ? 'var(--score-medium)' : 'var(--score-low)'}"
                >
                  {scoreData.score}/100
                </span>
                {#if isExpanded}<ChevronUp size={16} class="text-text-muted" />{:else}<ChevronDown size={16} class="text-text-muted" />{/if}
              </div>
            </button>

            {#if isExpanded}
              <div class="px-5 pb-5 animate-fade-in">
                <div class="border-t border-border-light pt-4">
                  {#if scoreData.feedback.clarity.length > 0}
                    <div class="mb-4">
                      <h4 class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-2 flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-success"></span>
                        Clarity
                      </h4>
                      <ul class="space-y-1.5">
                        {#each scoreData.feedback.clarity as item}
                          <li class="flex items-start gap-2 text-xs text-text-secondary">
                            {#if item.status === "good"}
                              <CheckCircle size={12} class="text-success flex-shrink-0" />
                            {:else if item.status === "warning"}
                              <AlertCircle size={12} class="text-warning flex-shrink-0" />
                            {:else}
                              <XCircle size={12} class="text-danger flex-shrink-0" />
                            {/if}
                            <span>{item.text}</span>
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                  {#if scoreData.feedback.seo.length > 0}
                    <div>
                      <h4 class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-2 flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full bg-teal"></span>
                        SEO
                      </h4>
                      <ul class="space-y-1.5">
                        {#each scoreData.feedback.seo as item}
                          <li class="flex items-start gap-2 text-xs text-text-secondary">
                            {#if item.status === "good"}
                              <CheckCircle size={12} class="text-success flex-shrink-0" />
                            {:else if item.status === "warning"}
                              <AlertCircle size={12} class="text-warning flex-shrink-0" />
                            {:else}
                              <XCircle size={12} class="text-danger flex-shrink-0" />
                            {/if}
                            <span>{item.text}</span>
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</ToolPageLayout>

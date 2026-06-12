<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Search, TrendingUp } from "lucide-svelte";

  let listingUrl = $state("");
  let keyword = $state("");
  let hasSearched = $state(false);

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    if (listingUrl.trim() && keyword.trim()) hasSearched = true;
  };

  const mockHistory = [
    { date: "Jun 12", rank: 15 }, { date: "Jun 11", rank: 18 }, { date: "Jun 10", rank: 22 },
    { date: "Jun 9", rank: 19 }, { date: "Jun 8", rank: 25 }, { date: "Jun 7", rank: 28 },
    { date: "Jun 6", rank: 32 },
  ];
  // Reverse once for chart display order (oldest -> newest), matching React's reverse() call.
  const chartHistory = [...mockHistory].reverse();
</script>

<ToolPageLayout title="Rank Check" description="See where your listing ranks for any keyword on Etsy. Track your position and measure improvement over time.">
  <form onsubmit={handleSearch} class="mb-8">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1" for="rank-url">Listing URL or ID <span class="text-danger text-xs font-normal">(required)</span></label>
        <div class="relative"><Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input id="rank-url" type="text" bind:value={listingUrl} placeholder="e.g. 4511075902" class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" data-testid="rank-url" /></div>
      </div>
      <div>
        <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1" for="rank-keyword">Keyword <span class="text-danger text-xs font-normal">(required)</span></label>
        <div class="relative"><Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input id="rank-keyword" type="text" bind:value={keyword} placeholder="e.g. personalized necklace" class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" data-testid="rank-keyword" /></div>
      </div>
    </div>
    <button type="submit" class="mt-3 px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style="background: var(--navy)" data-testid="rank-submit">Check Rank</button>
  </form>
  {#if hasSearched}
    <div class="animate-fade-in space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-5 text-center"><div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Current Rank</div><div class="text-4xl font-bold text-teal">#15</div><div class="flex items-center justify-center gap-1 mt-1 text-xs text-success"><TrendingUp size={12} /> Up 3 spots</div></div>
        <div class="card p-5 text-center"><div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Best Rank</div><div class="text-4xl font-bold text-success">#12</div><div class="text-xs text-text-muted mt-1">Jun 5, 2026</div></div>
        <div class="card p-5 text-center"><div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Keyword</div><div class="text-lg font-bold text-text-primary">{keyword || "personalized necklace"}</div><div class="text-xs text-text-muted mt-1">12,847 competing listings</div></div>
      </div>
      <div class="card p-5">
        <h3 class="text-base font-bold text-text-primary mb-4">Rank History (7 days)</h3>
        <div class="flex items-end gap-2 h-40">
          {#each chartHistory as d, i}
            {@const maxRank = 40}
            {@const height = ((maxRank - d.rank) / maxRank) * 100}
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-[10px] font-semibold text-text-primary">#{d.rank}</span>
              <div class="w-full rounded-t" style="height: {height}%; background: var(--teal); opacity: {0.5 + (i / chartHistory.length) * 0.5}"></div>
              <span class="text-[10px] text-text-muted">{d.date}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</ToolPageLayout>

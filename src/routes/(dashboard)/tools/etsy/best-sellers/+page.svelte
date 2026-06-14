<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { ArrowUpDown, Trophy, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type ViewMode = "shops" | "listings";

  // Response shape per BA spec §4.5 (served from cron-built cache). `sales` and `rank` are
  // ESTIMATED (review-velocity ranking) — there is no official Etsy best-seller list, so the
  // page carries a top-level "Estimated rankings" note and the Sales column an Est. badge.
  interface BestSellerShop {
    rank: number;
    name: string;
    country: string;
    countryCode: string;
    sales: number;
    listings: number;
    faves: number;
    rating: number;
    opened: string;
  }

  // Seed categories the cron pre-builds (BA spec §5.2).
  const CATEGORIES = [
    "All", "Jewelry", "Home Decor", "Digital Downloads", "Art", "Clothing",
    "Party Supplies", "Stickers", "Craft Supplies", "Wedding", "Candles", "Bags & Purses",
  ];

  let viewMode = $state<ViewMode>("shops");
  let category = $state("All");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let shops = $state<BestSellerShop[]>([]);
  let loaded = $state(false);
  const modes: ViewMode[] = ["shops", "listings"];

  // Manual trigger only — no auto-load on mount. Charging a credit just because the user
  // navigated here (without asking for data) is bad UX, so we gate the call behind a button.
  // Changing the category does NOT re-fetch; the user re-clicks "Load best sellers" to refresh.
  const load = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ shops: BestSellerShop[] }>("best-sellers", {
      category: category === "All" ? undefined : category,
      view: "shops",
    });

    if (res.ok) {
      shops = res.data.shops ?? [];
      loaded = true;
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
  title="Best Sellers"
  description="A little inspiration from shops doing well right now. Pick a category, load it up, and see who's moving — rankings are our estimate from public signals, not an official Etsy list."
>
  {#snippet controls()}
    <label for="best-sellers-category" class="field-label">Which category?</label>
    <select id="best-sellers-category" bind:value={category} disabled={loading} class="field appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
      {#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
    </select>
    <p class="field-hint">Switching category won't reload on its own — tap the button again to refresh.</p>
    <button type="button" onclick={load} disabled={loading} class="btn btn-primary w-full justify-center mt-4">
      {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}{loaded ? "Refresh" : "Load best sellers"}{/if}
    </button>
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

  {#if loading}
    <div class="resting animate-fade-in"><LoaderCircle size={20} class="animate-spin text-teal" /><p class="text-sm text-text-secondary mt-1">Gathering top shops…</p></div>
  {:else if !loaded}
    <ToolEmpty
      icon={Trophy}
      title="Top shops will appear here"
      hint="Pick a category and tap Load best sellers to see who's moving right now — ranked by our estimate from public signals."
    >
      {#snippet preview()}
        <div class="space-y-3">
          {#each [{ rank: 1, name: "CaitlynMinimalist", place: "United States" }, { rank: 2, name: "ModParty", place: "United States" }, { rank: 3, name: "Beadboat1", place: "United States" }] as ex (ex.rank)}
            <div class="flex items-center gap-3">
              <span class="text-sm font-semibold text-text-muted tabular-nums w-5">{ex.rank}</span>
              <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-xs font-bold text-teal flex-shrink-0">{ex.name.substring(0, 2)}</div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-text-primary truncate">{ex.name}</p>
                <p class="entry-meta">{ex.place}</p>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {:else}
    <div class="animate-fade-in">
      <!-- Header with toggle -->
      <div class="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <p class="section-kicker mb-1 inline-flex items-center gap-2">Top {viewMode === "shops" ? "shops" : "listings"} <EstimatedBadge label="Estimated rankings" /></p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">Who's selling well right now</h2>
        </div>
        <div class="flex gap-1 bg-bg-page rounded-lg p-0.5">
          {#each modes as mode (mode)}
            <button
              type="button"
              aria-pressed={viewMode === mode}
              onclick={() => (viewMode = mode)}
              class="px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-colors {viewMode === mode ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}"
            >
              {mode}
            </button>
          {/each}
        </div>
      </div>
      <p class="lead text-sm mb-5">Ranked by estimated sales (review velocity). These are estimates from public Etsy data.</p>
      <hr class="rule mb-1" />

      {#if viewMode === "listings"}
        <div class="resting"><p class="text-sm text-text-secondary">Top listings view is on the way.</p><p class="text-[0.8125rem]">Showing top shops for now.</p></div>
      {:else if shops.length === 0}
        <div class="resting"><p class="text-sm text-text-secondary">Nothing indexed for this category yet.</p><p class="text-[0.8125rem]">It's queued for the next data refresh — check back soon.</p></div>
      {:else}
        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-border-light">
                <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="flex items-center gap-1 cursor-pointer hover:text-text-primary">Rank <ArrowUpDown size={10} /></span>
                </th>
                <th class="text-left px-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="flex items-center gap-1 cursor-pointer hover:text-text-primary">Shop <ArrowUpDown size={10} /></span>
                </th>
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="inline-flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Sales <EstimatedBadge label="Est." /> <ArrowUpDown size={10} /></span>
                </th>
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Listings <ArrowUpDown size={10} /></span>
                </th>
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Faves <ArrowUpDown size={10} /></span>
                </th>
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Rating <ArrowUpDown size={10} /></span>
                </th>
                <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary">
                  <span class="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Opened <ArrowUpDown size={10} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {#each shops as shop (shop.rank)}
                <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer">
                  <td class="pr-4 py-3 text-sm font-semibold text-text-muted tabular-nums">{shop.rank}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-xs font-bold text-teal flex-shrink-0">
                        {shop.name.substring(0, 2)}
                      </div>
                      <div>
                        <span class="text-sm font-semibold text-text-primary hover:text-teal transition-colors">
                          {shop.name}
                        </span>
                        <div class="text-[10px] text-text-muted">
                          {shop.country} <span class="uppercase">{shop.countryCode}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-text-primary text-right font-medium tabular-nums">
                    {shop.sales.toLocaleString()}
                  </td>
                  <td class="px-4 py-3 text-sm text-text-primary text-right tabular-nums">
                    {shop.listings.toLocaleString()}
                  </td>
                  <td class="px-4 py-3 text-sm text-text-primary text-right tabular-nums">
                    {shop.faves.toLocaleString()}
                  </td>
                  <td class="px-4 py-3 text-sm text-text-primary text-right tabular-nums">{shop.rating}</td>
                  <td class="pl-4 py-3 text-sm text-text-muted text-right">{shop.opened}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</ToolPageLayout>

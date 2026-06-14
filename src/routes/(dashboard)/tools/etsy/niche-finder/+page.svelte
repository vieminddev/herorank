<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, Compass, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type Level = "low" | "medium" | "high";

  // Response shape per BA spec §4.4. `demand` and `growth` are estimates; `competition`,
  // `avgPrice`, `listings` are derived from real result counts. `growth` may be "—" until
  // ≥2 cron history cycles exist (cold start).
  interface NicheRow {
    niche: string;
    competition: Level;
    demand: Level;
    avgPrice: string;
    listings: number;
    growth: string;
  }

  let query = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let niches = $state<NicheRow[]>([]);

  const handleSearch = async (e: Event) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ niches: NicheRow[] }>("niche-finder", {
      query: query.trim(),
    });

    if (res.ok) {
      niches = res.data.niches ?? [];
      hasSearched = true;
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<ToolPageLayout title="Niche Finder" description="Every shop starts with a niche. Tell us a category and we'll surface a few corners that still have room to grow — demand and competition shown as honest estimates.">
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label for="niche-query" class="field-label">What corner of Etsy are you exploring?</label>
      <div class="relative">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input id="niche-query" type="text" bind:value={query} placeholder="e.g. jewelry, home decor, digital downloads" class="field pl-10" />
      </div>
      <p class="field-hint">A broad category works best — we'll branch it into narrower niches worth a look.</p>
      <button type="submit" disabled={loading || !query.trim()} class="btn btn-primary w-full justify-center mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Exploring…{:else}Explore niches{/if}
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

  {#if hasSearched && niches.length === 0 && !error}
    <div class="resting animate-fade-in">
      <p class="text-sm text-text-secondary">Nothing surfaced for that one.</p>
      <p class="text-[0.8125rem]">Try a broader category or a different keyword.</p>
    </div>
  {/if}

  {#if hasSearched && niches.length}
    <div class="animate-fade-in">
      <p class="section-kicker mb-1">What we found</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">{niches.length} niches worth a look</h2>
      <p class="lead text-sm mb-5">Lower competition with steady demand is the sweet spot. Demand and growth are estimates.</p>
      <hr class="rule mb-1" />
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr class="border-b border-border-light">
            <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">Niche</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-text-secondary">Competition</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-text-secondary"><span class="inline-flex items-center gap-1.5">Demand <EstimatedBadge label="Est." /></span></th>
            <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">Avg price</th>
            <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">Listings</th>
            <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary"><span class="inline-flex items-center gap-1.5 justify-end">Growth <EstimatedBadge label="Est." /></span></th>
          </tr></thead>
          <tbody>
            {#each niches as n (n.niche)}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                <td class="pr-4 py-3 text-sm font-semibold text-text-primary">{n.niche}</td>
                <td class="px-4 py-3"><Badge level={n.competition} /></td>
                <td class="px-4 py-3"><Badge level={n.demand} label={cap(n.demand)} /></td>
                <td class="px-4 py-3 text-sm text-right text-text-primary">{n.avgPrice}</td>
                <td class="px-4 py-3 text-sm text-right text-text-primary">{n.listings.toLocaleString()}</td>
                <td class="pl-4 py-3 text-sm text-right font-medium" style="color: {n.growth.startsWith('-') ? 'var(--danger)' : n.growth === '—' ? 'var(--text-muted)' : 'var(--success)'}">{n.growth}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else if !hasSearched && !error}
    <ToolEmpty
      icon={Compass}
      title="Niche ideas will appear here"
      hint="Name a category on the left and we'll branch it into narrower corners — each with an honest read on competition and demand."
    >
      {#snippet preview()}
        <div class="entry-list">
          {#each [{ niche: "Minimalist gold name necklaces", comp: "low" as const, dem: "high" as const }, { niche: "Personalized birth flower jewelry", comp: "medium" as const, dem: "high" as const }, { niche: "Dainty stacking rings", comp: "high" as const, dem: "medium" as const }] as ex (ex.niche)}
            <div class="entry !py-2.5">
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] font-semibold text-text-primary leading-snug">{ex.niche}</p>
                <div class="flex items-center gap-1.5 mt-1.5">
                  <Badge level={ex.comp} label={cap(ex.comp)} />
                  <Badge level={ex.dem} label={cap(ex.dem)} />
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

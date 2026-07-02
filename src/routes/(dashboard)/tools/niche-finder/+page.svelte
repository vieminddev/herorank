<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, Compass, LoaderCircle, CircleAlert, ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, Download } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  type Level = "low" | "medium" | "high";
  type OpportunityLabel = "sweet-spot" | "promising" | "competitive" | "low-traffic";

  interface NicheRow {
    niche: string;
    competition: Level;
    demand: Level;
    avgPrice: string;
    listings: number;
    growth: string;
    opportunity: OpportunityLabel;
  }

  const OP_META: Record<OpportunityLabel, { label: string; color: string; rank: number }> = {
    "sweet-spot":  { label: "Sweet spot",  color: "var(--teal)",       rank: 4 },
    "promising":   { label: "Promising",   color: "var(--success)",    rank: 3 },
    "competitive": { label: "Competitive", color: "var(--warning)",    rank: 2 },
    "low-traffic": { label: "Low traffic", color: "var(--text-muted)", rank: 1 },
  };

  const LEVEL_RANK: Record<Level, number> = { low: 1, medium: 2, high: 3 };

  const SEEDS = ["jewelry", "home decor", "digital art", "candles", "clothing", "stickers", "mugs", "planners", "wedding", "baby shower"];

  type SortCol = "opportunity" | "competition" | "demand" | "avgPrice" | "listings" | "growth";

  let query = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let niches = $state<NicheRow[]>([]);
  let sortCol = $state<SortCol>("opportunity");
  let sortDir = $state<"asc" | "desc">("desc");

  const parsePrice = (s: string) => {
    const n = parseFloat(s.replace(/[$,]/g, ""));
    if (s.includes("K") || s.includes("k")) return n * 1000;
    if (s.includes("M") || s.includes("m")) return n * 1_000_000;
    return n || 0;
  };
  const parseGrowth = (s: string) => s === "—" ? -Infinity : parseFloat(s.replace(/[%+]/g, "")) || 0;

  const sorted = $derived.by(() => {
    const rows = [...niches];
    rows.sort((a, b) => {
      let v = 0;
      switch (sortCol) {
        case "opportunity":  v = OP_META[a.opportunity].rank - OP_META[b.opportunity].rank; break;
        case "competition":  v = LEVEL_RANK[a.competition] - LEVEL_RANK[b.competition]; break;
        case "demand":       v = LEVEL_RANK[a.demand] - LEVEL_RANK[b.demand]; break;
        case "avgPrice":     v = parsePrice(a.avgPrice) - parsePrice(b.avgPrice); break;
        case "listings":     v = a.listings - b.listings; break;
        case "growth":       v = parseGrowth(a.growth) - parseGrowth(b.growth); break;
      }
      return sortDir === "desc" ? -v : v;
    });
    return rows;
  });

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      sortDir = sortDir === "desc" ? "asc" : "desc";
    } else {
      sortCol = col;
      sortDir = "desc";
    }
  }

  const handleSearch = async (e: Event) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    sortCol = "opportunity";
    sortDir = "desc";

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

  function exportCsv() {
    const header = ["Niche", "Opportunity", "Competition", "Demand", "Avg Price", "Listings", "Growth"];
    const lines = sorted.map((n) => [
      `"${n.niche.replace(/"/g, '""')}"`,
      OP_META[n.opportunity].label,
      n.competition,
      n.demand,
      n.avgPrice,
      n.listings,
      n.growth,
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `niches-${query.trim().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  onMount(() => {
    const q = $page.url.searchParams.get("q");
    if (q?.trim()) query = q.trim();
  });
</script>

<ToolPageLayout title="Niche Finder" description="Every shop starts with a niche. Tell us a category and we'll surface corners that still have room to grow — demand and competition shown as honest estimates." credits={3}>
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label for="niche-query" class="field-label">What corner of Etsy are you exploring?</label>
      <div class="field-wrap">
        <span class="field-affix"><Search size={16} /></span>
        <input id="niche-query" type="text" bind:value={query} placeholder="e.g. jewelry, home decor" class="field" />
      </div>
      <p class="field-hint">A broad category works best — we'll branch it into narrower niches worth a look.</p>
      <button type="submit" disabled={loading || !query.trim()} class="btn btn-primary w-full justify-center mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Exploring…{:else}Explore niches{/if}
      </button>
    </form>
    <div class="mt-4">
      <p class="text-[0.7rem] font-medium text-text-muted uppercase tracking-wide mb-2">Popular categories</p>
      <div class="flex flex-wrap gap-1.5">
        {#each SEEDS as seed (seed)}
          <button
            type="button"
            onclick={() => { query = seed; }}
            class="px-2.5 py-1 rounded-full text-[0.7rem] font-medium border border-border-light text-text-secondary hover:border-teal hover:text-teal transition-colors"
          >{seed}</button>
        {/each}
      </div>
    </div>
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
      <div class="flex items-center justify-between mb-1">
        <p class="section-kicker">What we found</p>
        <button onclick={exportCsv} class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-text-secondary hover:text-teal transition-colors">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">{niches.length} niches worth a look</h2>
      <p class="lead text-sm mb-5">Click any column header to sort. Demand and growth are estimates.</p>
      <hr class="rule mb-1" />
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border-light">
              <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">Niche</th>
              {#each ([
                { col: "opportunity" as SortCol, label: "Opportunity", align: "left",  px: "px-4", tip: "Our read of room-to-grow (demand vs competition) — a derived estimate, not a guarantee.", est: true },
                { col: "competition" as SortCol, label: "Competition", align: "left",  px: "px-4", tip: "Number of active listings — more listings means more sellers to compete with." },
                { col: "demand"      as SortCol, label: "Demand",      align: "left",  px: "px-4", tip: "Estimated from views and favorites across top listings — not an official Etsy figure.", est: true },
                { col: "avgPrice"    as SortCol, label: "Avg price",   align: "right", px: "px-4" },
                { col: "listings"    as SortCol, label: "Listings",    align: "right", px: "px-4" },
                { col: "growth"      as SortCol, label: "Growth",      align: "right", px: "pl-4",  tip: "Week-over-week change in estimated demand score.", est: true },
              ]) as h (h.col)}
                <th
                  class="{h.px} py-3 text-xs font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary transition-colors text-{h.align}"
                  onclick={() => toggleSort(h.col)}
                  title={h.tip ?? ""}
                >
                  <span class="inline-flex items-center gap-1 {h.align === 'right' ? 'justify-end' : ''}">
                    {h.label}
                    {#if h.est}<EstimatedBadge label="Est." />{/if}
                    {#if sortCol === h.col}
                      {#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}
                    {:else}
                      <ChevronsUpDown size={11} class="opacity-30" />
                    {/if}
                  </span>
                </th>
              {/each}
              <th class="pl-4 py-3 text-xs font-medium text-text-secondary text-right">Explore</th>
            </tr>
          </thead>
          <tbody>
            {#each sorted as n, i (n.niche + "-" + i)}
              {@const op = OP_META[n.opportunity] ?? OP_META["competitive"]}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                <td class="pr-4 py-3 text-sm font-semibold text-text-primary">{n.niche}</td>
                <td class="px-4 py-3">
                  <span class="inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold leading-none" style="color: {op.color}; background: {op.color}1a">{op.label}</span>
                </td>
                <td class="px-4 py-3"><Badge level={n.competition} /></td>
                <td class="px-4 py-3"><Badge level={n.demand} label={cap(n.demand)} /></td>
                <td class="px-4 py-3 text-sm text-right text-text-primary">{n.avgPrice}</td>
                <td class="px-4 py-3 text-sm text-right text-text-primary">{n.listings.toLocaleString()}</td>
                <td class="pl-4 py-3 text-sm text-right font-medium" style="color: {n.growth.startsWith('-') ? 'var(--danger)' : n.growth === '—' ? 'var(--text-muted)' : 'var(--success)'}">
                  {#if n.growth === '—'}
                    <span title="Building history — check back after the next weekly cycle">—</span>
                  {:else}
                    {n.growth}
                  {/if}
                </td>
                <td class="pl-4 py-3 text-right">
                  <a
                    href="/tools/keyword-generator?q={encodeURIComponent(n.niche)}"
                    title="Find keywords for this niche"
                    class="inline-flex items-center gap-1 text-[0.7rem] font-medium text-text-muted hover:text-teal transition-colors"
                  ><ExternalLink size={12} /></a>
                </td>
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
          {#each [
            { niche: "Minimalist gold name necklaces", op: "sweet-spot" as OpportunityLabel, comp: "low" as Level, dem: "high" as Level },
            { niche: "Personalized birth flower jewelry", op: "promising" as OpportunityLabel, comp: "medium" as Level, dem: "high" as Level },
            { niche: "Dainty stacking rings", op: "competitive" as OpportunityLabel, comp: "high" as Level, dem: "medium" as Level },
          ] as ex (ex.niche)}
            <div class="entry !py-2.5">
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] font-semibold text-text-primary leading-snug">{ex.niche}</p>
                <div class="flex items-center gap-1.5 mt-1.5">
                  <span class="inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold leading-none" style="color: {OP_META[ex.op].color}; background: {OP_META[ex.op].color}1a">{OP_META[ex.op].label}</span>
                  <Badge level={ex.comp} label={cap(ex.comp)} />
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

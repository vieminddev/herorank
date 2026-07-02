<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import SampleDataBadge from "$lib/components/ui/SampleDataBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, TrendingUp, TrendingDown, Minus, Compass, LoaderCircle, CircleAlert, Clock, Download, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // Response shape per the whitespace-finder contract. `whitespace` (0-100) is the headline
  // OPPORTUNITY score — a DERIVED estimate of demand vs supply/saturation, never a guarantee.
  // Prices are in CENTS. `newListings7d` = new competing listings per week (saturation speed).
  interface Opportunity {
    keyword: string;
    category: string;
    demandIndex: number; // 0-100 estimated demand
    trend: "up" | "down" | "stable";
    change: string; // e.g. '+12%' | '—'
    whitespace: number | null; // 0-100 derived opportunity score (higher = better)
    priceMedian: number | null;
    priceP25: number | null;
    priceP75: number | null;
    medianViews: number | null;
    hasVariationsPct: number | null;
    newListings7d: number | null; // competitors entering per week — higher = saturating faster
  }
  interface WhitespaceResponse {
    cached: boolean;
    stale?: boolean;
    filter: string | null;
    sample: boolean;
    buildingHistory: boolean;
    opportunities: Opportunity[];
  }

  // cents → "$xx" (whole dollars; sampled price snapshots, not exact).
  const fmtPrice = (cents?: number | null) =>
    cents == null ? null : `$${Math.round(cents / 100).toLocaleString()}`;

  // A price range string "P25–P75" with median, only when we have at least one bound.
  const priceRange = (o: Opportunity) => {
    const lo = fmtPrice(o.priceP25);
    const hi = fmtPrice(o.priceP75);
    const mid = fmtPrice(o.priceMedian);
    if (lo && hi) return { range: `${lo}–${hi}`, mid };
    if (mid) return { range: mid, mid: null };
    return null;
  };

  // Whitespace 0-100 → color band (green ≥67 = strong opportunity, amber ≥34, muted below).
  // Honest: it's a derived score, not a guarantee.
  const whitespaceColor = (w: number) =>
    w >= 67 ? "var(--success)" : w >= 34 ? "var(--warning, #b45309)" : "var(--text-muted)";

  type SortKey = "keyword" | "category" | "whitespace" | "demandIndex" | "trend" | "change" | "priceMedian" | "newListings7d";
  type SortDir = "asc" | "desc";
  const TREND_RANK: Record<string, number> = { up: 3, stable: 2, down: 1 };
  const parseChange = (s: string) => s === "—" || !s ? -Infinity : parseFloat(s.replace(/[%+]/g, "")) || 0;

  let filter = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let buildingHistory = $state(false);
  let isSample = $state(false);
  let stale = $state(false);
  let opportunities = $state<Opportunity[]>([]);
  let loaded = $state(false);
  let sortKey = $state<SortKey>("whitespace");
  let sortDir = $state<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = ["keyword", "category"].includes(key) ? "asc" : "desc";
    }
  };

  const sorted = $derived.by<Opportunity[]>(() => {
    const list = [...opportunities];
    const factor = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "keyword":      return a.keyword.localeCompare(b.keyword) * factor;
        case "category":     return a.category.localeCompare(b.category) * factor;
        case "whitespace":   return ((a.whitespace ?? -1) - (b.whitespace ?? -1)) * factor;
        case "demandIndex":  return ((a.demandIndex ?? 0) - (b.demandIndex ?? 0)) * factor;
        case "trend":        return ((TREND_RANK[a.trend] ?? 0) - (TREND_RANK[b.trend] ?? 0)) * factor;
        case "change":       return (parseChange(a.change) - parseChange(b.change)) * factor;
        case "priceMedian":  return ((a.priceMedian ?? -1) - (b.priceMedian ?? -1)) * factor;
        case "newListings7d": return ((a.newListings7d ?? -1) - (b.newListings7d ?? -1)) * factor;
        default: return 0;
      }
    });
    return list;
  });

  // Show the optional market columns only when at least one loaded row carries the data.
  const showPrice = $derived(opportunities.some((o) => priceRange(o) !== null));
  const showNewListings = $derived(opportunities.some((o) => o.newListings7d != null));

  function exportCsv() {
    const header = ["#", "Keyword", "Category", "Opportunity Score", "Demand Index", "Trend", "Change",
      ...(showPrice ? ["Price Median", "Price P25", "Price P75"] : []),
      ...(showNewListings ? ["New Listings/wk"] : []),
      "Etsy URL"];
    const lines = sorted.map((o, i) => [
      i + 1,
      `"${o.keyword}"`,
      `"${o.category}"`,
      o.whitespace ?? "",
      o.demandIndex,
      o.trend,
      o.change,
      ...(showPrice ? [o.priceMedian != null ? Math.round(o.priceMedian / 100) : "", o.priceP25 != null ? Math.round(o.priceP25 / 100) : "", o.priceP75 != null ? Math.round(o.priceP75 / 100) : ""] : []),
      ...(showNewListings ? [o.newListings7d ?? ""] : []),
      `"https://www.etsy.com/search?q=${encodeURIComponent(o.keyword)}"`,
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whitespace-finder${filter.trim() ? "-" + filter.trim().replace(/\s+/g, "-") : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // The filter text is sent to the backend (it re-queries the cache-read view by category/keyword).
  const load = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<WhitespaceResponse>("whitespace-finder", {
      filter: filter.trim() || undefined,
    });

    if (res.ok) {
      opportunities = res.data.opportunities ?? [];
      buildingHistory = res.data.buildingHistory ?? false;
      isSample = res.data.sample ?? false;
      stale = res.data.stale ?? false;
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

  const onFilterSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    load();
  };
</script>

<ToolPageLayout title="Whitespace Finder" description="Surfaces the best business-idea openings — keywords with strong buyer demand but low competition and slow saturation. The opportunity score is an estimate built from public Etsy signals, not a guarantee of success.">
  {#snippet controls()}
    <button type="button" onclick={load} disabled={loading} class="btn btn-primary w-full justify-center">
      {#if loading}<LoaderCircle size={14} class="animate-spin" /> Finding…{:else}{loaded ? "Refresh opportunities" : "Find opportunities"}{/if}
    </button>

    <form onsubmit={onFilterSubmit}>
      <label for="whitespace-filter" class="field-label mt-5">Narrow by category or keyword</label>
      <div class="relative">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input id="whitespace-filter" type="text" bind:value={filter} disabled={loading} placeholder="e.g. jewelry, candles…" class="field pl-10 disabled:opacity-50 disabled:cursor-not-allowed" />
      </div>
      <p class="field-hint">Filters the opportunity board to a niche. Re-queries when you press Enter or refresh.</p>
    </form>

    <div class="mt-4">
      <EstimatedBadge
        label="Opportunity score"
        method="The opportunity (whitespace) score weighs estimated demand against competing supply and how fast new listings are entering — all from public Etsy signals. It's an estimate, not a guarantee."
      />
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

  {#if loading}
    <div class="resting animate-fade-in"><LoaderCircle size={20} class="animate-spin text-teal" /><p class="text-sm text-text-secondary mt-1">Scanning niches for openings…</p></div>
  {:else if !loaded && !error}
    <ToolEmpty
      icon={Compass}
      title="The best openings will appear here"
      hint="Tap Find opportunities to surface keywords with strong demand but low competition. The opportunity score is an estimate from public signals — a starting point for your research, not a guarantee."
    >
      {#snippet preview()}
        <div class="entry-list">
          {#each [{ kw: "birth flower jewelry", w: 78, trend: "up" as const }, { kw: "minimalist desk organizer", w: 61, trend: "up" as const }, { kw: "personalized pet portrait", w: 42, trend: "stable" as const }] as ex (ex.kw)}
            <div class="entry !py-2.5">
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] font-semibold text-text-primary leading-snug">{ex.kw}</p>
                <p class="entry-meta mt-1">Opportunity {ex.w}/100</p>
              </div>
              {#if ex.trend === "up"}<TrendingUp size={14} class="text-success" />{:else}<Minus size={14} class="text-text-muted" />{/if}
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {:else if loaded && buildingHistory}
    <div class="resting animate-fade-in text-center">
      <span class="w-10 h-10 rounded-full inline-flex items-center justify-center mb-3" style="background: color-mix(in srgb, var(--teal) 9%, white)">
        <Clock size={20} class="text-teal" />
      </span>
      <p class="text-sm font-medium text-text-primary">We're still building your opportunity board</p>
      <p class="text-[0.8125rem] text-text-secondary mt-1 max-w-md mx-auto leading-relaxed">
        Opportunity scores compare live demand against competition and saturation speed, so they need real Etsy data gathered over time. Our weekly job is collecting that now — meaningful openings appear once a few cycles have run. We won't fabricate scores before then.
      </p>
    </div>
  {:else if loaded && opportunities.length === 0 && !error}
    <div class="resting animate-fade-in">
      <p class="text-sm text-text-secondary">No openings matched{filter.trim() ? ` "${filter.trim()}"` : ""}.</p>
      <p class="text-[0.8125rem]">Try a broader category, or clear the filter and refresh.</p>
    </div>
  {:else if loaded}
    <div class="animate-fade-in">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <p class="section-kicker mb-1 inline-flex items-center gap-2 flex-wrap">
            Opportunity board <EstimatedBadge label="Est." />
            {#if isSample}<SampleDataBadge />{/if}
          </p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">Where there's room to compete</h2>
        </div>
        <button onclick={exportCsv} class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-text-secondary hover:text-teal transition-colors">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <p class="lead text-sm mb-2">Ranked by opportunity score (high demand vs low competition and slow saturation). Click any column to re-sort. It's a derived estimate — use it to shortlist, then validate.</p>
      {#if stale}
        <p class="mb-3 flex items-start gap-2 text-[0.8125rem] text-text-secondary">
          <Clock size={14} class="text-text-muted flex-shrink-0 mt-0.5" />
          <span>Showing the last good snapshot — a fresher one is on its way.</span>
        </p>
      {/if}
      {#if isSample}
        <p class="mb-3 flex items-start gap-2 text-[0.8125rem] text-text-secondary">
          <CircleAlert size={14} class="text-text-muted flex-shrink-0 mt-0.5" />
          <span>No live Etsy key connected yet, so these numbers come from sample data — illustrative only, not your real market.</span>
        </p>
      {/if}
      <hr class="rule mb-1" />
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border-light">
              <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">#</th>
              {#each ([
                { key: "keyword" as SortKey,     label: "Keyword",       align: "left",  px: "px-4", badge: null },
                { key: "category" as SortKey,    label: "Category",      align: "left",  px: "px-4", badge: null },
                { key: "whitespace" as SortKey,  label: "Opportunity",   align: "right", px: "px-4", badge: "score" },
                { key: "demandIndex" as SortKey, label: "Demand index",  align: "right", px: "px-4", badge: "est" },
                { key: "trend" as SortKey,       label: "Trend",         align: "right", px: "px-4", badge: null },
                { key: "change" as SortKey,      label: "Change",        align: "right", px: "px-4", badge: null },
              ]) as col (col.key)}
                <th class="text-{col.align} {col.px} py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort(col.key)} class="inline-flex items-center gap-1 hover:text-text-primary transition-colors {col.align === 'right' ? 'justify-end w-full' : ''} {sortKey === col.key ? 'text-text-primary' : ''}">
                    {col.label}
                    {#if col.badge === "score"}<EstimatedBadge label="Score" tooltip="Opportunity (whitespace) score 0–100: a derived measure of demand vs supply and new-entrant speed. Higher (green) = more room. An estimate, not a guarantee." />{/if}
                    {#if col.badge === "est"}<EstimatedBadge label="Est." />{/if}
                    {#if sortKey === col.key}
                      {#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}
                    {:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                  </button>
                </th>
              {/each}
              {#if showPrice}
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort("priceMedian")} class="inline-flex items-center gap-1 justify-end w-full hover:text-text-primary transition-colors {sortKey === 'priceMedian' ? 'text-text-primary' : ''}" title="Price range (25th–75th percentile, median in the middle) from a sampled snapshot of top listings — indicative, not exact.">
                    Price range
                    {#if sortKey === "priceMedian"}{#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}{:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                  </button>
                </th>
              {/if}
              {#if showNewListings}
                <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort("newListings7d")} class="inline-flex items-center gap-1 justify-end w-full hover:text-text-primary transition-colors {sortKey === 'newListings7d' ? 'text-text-primary' : ''}" title="Competitors entering per week — sampled count of recently created competing listings. Higher = the niche is saturating faster.">
                    New / wk
                    {#if sortKey === "newListings7d"}{#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}{:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                  </button>
                </th>
              {/if}
              <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary">Explore</th>
            </tr>
          </thead>
          <tbody>
            {#each sorted as item, i (item.keyword + "-" + i)}
              {@const pr = priceRange(item)}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                <td class="pr-4 py-3 text-sm text-text-muted tabular-nums">{i + 1}</td>
                <td class="px-4 py-3 text-sm font-semibold text-text-primary">{item.keyword}</td>
                <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 bg-bg-page rounded-full text-text-secondary">{item.category}</span></td>
                <td class="px-4 py-3 text-right">
                  {#if item.whitespace != null}
                    <span class="text-sm font-bold px-2.5 py-1 rounded-full tabular-nums whitespace-nowrap" style="color: {whitespaceColor(item.whitespace)}; background: color-mix(in srgb, {whitespaceColor(item.whitespace)} 12%, white);" title="Opportunity (whitespace) score, derived: {item.whitespace}/100. An estimate, not a guarantee.">
                      {item.whitespace}/100
                    </span>
                  {:else}
                    <span class="text-text-muted">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-sm text-right text-text-primary tabular-nums">{item.demandIndex}/100</td>
                <td class="px-4 py-3 text-right">
                  {#if item.trend === "up"}<TrendingUp size={14} class="text-success" />{:else if item.trend === "down"}<TrendingDown size={14} class="text-danger" />{:else}<Minus size={14} class="text-text-muted" />{/if}
                </td>
                <td class="px-4 py-3 text-sm text-right font-medium tabular-nums" style="color: {item.trend === 'up' ? 'var(--success)' : item.trend === 'down' ? 'var(--danger)' : 'var(--text-muted)'}">{item.change}</td>
                {#if showPrice}
                  <td class="px-4 py-3 text-right tabular-nums">
                    {#if pr}
                      <span class="text-sm text-text-primary">{pr.range}</span>
                      {#if pr.mid}<span class="block text-[10px] text-text-muted">med {pr.mid}</span>{/if}
                    {:else}
                      <span class="text-text-muted">—</span>
                    {/if}
                  </td>
                {/if}
                {#if showNewListings}
                  <td class="pl-4 py-3 text-sm text-right tabular-nums text-text-secondary" title="Competitors entering per week — higher = saturating faster.">
                    {item.newListings7d != null ? item.newListings7d.toLocaleString() : "—"}
                  </td>
                {/if}
                <td class="pl-4 py-3 text-right">
                  <a
                    href="/tools/niche-finder?q={encodeURIComponent(item.keyword)}"
                    title="Explore niches for '{item.keyword}'"
                    class="text-text-muted hover:text-teal transition-colors inline-flex"
                  ><ExternalLink size={13} /></a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="field-hint mt-4">"New / wk" = competitors entering per week — higher means the niche is saturating faster. A high opportunity score with low new/wk is the sweet spot.</p>
    </div>
  {/if}
</ToolPageLayout>

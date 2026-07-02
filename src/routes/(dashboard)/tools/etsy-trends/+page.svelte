<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, TrendingUp, TrendingDown, Minus, ChartLine, LoaderCircle, CircleAlert, Download, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, Compass } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  // Response shape per BA spec §4.6. There is NO search-volume endpoint (PM Q9): the former
  // fabricated `searches` absolute number is replaced by `demandIndex` (0-100) rendered under
  // the "Demand Index (est.)" column. `change` is "—" until ≥2 weekly cron cycles exist.
  // Predictive next-week forecast — the differentiator. Always labelled as a forecast; confidence
  // scales with how much recorded history backs it. Optional: 'building' until ≥3 weeks exist.
  type TrendSignal = "rising" | "cooling" | "steady" | "volatile" | "building";
  interface TrendForecast {
    signal: TrendSignal;
    projectedIndex: number | null;
    slopePerWeek: number;
    confidence: "low" | "medium" | "high";
    basedOn: number;
  }
  interface TrendRow {
    keyword: string;
    category: string;
    demandIndex: number; // 0-100 estimated demand
    trend: "up" | "down" | "stable";
    change: string;
    forecast?: TrendForecast;
    // Nhịp A cron-captured market snapshot (all optional / back-compat — may be absent).
    // Prices in cents. `newListings7d` = sampled new-entrant velocity (saturation speed).
    // `whitespace` 0-100 = derived opportunity score (high demand vs low supply/entry).
    priceMedian?: number | null;
    priceP25?: number | null;
    priceP75?: number | null;
    medianViews?: number | null;
    hasVariationsPct?: number | null;
    newListings7d?: number | null;
    whitespace?: number | null;
  }

  // cents → "$xx" (whole dollars; these are sampled price snapshots, not exact).
  const fmtPrice = (cents?: number | null) =>
    cents == null ? null : `$${Math.round(cents / 100).toLocaleString()}`;

  // A price range string "P25–P75" with median, only when we have at least one bound.
  const priceRange = (t: TrendRow) => {
    const lo = fmtPrice(t.priceP25);
    const hi = fmtPrice(t.priceP75);
    const mid = fmtPrice(t.priceMedian);
    if (lo && hi) return { range: `${lo}–${hi}`, mid };
    if (mid) return { range: mid, mid: null };
    return null;
  };

  // Whitespace 0-100 → color band (green = strong opportunity). Honest: it's a derived score.
  const whitespaceColor = (w: number) =>
    w >= 67 ? "var(--success)" : w >= 34 ? "var(--warning, #b45309)" : "var(--text-muted)";

  // Presentation map for each forecast signal (label, glyph, color token).
  const SIGNAL_META: Record<TrendSignal, { label: string; glyph: string; color: string }> = {
    rising: { label: "Rising", glyph: "↑", color: "var(--success)" },
    cooling: { label: "Cooling", glyph: "↓", color: "var(--warning, #b45309)" },
    steady: { label: "Steady", glyph: "→", color: "var(--text-muted)" },
    volatile: { label: "Volatile", glyph: "↯", color: "var(--text-secondary)" },
    building: { label: "Building…", glyph: "•", color: "var(--text-muted)" },
  };
  const forecastTooltip = (f?: TrendForecast) =>
    !f || f.signal === "building" || !f.basedOn
      ? "Not enough recorded history yet — a forecast appears after a few weekly data cycles."
      : `Projected from ${f.basedOn} week${f.basedOn === 1 ? "" : "s"} of recorded demand — a forecast, not a guarantee (${f.confidence} confidence).`;

  type SortKey = "keyword" | "category" | "demandIndex" | "trend" | "change" | "priceMedian" | "newListings7d" | "whitespace" | "forecast";
  type SortDir = "asc" | "desc";

  const TREND_RANK: Record<string, number> = { up: 3, stable: 2, down: 1 };
  const SIGNAL_RANK: Record<string, number> = { rising: 4, steady: 3, volatile: 2, cooling: 1, building: 0 };
  const parseChange = (s: string) => s === "—" || !s ? -Infinity : parseFloat(s.replace(/[%+]/g, "")) || 0;

  type ViewMode = "trends" | "opportunities";
  let viewMode = $state<ViewMode>("trends");

  // In opportunities mode: only rows with whitespace, sorted by whitespace desc by default.
  const switchView = (newMode: ViewMode) => {
    if (viewMode === newMode) return;
    viewMode = newMode;
    if (newMode === "opportunities") {
      sortKey = "whitespace";
      sortDir = "desc";
    } else {
      sortKey = "demandIndex";
      sortDir = "desc";
    }
  };

  let filter = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let buildingHistory = $state(false);
  let trends = $state<TrendRow[]>([]);
  let loaded = $state(false);
  let sortKey = $state<SortKey>("demandIndex");
  let sortDir = $state<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = ["keyword", "category"].includes(key) ? "asc" : "desc";
    }
  };

  const sortedTrends = $derived.by<TrendRow[]>(() => {
    const list = [...trends];
    const factor = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "keyword":       return a.keyword.localeCompare(b.keyword) * factor;
        case "category":      return a.category.localeCompare(b.category) * factor;
        case "demandIndex":   return ((a.demandIndex ?? 0) - (b.demandIndex ?? 0)) * factor;
        case "trend":         return ((TREND_RANK[a.trend] ?? 0) - (TREND_RANK[b.trend] ?? 0)) * factor;
        case "change":        return (parseChange(a.change) - parseChange(b.change)) * factor;
        case "priceMedian":   return ((a.priceMedian ?? -1) - (b.priceMedian ?? -1)) * factor;
        case "newListings7d": return ((a.newListings7d ?? -1) - (b.newListings7d ?? -1)) * factor;
        case "whitespace":    return ((a.whitespace ?? -1) - (b.whitespace ?? -1)) * factor;
        case "forecast":      return ((SIGNAL_RANK[a.forecast?.signal ?? "building"] ?? 0) - (SIGNAL_RANK[b.forecast?.signal ?? "building"] ?? 0)) * factor;
        default: return 0;
      }
    });
    return list;
  });

  const filtered = $derived(
    sortedTrends.filter((t) => {
      if (viewMode === "opportunities" && t.whitespace == null) return false;
      return !filter || t.keyword.toLowerCase().includes(filter.toLowerCase()) || t.category.toLowerCase().includes(filter.toLowerCase());
    })
  );

  onMount(() => {
    const v = $page.url.searchParams.get("view");
    if (v === "opportunities") {
      viewMode = "opportunities";
      sortKey = "whitespace";
      sortDir = "desc";
    }
  });

  function exportCsv() {
    const header = ["#", "Keyword", "Category", "Demand Index", "Trend", "Change",
      ...(showPrice ? ["Price Median", "Price P25", "Price P75"] : []),
      ...(showNewListings ? ["New Listings/wk"] : []),
      ...(showWhitespace ? ["Opportunity Score"] : []),
      "Forecast Signal", "Projected Index"];
    const lines = filtered.map((t, i) => [
      i + 1,
      `"${t.keyword}"`,
      `"${t.category}"`,
      t.demandIndex,
      t.trend,
      t.change,
      ...(showPrice ? [t.priceMedian != null ? Math.round(t.priceMedian / 100) : "", t.priceP25 != null ? Math.round(t.priceP25 / 100) : "", t.priceP75 != null ? Math.round(t.priceP75 / 100) : ""] : []),
      ...(showNewListings ? [t.newListings7d ?? ""] : []),
      ...(showWhitespace ? [t.whitespace ?? ""] : []),
      t.forecast?.signal ?? "",
      t.forecast?.projectedIndex ?? "",
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etsy-trends${filter ? "-" + filter.replace(/\s+/g, "-") : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Show the optional market columns only when at least one loaded row carries the data.
  const showPrice = $derived(trends.some((t) => priceRange(t) !== null));
  const showNewListings = $derived(trends.some((t) => t.newListings7d != null));
  const showWhitespace = $derived(trends.some((t) => t.whitespace != null));

  // Manual trigger only — no auto-load on mount. Charging a credit just because the user
  // navigated here (without asking for data) is bad UX, so we gate the call behind a button.
  // The text `filter` is a client-side filter over already-loaded rows — it never re-fetches.
  const load = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ trends: TrendRow[]; buildingHistory?: boolean }>("etsy-trends", { filter: "" });

    if (res.ok) {
      trends = res.data.trends ?? [];
      buildingHistory = res.data.buildingHistory ?? false;
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

<ToolPageLayout title="Etsy Trends" description="A weekly read on what Etsy buyers are searching for lately. Pull the latest snapshot, then filter for the keywords on your mind — demand is an estimated index from public signals." credits={3}>
  {#snippet controls()}
    <!-- View toggle -->
    <p class="field-label">View</p>
    <div class="flex rounded-lg border border-border-light overflow-hidden mb-5">
      <button type="button" onclick={() => switchView("trends")} class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors {viewMode === 'trends' ? 'bg-teal text-white' : 'text-text-secondary hover:text-text-primary'}">
        <ChartLine size={13} /> All Trends
      </button>
      <button type="button" onclick={() => switchView("opportunities")} class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-l border-border-light transition-colors {viewMode === 'opportunities' ? 'bg-teal text-white' : 'text-text-secondary hover:text-text-primary'}">
        <Compass size={13} /> Opportunities
      </button>
    </div>

    <button type="button" onclick={load} disabled={loading} class="btn btn-primary w-full justify-center">
      {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}{loaded ? "Refresh" : "Load trends"}{/if}
    </button>

    <label for="etsy-trends-filter" class="field-label mt-5">Filter what you loaded</label>
    <div class="relative">
      <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input id="etsy-trends-filter" type="text" bind:value={filter} disabled={!loaded || loading} placeholder="By keyword or category…" class="field pl-10 disabled:opacity-50 disabled:cursor-not-allowed" />
    </div>
    <p class="field-hint">Filters the rows already loaded — it won't pull fresh data.</p>

    <div class="mt-4">
      <EstimatedBadge label="Estimated" tooltip="Demand is an estimated index from public Etsy data — Etsy publishes no search-volume figures." />
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

  {#if buildingHistory && !loading && trends.length}
    <div class="mb-5 flex items-start gap-2 text-[0.8125rem] text-text-secondary">
      <Minus size={14} class="text-text-muted flex-shrink-0 mt-0.5" />
      <span>We're still building trend history. Change percentages become meaningful after a couple of weekly data cycles.</span>
    </div>
  {/if}

  {#if loading}
    <div class="resting animate-fade-in"><LoaderCircle size={20} class="animate-spin text-teal" /><p class="text-sm text-text-secondary mt-1">Pulling the latest snapshot…</p></div>
  {:else if !loaded && !error}
    <ToolEmpty
      icon={ChartLine}
      title="This week's trends will appear here"
      hint="Tap Load trends to pull the latest snapshot, then filter for the keywords on your mind. Demand is an estimated index from public signals."
    >
      {#snippet preview()}
        <div class="entry-list">
          {#each [{ kw: "personalized name necklace", trend: "up" as const }, { kw: "birth flower jewelry", trend: "up" as const }, { kw: "minimalist gold ring", trend: "stable" as const }] as ex (ex.kw)}
            <div class="entry !py-2.5">
              <div class="flex-1 min-w-0">
                <p class="text-[0.8125rem] font-semibold text-text-primary leading-snug">{ex.kw}</p>
                <p class="entry-meta mt-1">Demand —/100</p>
              </div>
              {#if ex.trend === "up"}<TrendingUp size={14} class="text-success" />{:else}<Minus size={14} class="text-text-muted" />{/if}
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {:else if loaded && trends.length === 0 && !error}
    <div class="resting animate-fade-in">
      <p class="text-sm text-text-secondary">No trend data yet.</p>
      <p class="text-[0.8125rem]">Snapshots are built weekly — check back soon.</p>
    </div>
  {:else if loaded}
    <div class="animate-fade-in">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          {#if viewMode === "opportunities"}
            <p class="section-kicker mb-1 inline-flex items-center gap-2">Opportunity board <EstimatedBadge label="Est." /></p>
            <h2 class="text-lg font-semibold tracking-tight text-text-primary">Where there's room to compete</h2>
          {:else}
            <p class="section-kicker mb-1 inline-flex items-center gap-2">This week on Etsy <EstimatedBadge label="Est." /></p>
            <h2 class="text-lg font-semibold tracking-tight text-text-primary">What buyers are searching for</h2>
          {/if}
        </div>
        <button onclick={exportCsv} class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-text-secondary hover:text-teal transition-colors">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <p class="lead text-sm mb-5">
        {#if viewMode === "opportunities"}
          Ranked by opportunity score (high demand vs low competition and slow saturation) — a derived estimate from public signals. Click any column to re-sort.
        {:else}
          Demand is a 0–100 index from public signals. Click any column header to sort. Change is blank until trend history builds up.
        {/if}
      </p>
      <hr class="rule mb-1" />
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border-light">
              <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">#</th>
              {#if viewMode === "opportunities" && showWhitespace}
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort("whitespace")} class="inline-flex items-center gap-1 justify-end w-full hover:text-text-primary transition-colors {sortKey === 'whitespace' ? 'text-text-primary' : ''}">
                    Opportunity <EstimatedBadge label="Score" tooltip="Whitespace score 0–100: high demand vs low supply and new-entrant speed. Higher (green) = more room. A derived estimate, not a guarantee." />
                    {#if sortKey === "whitespace"}{#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}{:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                  </button>
                </th>
              {/if}
              {#each ([
                { key: "keyword" as SortKey,      label: "Keyword",      align: "left",  px: "px-4", badge: null, tip: "" },
                { key: "category" as SortKey,     label: "Category",     align: "left",  px: "px-4", badge: null, tip: "" },
                { key: "demandIndex" as SortKey,  label: "Demand index", align: "right", px: "px-4", badge: "est", tip: "" },
                { key: "trend" as SortKey,        label: "Trend",        align: "right", px: "px-4", badge: null, tip: "" },
                { key: "change" as SortKey,       label: "Change",       align: "right", px: "px-4", badge: null, tip: "" },
              ]) as col (col.key)}
                <th class="text-{col.align} {col.px} py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort(col.key)} class="inline-flex items-center gap-1 hover:text-text-primary transition-colors {col.align === 'right' ? 'justify-end w-full' : ''} {sortKey === col.key ? 'text-text-primary' : ''}">
                    {col.label}
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
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort("newListings7d")} class="inline-flex items-center gap-1 justify-end w-full hover:text-text-primary transition-colors {sortKey === 'newListings7d' ? 'text-text-primary' : ''}" title="New listings per week — sampled count of recently created competing listings. Higher = the niche is saturating faster.">
                    New / wk
                    {#if sortKey === "newListings7d"}{#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}{:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                  </button>
                </th>
              {/if}
              {#if showWhitespace && viewMode !== "opportunities"}
                <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">
                  <button onclick={() => toggleSort("whitespace")} class="inline-flex items-center gap-1 justify-end w-full hover:text-text-primary transition-colors {sortKey === 'whitespace' ? 'text-text-primary' : ''}">
                    Opportunity <EstimatedBadge label="Score" tooltip="Whitespace score 0–100: a derived measure of demand vs supply and new-entrant speed. Higher (green) = more room. A derived score, not a guarantee." />
                    {#if sortKey === "whitespace"}{#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}{:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                  </button>
                </th>
              {/if}
              <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary">
                <button onclick={() => toggleSort("forecast")} class="inline-flex items-center gap-1 justify-end w-full hover:text-text-primary transition-colors {sortKey === 'forecast' ? 'text-text-primary' : ''}">
                  Forecast <EstimatedBadge label="Forecast" tooltip="Predictive next-week demand projected from your recorded history — a forecast, not a guarantee." />
                  {#if sortKey === "forecast"}{#if sortDir === "desc"}<ChevronDown size={11} />{:else}<ChevronUp size={11} />{/if}{:else}<ChevronsUpDown size={11} class="opacity-30" />{/if}
                </button>
              </th>
              <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary">Explore</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as item, i (item.keyword + "-" + i)}
              {@const f = item.forecast}
              {@const meta = SIGNAL_META[f?.signal ?? "building"]}
              {@const pr = priceRange(item)}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                <td class="pr-4 py-3 text-sm text-text-muted tabular-nums">{i + 1}</td>
                {#if viewMode === "opportunities" && showWhitespace}
                  <td class="px-4 py-3 text-right">
                    {#if item.whitespace != null}
                      <span class="text-sm font-bold px-2.5 py-1 rounded-full tabular-nums whitespace-nowrap" style="color: {whitespaceColor(item.whitespace)}; background: color-mix(in srgb, {whitespaceColor(item.whitespace)} 12%, white);" title="Opportunity score: {item.whitespace}/100">
                        {item.whitespace}/100
                      </span>
                    {:else}
                      <span class="text-text-muted">—</span>
                    {/if}
                  </td>
                {/if}
                <td class="px-4 py-3 text-sm font-semibold text-text-primary">{item.keyword}</td>
                <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 bg-bg-page rounded-full text-text-secondary">{item.category}</span></td>
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
                  <td class="px-4 py-3 text-sm text-right tabular-nums text-text-secondary">
                    {item.newListings7d != null ? item.newListings7d.toLocaleString() : "—"}
                  </td>
                {/if}
                {#if showWhitespace && viewMode !== "opportunities"}
                  <td class="px-4 py-3 text-right">
                    {#if item.whitespace != null}
                      <span class="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap" style="color: {whitespaceColor(item.whitespace)}; background: var(--bg-page);" title="Whitespace opportunity score (derived): {item.whitespace}/100.">
                        {item.whitespace}/100
                      </span>
                    {:else}
                      <span class="text-text-muted">—</span>
                    {/if}
                  </td>
                {/if}
                <td class="pl-4 py-3 text-right">
                  <span class="inline-flex items-center gap-1.5 justify-end" title={forecastTooltip(f)}>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style="color: {meta.color}; background: var(--bg-page);">
                      {meta.glyph} {meta.label}
                    </span>
                    {#if f && f.signal !== "building" && f.projectedIndex !== null}
                      <span class="text-xs text-text-muted tabular-nums whitespace-nowrap">~{f.projectedIndex}/100</span>
                    {/if}
                  </span>
                </td>
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
    </div>
  {/if}
</ToolPageLayout>

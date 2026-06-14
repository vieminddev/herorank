<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, TrendingUp, TrendingDown, Minus, ChartLine, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // Response shape per BA spec §4.6. There is NO search-volume endpoint (PM Q9): the former
  // fabricated `searches` absolute number is replaced by `demandIndex` (0-100) rendered under
  // the "Demand Index (est.)" column. `change` is "—" until ≥2 weekly cron cycles exist.
  interface TrendRow {
    keyword: string;
    category: string;
    demandIndex: number; // 0-100 estimated demand
    trend: "up" | "down" | "stable";
    change: string;
  }

  let filter = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let buildingHistory = $state(false);
  let trends = $state<TrendRow[]>([]);
  let loaded = $state(false);

  const filtered = $derived(
    trends.filter((t) =>
      !filter || t.keyword.toLowerCase().includes(filter.toLowerCase()) || t.category.toLowerCase().includes(filter.toLowerCase())
    )
  );

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

<ToolPageLayout title="Etsy Trends" description="A weekly read on what Etsy buyers are searching for lately. Pull the latest snapshot, then filter for the keywords on your mind — demand is an estimated index from public signals.">
  {#snippet controls()}
    <button type="button" onclick={load} disabled={loading} class="btn btn-primary w-full justify-center">
      {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}{loaded ? "Refresh trends" : "Load trends"}{/if}
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
      <p class="section-kicker mb-1 inline-flex items-center gap-2">This week on Etsy <EstimatedBadge label="Est." /></p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">What buyers are searching for</h2>
      <p class="lead text-sm mb-5">Demand is a 0–100 index from public signals. Change is blank until trend history builds up.</p>
      <hr class="rule mb-1" />
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border-light">
              <th class="text-left pr-4 py-3 text-xs font-medium text-text-secondary">#</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-text-secondary">Keyword</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-text-secondary">Category</th>
              <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary"><span class="inline-flex items-center gap-1.5 justify-end">Demand index <EstimatedBadge label="Est." /></span></th>
              <th class="text-right px-4 py-3 text-xs font-medium text-text-secondary">Trend</th>
              <th class="text-right pl-4 py-3 text-xs font-medium text-text-secondary">Change</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as item, i (item.keyword)}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                <td class="pr-4 py-3 text-sm text-text-muted tabular-nums">{i + 1}</td>
                <td class="px-4 py-3 text-sm font-semibold text-text-primary">{item.keyword}</td>
                <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 bg-bg-page rounded-full text-text-secondary">{item.category}</span></td>
                <td class="px-4 py-3 text-sm text-right text-text-primary tabular-nums">{item.demandIndex}/100</td>
                <td class="px-4 py-3 text-right">
                  {#if item.trend === "up"}<TrendingUp size={14} class="text-success" />{:else if item.trend === "down"}<TrendingDown size={14} class="text-danger" />{:else}<Minus size={14} class="text-text-muted" />{/if}
                </td>
                <td class="pl-4 py-3 text-sm text-right font-medium tabular-nums" style="color: {item.trend === 'up' ? 'var(--success)' : item.trend === 'down' ? 'var(--danger)' : 'var(--text-muted)'}">{item.change}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</ToolPageLayout>

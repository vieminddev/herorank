<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import RealDataBadge from "$lib/components/ui/RealDataBadge.svelte";
  import SampleDataBadge from "$lib/components/ui/SampleDataBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { Flame, LoaderCircle, CircleAlert, Clock, TrendingUp, Download, ExternalLink, BarChart2, ArrowUp, ArrowDown } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // Response shape for POST /api/tools/selling-now (cache-read view over the cron-built
  // best-sellers index). The headline metric is REAL measured sales velocity (Δ
  // transaction_sold_count per week from weekly snapshots) — NOT an estimate. When there
  // aren't yet 2+ weekly snapshots, `buildingVelocity` is true and `sellers` falls back to
  // the ESTIMATED `sales` ranking, which we label honestly.
  interface Seller {
    rank: number;
    name: string;
    country: string;
    rating: number;
    opened: string;
    listings: number;
    faves: number;
    /** ESTIMATED annual sales — label "Est.", never "Real". */
    sales: number;
    /** REAL lifetime sales (Etsy's public transaction_sold_count). */
    soldCount?: number;
    /** REAL measured sales velocity per week — the headline when present. */
    soldPerWeek?: number | null;
    soldVelocityConfidence?: "building" | "low" | "medium" | "high";
  }

  interface SellingNowData {
    cached: boolean;
    stale?: boolean;
    category: string | null;
    sample: boolean;
    /** true => not enough weekly snapshots yet; `sellers` is ranked by ESTIMATE meanwhile. */
    buildingVelocity: boolean;
    sellers: Seller[];
  }

  // Seed categories the cron pre-builds (same set as Best Sellers).
  const CATEGORIES = [
    "All", "Jewelry", "Home Decor", "Digital Downloads", "Art", "Clothing",
    "Party Supplies", "Stickers", "Craft Supplies", "Wedding", "Candles", "Bags & Purses",
    "Bath & Beauty", "Pet Supplies", "Seasonal & Holiday", "Personalized Gifts",
    "Ceramics & Pottery", "Pet Urns & Memorials", "3D Printed Products",
  ];

  type SortKey = "rank" | "name" | "soldPerWeek" | "soldCount" | "sales" | "listings" | "faves" | "rating" | "opened";
  type SortDir = "asc" | "desc";
  const NUMERIC_KEYS: SortKey[] = ["rank", "soldPerWeek", "soldCount", "sales", "listings", "faves", "rating"];

  let category = $state("All");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let sellers = $state<Seller[]>([]);
  let meta = $state<SellingNowData | null>(null);
  let loaded = $state(false);
  let sortKey = $state<SortKey>("soldPerWeek");
  let sortDir = $state<SortDir>("desc");

  const sortBy = (key: SortKey) => {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = key === "rank" ? "asc" : NUMERIC_KEYS.includes(key) ? "desc" : "asc";
    }
  };

  const sortedSellers = $derived.by<Seller[]>(() => {
    const list = [...sellers];
    const factor = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (NUMERIC_KEYS.includes(sortKey)) {
        const an = av == null ? null : (av as number);
        const bn = bv == null ? null : (bv as number);
        if (an == null && bn == null) return 0;
        if (an == null) return 1;
        if (bn == null) return -1;
        return (an - bn) * factor;
      }
      return String(av).localeCompare(String(bv)) * factor;
    });
    return list;
  });

  function exportCsv() {
    const header = ["Rank", "Shop", "Country", "Sales/wk (Real)", "Lifetime Sales (Real)", "Est. Sales", "Listings", "Faves", "Rating", "Opened", "Etsy URL"];
    const lines = sortedSellers.map((s) => [
      s.rank,
      `"${s.name}"`,
      `"${s.country}"`,
      hasRealVelocity(s) ? Math.round(s.soldPerWeek ?? 0) : "",
      s.soldCount ?? "",
      s.sales,
      s.listings,
      s.faves,
      s.rating,
      `"${s.opened}"`,
      `"https://www.etsy.com/shop/${s.name}"`,
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selling-now-${category.toLowerCase().replace(/[\s&]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isSample = $derived(meta?.sample === true);
  // When the backend hasn't measured ≥2 weekly snapshots yet, it ranks by the ESTIMATE.
  const building = $derived(meta?.buildingVelocity === true);

  // A row shows REAL velocity only when there's an actual measured number with trustworthy
  // confidence — otherwise the row carries no live headline (or the estimate fallback applies).
  const hasRealVelocity = (s: Seller) =>
    s.soldPerWeek != null && s.soldVelocityConfidence != null && s.soldVelocityConfidence !== "building";

  // Confidence chip styling — quiet, never overstated.
  const confLabel: Record<string, string> = { low: "low conf.", medium: "med conf.", high: "high conf." };

  const freshnessLabel = $derived.by<string | null>(() => {
    if (!meta) return null;
    if (meta.stale) return "Showing the last good snapshot — refreshing soon";
    if (meta.cached) return "Up to date from our latest weekly refresh";
    return "Freshly built";
  });

  // Manual trigger only — no auto-load on mount (charging a credit just for navigating here is
  // bad UX). Changing the category does NOT re-fetch; the user re-clicks to refresh.
  const load = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<SellingNowData>("selling-now", {
      category: category === "All" ? undefined : category,
    });

    if (res.ok) {
      sellers = res.data.sellers ?? [];
      meta = res.data;
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
  title="Selling Now"
  description="Shops accelerating in real sales right now — ranked by measured sales velocity (change in lifetime sales per week from our weekly snapshots). This is measured data, not an estimate."
>
  {#snippet controls()}
    <label for="selling-now-category" class="field-label">Which category?</label>
    <select id="selling-now-category" bind:value={category} disabled={loading} class="field appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
      {#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
    </select>
    <p class="field-hint">Switching category won't reload on its own — tap the button again to refresh.</p>
    <button type="button" onclick={load} disabled={loading} class="btn btn-primary w-full justify-center mt-4">
      {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}{loaded ? "Refresh" : "Load selling now"}{/if}
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
    <div class="animate-fade-in" role="status" aria-live="polite">
      <span class="sr-only">Measuring sales velocity…</span>
      <Skeleton height="1.25rem" width="14rem" class="mb-4" />
      <div class="space-y-2.5">
        {#each Array(8) as _, i (i)}
          <div class="flex items-center gap-3">
            <Skeleton height="2.25rem" width="2.25rem" rounded="lg" />
            <Skeleton height="1rem" class="flex-1" />
            <Skeleton height="1rem" width="3rem" />
          </div>
        {/each}
      </div>
    </div>
  {:else if !loaded}
    <ToolEmpty
      icon={Flame}
      title="The fastest-rising shops will appear here"
      hint="Pick a category and tap Load selling now to see who's accelerating — ranked by real measured sales per week."
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
      <!-- Header -->
      <div class="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <p class="section-kicker mb-1 inline-flex items-center gap-2 flex-wrap">
            Accelerating now
            {#if building}<EstimatedBadge label="Estimated ranking" />{:else}<RealDataBadge label="Live" tooltip="Ranked by real measured sales velocity — Δ Etsy public lifetime sales per week. Not an estimate." />{/if}
            {#if isSample}<SampleDataBadge />{/if}
          </p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">Who's gaining sales the fastest</h2>
        </div>
        <div class="flex items-center gap-3">
          {#if freshnessLabel}
            <span class="inline-flex items-center gap-1.5 text-xs text-text-muted" title="Selling Now is built from a weekly cron refresh.">
              <Clock size={12} /> {freshnessLabel}
            </span>
          {/if}
          {#if sellers.length}
            <button onclick={exportCsv} class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-text-secondary hover:text-teal transition-colors">
              <Download size={13} /> Export CSV
            </button>
          {/if}
        </div>
      </div>

      {#if building}
        <!-- Honest banner: not enough snapshot history yet, so we rank by the ESTIMATE. -->
        <div class="mt-3 mb-5 flex items-start gap-2.5 rounded-lg border border-border bg-canvas-subtle p-3" style="background: var(--success-bg); border-color: color-mix(in srgb, var(--teal) 18%, transparent);" role="status">
          <TrendingUp size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <p class="text-[0.8125rem] leading-relaxed text-text-secondary">
            Real sales velocity needs <span class="font-semibold">≥2 weekly snapshots</span> — showing estimated ranking meanwhile. Numbers marked
            <EstimatedBadge label="Est." /> are our estimate; we'll switch to measured sales/week once enough history is collected.
          </p>
        </div>
      {:else}
        <p class="lead text-sm mb-5">
          Ranked by <span class="text-success font-semibold">real measured sales per week</span> — the change in Etsy's public lifetime sales count between weekly snapshots. Columns marked
          <span class="text-success font-semibold">Live</span>/<span class="text-success font-semibold">Real</span> are measured, not estimates; <span class="font-semibold">Est.</span> columns are our estimate.
        </p>
      {/if}
      <hr class="rule mb-1" />

      {#if sellers.length === 0}
        <div class="resting"><p class="text-sm text-text-secondary">Nothing indexed for this category yet.</p><p class="text-[0.8125rem]">It's queued for the next data refresh — check back soon.</p></div>
      {:else}
        <!-- Velocity leaderboard -->
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                {#each ([
                  { key: "rank" as SortKey,       label: "Rank",           align: "left",  badge: null },
                  { key: "name" as SortKey,       label: "Shop",           align: "left",  badge: null },
                  { key: "soldPerWeek" as SortKey, label: "Sales / wk",    align: "right", badge: building ? "est" : "live", liveTooltip: "Real sales per week — measured from weekly snapshots of Etsy's public lifetime sales count. Not an estimate." },
                  { key: "soldCount" as SortKey,  label: "Lifetime sales", align: "right", badge: "real", liveTooltip: "Real lifetime sales — Etsy's public transaction_sold_count. Not an estimate." },
                  { key: "sales" as SortKey,      label: "Est. sales",     align: "right", badge: "est" },
                  { key: "listings" as SortKey,   label: "Listings",       align: "right", badge: null },
                  { key: "faves" as SortKey,      label: "Faves",          align: "right", badge: null },
                  { key: "rating" as SortKey,     label: "Rating",         align: "right", badge: null },
                  { key: "opened" as SortKey,     label: "Opened",         align: "right", badge: null },
                ]) as col (col.key)}
                  <th class={col.align === "right" ? "!text-right" : ""}>
                    <button
                      type="button"
                      onclick={() => sortBy(col.key)}
                      aria-label="Sort by {col.label}"
                      class="inline-flex items-center gap-1 hover:text-text-primary transition-colors {col.align === 'right' ? 'justify-end' : ''} {sortKey === col.key ? 'text-text-primary' : ''}"
                    >
                      {col.label}
                      {#if col.badge === "est"}<EstimatedBadge label="Est." />{/if}
                      {#if col.badge === "live"}<RealDataBadge label="Live" tooltip={col.liveTooltip ?? ""} />{/if}
                      {#if col.badge === "real"}<RealDataBadge label="Real" tooltip={col.liveTooltip ?? ""} />{/if}
                      {#if sortKey === col.key}
                        {#if sortDir === "asc"}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}
                      {/if}
                    </button>
                  </th>
                {/each}
                <th class="!text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedSellers as shop, i (shop.name + "-" + i)}
                <tr>
                  <td class="font-semibold text-text-muted tabular-nums">{shop.rank}</td>
                  <td>
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-xs font-bold text-teal flex-shrink-0">
                        {shop.name.substring(0, 2)}
                      </div>
                      <div>
                        <span class="text-sm font-semibold text-text-primary">{shop.name}</span>
                        <div class="text-[10px] text-text-muted">{shop.country}</div>
                      </div>
                    </div>
                  </td>
                  <!-- Headline: REAL sales/week (with confidence chip) when measured; otherwise — -->
                  <td class="text-right tabular-nums">
                    {#if hasRealVelocity(shop)}
                      <span class="inline-flex items-center gap-1.5 justify-end font-semibold text-success" title="Real measured sales velocity ({shop.soldVelocityConfidence} confidence).">
                        +{Math.round(shop.soldPerWeek ?? 0).toLocaleString()}/wk
                      </span>
                      {#if shop.soldVelocityConfidence && confLabel[shop.soldVelocityConfidence]}
                        <span class="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold align-middle" style="background: var(--success-bg); color: var(--success);" title="Confidence in this measured velocity.">
                          {confLabel[shop.soldVelocityConfidence]}
                        </span>
                      {/if}
                    {:else}
                      <span class="text-text-muted" title="No measured velocity yet — still building snapshot history for this shop.">—</span>
                    {/if}
                  </td>
                  <td class="text-right font-medium tabular-nums {shop.soldCount != null ? 'text-success' : 'text-text-muted'}">
                    {shop.soldCount != null ? shop.soldCount.toLocaleString() : "—"}
                  </td>
                  <td class="text-right font-medium tabular-nums">{shop.sales.toLocaleString()}</td>
                  <td class="text-right tabular-nums">{shop.listings.toLocaleString()}</td>
                  <td class="text-right tabular-nums">{shop.faves.toLocaleString()}</td>
                  <td class="text-right tabular-nums">{shop.rating}</td>
                  <td class="text-right text-text-muted">{shop.opened}</td>
                  <td class="text-right">
                    <div class="inline-flex items-center gap-2">
                      <a
                        href="https://www.etsy.com/shop/{shop.name}"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open {shop.name} on Etsy"
                        class="text-text-muted hover:text-teal transition-colors"
                      ><ExternalLink size={13} /></a>
                      <a
                        href="/tools/shop-analyzer?shop={encodeURIComponent(shop.name)}"
                        title="Analyze {shop.name}"
                        class="text-text-muted hover:text-teal transition-colors"
                      ><BarChart2 size={13} /></a>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</ToolPageLayout>

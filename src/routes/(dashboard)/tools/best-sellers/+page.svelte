<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import RealDataBadge from "$lib/components/ui/RealDataBadge.svelte";
  import SampleDataBadge from "$lib/components/ui/SampleDataBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { ArrowUp, ArrowDown, Trophy, Flame, TrendingUp, LoaderCircle, CircleAlert, Clock, Download, ExternalLink, BarChart2 } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  interface ShopRow {
    rank: number;
    name: string;
    country: string;
    countryCode?: string;
    sales: number;
    listings: number;
    faves: number;
    rating: number;
    opened: string;
    soldCount?: number;
    soldPerWeek?: number | null;
    soldVelocityConfidence?: "building" | "low" | "medium" | "high";
  }

  type ViewMode = "best-sellers" | "selling-now";
  type SortKey = "rank" | "name" | "soldPerWeek" | "soldCount" | "sales" | "listings" | "faves" | "rating" | "opened";
  type SortDir = "asc" | "desc";

  const hasRealVelocity = (s: ShopRow) =>
    s.soldPerWeek != null && s.soldVelocityConfidence != null && s.soldVelocityConfidence !== "building";

  const confLabel: Record<string, string> = { low: "low conf.", medium: "med conf.", high: "high conf." };

  const CATEGORIES = [
    "All", "Jewelry", "Home Decor", "Digital Downloads", "Art", "Clothing",
    "Party Supplies", "Stickers", "Craft Supplies", "Wedding", "Candles", "Bags & Purses",
    "Bath & Beauty", "Pet Supplies", "Seasonal & Holiday", "Personalized Gifts",
    "Ceramics & Pottery", "Pet Urns & Memorials", "3D Printed Products",
  ];

  type ColumnDef = { key: SortKey; label: string; numeric: boolean; align: "left" | "right"; est?: boolean; real?: boolean; optional?: boolean; };
  const COLUMNS: ColumnDef[] = [
    { key: "rank",       label: "Rank",          numeric: true,  align: "left" },
    { key: "name",       label: "Shop",          numeric: false, align: "left" },
    { key: "soldPerWeek", label: "Sales / wk",   numeric: true,  align: "right", real: true, optional: true },
    { key: "soldCount",  label: "Lifetime sales", numeric: true,  align: "right", real: true, optional: true },
    { key: "sales",      label: "Est. sales",    numeric: true,  align: "right", est: true },
    { key: "listings",   label: "Listings",      numeric: true,  align: "right" },
    { key: "faves",      label: "Faves",         numeric: true,  align: "right" },
    { key: "rating",     label: "Rating",        numeric: true,  align: "right" },
    { key: "opened",     label: "Opened",        numeric: false, align: "right" },
  ];

  let viewMode = $state<ViewMode>("best-sellers");
  let category = $state("All");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let shops = $state<ShopRow[]>([]);
  let buildingVelocity = $state(false);
  let cached = $state<boolean | null>(null);
  let stale = $state(false);
  let fallback = $state(false);
  let isSample = $state(false);
  let loaded = $state(false);
  let sortKey = $state<SortKey>("rank");
  let sortDir = $state<SortDir>("asc");

  const showSoldPerWeek = $derived(viewMode === "selling-now" || shops.some(hasRealVelocity));
  const showSoldCount = $derived(shops.some((s) => s.soldCount != null));

  const visibleColumns = $derived(
    COLUMNS.filter((col) => {
      if (col.key === "soldPerWeek") return showSoldPerWeek;
      if (col.key === "soldCount") return showSoldCount;
      return true;
    }),
  );

  const sortBy = (key: SortKey, numeric: boolean) => {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = key === "rank" ? "asc" : numeric ? "desc" : "asc";
    }
  };

  const sortedShops = $derived.by<ShopRow[]>(() => {
    const col = COLUMNS.find((c) => c.key === sortKey);
    const list = [...shops];
    const factor = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (col?.numeric) {
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

  const freshnessLabel = $derived.by<string | null>(() => {
    if (cached === null) return null;
    if (stale) return "Showing the last good snapshot — refreshing soon";
    if (fallback) return "Showing popular shops — this category isn't indexed yet";
    if (cached) return "Up to date from our latest weekly refresh";
    return "Freshly built";
  });

  const switchView = (newMode: ViewMode) => {
    if (viewMode === newMode) return;
    viewMode = newMode;
    shops = [];
    loaded = false;
    error = null;
    buildingVelocity = false;
    sortKey = newMode === "selling-now" ? "soldPerWeek" : "rank";
    sortDir = newMode === "selling-now" ? "desc" : "asc";
  };

  function exportCsv() {
    const header = [
      "Rank", "Shop", "Country",
      ...(showSoldPerWeek ? ["Sales/wk (Real)"] : []),
      ...(showSoldCount ? ["Lifetime Sales (Real)"] : []),
      "Est. Sales", "Listings", "Faves", "Rating", "Opened", "Etsy URL",
    ];
    const lines = sortedShops.map((s) => [
      s.rank,
      `"${s.name}"`,
      `"${s.country}"`,
      ...(showSoldPerWeek ? [hasRealVelocity(s) ? Math.round(s.soldPerWeek ?? 0) : ""] : []),
      ...(showSoldCount ? [s.soldCount ?? ""] : []),
      s.sales, s.listings, s.faves, s.rating,
      `"${s.opened}"`,
      `"https://www.etsy.com/shop/${s.name}"`,
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${viewMode}-${category.toLowerCase().replace(/[\s&]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = async () => {
    if (loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    if (viewMode === "selling-now") {
      const res = await callTool<{ sellers: ShopRow[]; buildingVelocity: boolean; cached: boolean; stale?: boolean; sample?: boolean }>(
        "selling-now", { category: category === "All" ? undefined : category }
      );
      if (res.ok) {
        shops = res.data.sellers ?? [];
        buildingVelocity = res.data.buildingVelocity ?? false;
        cached = res.data.cached ?? true;
        stale = res.data.stale ?? false;
        fallback = false;
        isSample = res.data.sample ?? false;
        loaded = true;
        await invalidateAll();
      } else if (res.status === 402) { needsUpgrade = true; error = res.message; }
      else { error = res.message; }
    } else {
      const res = await callTool<{ shops: ShopRow[]; cached?: boolean; stale?: boolean; fallback?: boolean; sample?: boolean; mock?: boolean }>(
        "best-sellers", { category: category === "All" ? undefined : category, view: "shops" }
      );
      if (res.ok) {
        shops = res.data.shops ?? [];
        buildingVelocity = false;
        cached = res.data.cached ?? true;
        stale = res.data.stale ?? false;
        fallback = res.data.fallback ?? false;
        isSample = res.data.sample === true || res.data.mock === true;
        sortKey = "rank"; sortDir = "asc";
        loaded = true;
        await invalidateAll();
      } else if (res.status === 402) { needsUpgrade = true; error = res.message; }
      else { error = res.message; }
    }
    loading = false;
  };

  onMount(() => {
    const v = $page.url.searchParams.get("view");
    if (v === "selling-now") {
      viewMode = "selling-now";
      sortKey = "soldPerWeek";
      sortDir = "desc";
    }
  });
</script>

<ToolPageLayout
  title="Best Sellers"
  description="Shop performance at a glance — who's built the biggest following (Best Sellers) and who's accelerating fastest right now (Selling Now). Rankings are our estimate from public signals."
  credits={3}
>
  {#snippet controls()}
    <!-- View toggle -->
    <p class="field-label">View</p>
    <div class="flex rounded-lg border border-border-light overflow-hidden mb-5">
      <button
        type="button"
        onclick={() => switchView("best-sellers")}
        class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors {viewMode === 'best-sellers' ? 'bg-teal text-white' : 'text-text-secondary hover:text-text-primary'}"
      ><Trophy size={13} /> Best Sellers</button>
      <button
        type="button"
        onclick={() => switchView("selling-now")}
        class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-l border-border-light transition-colors {viewMode === 'selling-now' ? 'bg-teal text-white' : 'text-text-secondary hover:text-text-primary'}"
      ><Flame size={13} /> Selling Now</button>
    </div>

    <label for="best-sellers-category" class="field-label">Which category?</label>
    <select id="best-sellers-category" bind:value={category} disabled={loading} class="field appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
      {#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
    </select>
    <p class="field-hint">
      {#if viewMode === "selling-now"}Shops accelerating fastest in real measured sales per week.{:else}Biggest shops by estimated lifetime sales and public signals.{/if}
    </p>
    <button type="button" onclick={load} disabled={loading} class="btn btn-primary w-full justify-center mt-4">
      {#if loading}<LoaderCircle size={14} class="animate-spin" /> Loading…{:else}{loaded ? "Refresh" : viewMode === "selling-now" ? "Load Selling Now" : "Load Best Sellers"}{/if}
    </button>
  {/snippet}

  {#if error}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
        {#if needsUpgrade}<a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>{/if}
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="animate-fade-in" role="status" aria-live="polite">
      <span class="sr-only">Gathering top shops…</span>
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
      icon={viewMode === "selling-now" ? Flame : Trophy}
      title={viewMode === "selling-now" ? "Fastest-rising shops will appear here" : "Top shops will appear here"}
      hint={viewMode === "selling-now"
        ? "Tap Load Selling Now to see who's gaining sales fastest — ranked by real measured sales per week."
        : "Tap Load Best Sellers to see who's moving right now — ranked by our estimate from public signals."}
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
            {#if viewMode === "selling-now"}
              Accelerating now
              {#if buildingVelocity}<EstimatedBadge label="Estimated ranking" />{:else}<RealDataBadge label="Live" tooltip="Ranked by real measured sales velocity — Δ Etsy public lifetime sales per week. Not an estimate." />{/if}
            {:else}
              Top shops <EstimatedBadge label="Estimated rankings" />
            {/if}
            {#if isSample}<SampleDataBadge />{/if}
          </p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary">
            {viewMode === "selling-now" ? "Who's gaining sales the fastest" : "Who's selling well right now"}
          </h2>
        </div>
        <div class="flex items-center gap-3">
          {#if freshnessLabel}
            <span class="inline-flex items-center gap-1.5 text-xs text-text-muted" title="Built from a weekly cron refresh.">
              <Clock size={12} /> {freshnessLabel}
            </span>
          {/if}
          {#if shops.length}
            <button onclick={exportCsv} class="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-text-secondary hover:text-teal transition-colors">
              <Download size={13} /> Export CSV
            </button>
          {/if}
        </div>
      </div>

      {#if viewMode === "selling-now" && buildingVelocity}
        <div class="mt-3 mb-5 flex items-start gap-2.5 rounded-lg border p-3" style="background: var(--success-bg); border-color: color-mix(in srgb, var(--teal) 18%, transparent);" role="status">
          <TrendingUp size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <p class="text-[0.8125rem] leading-relaxed text-text-secondary">
            Real sales velocity needs <span class="font-semibold">≥2 weekly snapshots</span> — showing estimated ranking meanwhile. Numbers marked <EstimatedBadge label="Est." /> are our estimate; we'll switch to measured sales/week once enough history is collected.
          </p>
        </div>
      {:else}
        <p class="lead text-sm mb-5">
          {#if viewMode === "selling-now"}
            Ranked by <span class="text-success font-semibold">real measured sales per week</span> — the change in Etsy's public lifetime sales count between weekly snapshots.
          {:else}
            Ranked by estimated sales (review velocity).
          {/if}
          Columns marked <span class="text-success font-semibold">Live</span>/<span class="text-success font-semibold">Real</span> are measured — not estimates. Tap a column to re-sort.
        </p>
      {/if}
      <hr class="rule mb-1" />

      {#if shops.length === 0}
        <div class="resting"><p class="text-sm text-text-secondary">Nothing indexed for this category yet.</p><p class="text-[0.8125rem]">It's queued for the next data refresh — check back soon.</p></div>
      {:else}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                {#each visibleColumns as col (col.key)}
                  <th class={col.align === "right" ? "!text-right" : ""}>
                    <button
                      type="button"
                      onclick={() => sortBy(col.key, col.numeric)}
                      aria-label="Sort by {col.label}"
                      class="inline-flex items-center gap-1 hover:text-text-primary transition-colors {col.align === 'right' ? 'justify-end' : ''} {sortKey === col.key ? 'text-text-primary' : ''}"
                    >
                      {col.label}
                      {#if col.est}<EstimatedBadge label="Est." />{/if}
                      {#if col.real && col.key === "soldPerWeek"}<RealDataBadge label="Live" tooltip="Real sales per week — measured from weekly snapshots of Etsy's public lifetime sales count. Not an estimate." />{:else if col.real}<RealDataBadge label="Real" tooltip="Real lifetime sales — Etsy's public transaction_sold_count. Not an estimate." />{/if}
                      {#if sortKey === col.key}{#if sortDir === "asc"}<ArrowUp size={11} />{:else}<ArrowDown size={11} />{/if}{/if}
                    </button>
                  </th>
                {/each}
                <th class="!text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedShops as shop, i (shop.name + "-" + i)}
                <tr>
                  <td class="font-semibold text-text-muted tabular-nums">{shop.rank}</td>
                  <td>
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-xs font-bold text-teal flex-shrink-0">
                        {shop.name.substring(0, 2)}
                      </div>
                      <div>
                        <span class="text-sm font-semibold text-text-primary">{shop.name}</span>
                        <div class="text-[10px] text-text-muted">
                          {shop.country}{#if shop.countryCode} <span class="uppercase">{shop.countryCode}</span>{/if}
                        </div>
                      </div>
                    </div>
                  </td>
                  {#if showSoldPerWeek}
                    <td class="text-right tabular-nums">
                      {#if hasRealVelocity(shop)}
                        <span class="inline-flex items-center gap-1.5 justify-end font-semibold text-success" title="Real measured sales velocity ({shop.soldVelocityConfidence} confidence).">
                          +{Math.round(shop.soldPerWeek ?? 0).toLocaleString()}/wk
                        </span>
                        {#if viewMode === "selling-now" && shop.soldVelocityConfidence && confLabel[shop.soldVelocityConfidence]}
                          <span class="ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold align-middle" style="background: var(--success-bg); color: var(--success);">{confLabel[shop.soldVelocityConfidence]}</span>
                        {/if}
                      {:else}
                        <span class="text-text-muted" title="No measured velocity yet — still building snapshot history.">—</span>
                      {/if}
                    </td>
                  {/if}
                  {#if showSoldCount}
                    <td class="text-right font-medium tabular-nums {shop.soldCount != null ? 'text-success' : 'text-text-muted'}">
                      {shop.soldCount != null ? shop.soldCount.toLocaleString() : "—"}
                    </td>
                  {/if}
                  <td class="text-right font-medium tabular-nums">{shop.sales.toLocaleString()}</td>
                  <td class="text-right tabular-nums">{shop.listings.toLocaleString()}</td>
                  <td class="text-right tabular-nums">{shop.faves.toLocaleString()}</td>
                  <td class="text-right tabular-nums">{shop.rating}</td>
                  <td class="text-right text-text-muted">{shop.opened}</td>
                  <td class="text-right">
                    <div class="inline-flex items-center gap-2">
                      <a href="https://www.etsy.com/shop/{shop.name}" target="_blank" rel="noopener noreferrer" title="Open {shop.name} on Etsy" class="text-text-muted hover:text-teal transition-colors"><ExternalLink size={13} /></a>
                      <a href="/tools/shop-analyzer?shop={encodeURIComponent(shop.name)}" title="Analyze {shop.name}" class="text-text-muted hover:text-teal transition-colors"><BarChart2 size={13} /></a>
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

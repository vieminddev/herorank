<script lang="ts">
  import {
    Plug, ArrowRight, Store, Search as SearchIcon, History,
    Clock, ArrowUpRight, CheckCircle2, AlertCircle
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import { NAV, type NavIcon } from "$lib/config/nav";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import CountUp from "$lib/components/ui/CountUp.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";

  let { data }: {
    data: {
      user?: { name?: string };
      credits?: { balance?: number };
      subscription?: { plan?: string; status?: string };
      shopConnected?: boolean;
    };
  } = $props();

  const greeting = $derived(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  // Single source of truth — the tool grid renders the shared NAV (config/nav.ts).
  const GROUPS = NAV;

  let searchQuery = $state("");
  let activeFilter = $state("All");

  const filteredGroups = $derived(() => {
    const query = searchQuery.trim().toLowerCase();
    
    // First, filter by category chip
    let groups = GROUPS;
    if (activeFilter !== "All") {
      groups = GROUPS.filter(g => g.heading.toLowerCase() === activeFilter.toLowerCase());
    }

    if (!query) return groups;

    return groups.map(g => ({
      heading: g.heading,
      items: g.items.filter(item =>
        item.label.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query)
      )
    })).filter(g => g.items.length > 0);
  });

  const isFree = $derived(data.subscription?.plan === "free" || !data.subscription);

  // --- Real shop-health summary (from the audit endpoint) + recent activity (from history) ---
  type Health = { score: number; count: number; needsWork: number; estimated: boolean; cached?: boolean };
  let health = $state<Health | null>(null);
  let healthLoading = $state(false);
  let healthError = $state(false);

  type RecentItem = { id: number; label: string; type: string; href: string; icon: NavIcon; time: string };
  let activities = $state<RecentItem[]>([]);
  let activityLoading = $state(true);

  const gradeFor = (s: number) =>
    s >= 90 ? "A" : s >= 80 ? "B+" : s >= 70 ? "B" : s >= 60 ? "C" : s >= 45 ? "D" : "F";

  // Map a history `tool` slug to its nav item (label/href/icon) by matching the href tail.
  const allItems = GROUPS.flatMap((g) => g.items);
  function toolMeta(tool: string): { label: string; href: string; icon: NavIcon } {
    const it = allItems.find((i) => i.href.endsWith("/" + tool)) ?? allItems.find((i) => i.href.includes(tool));
    return it ? { label: it.label, href: it.href, icon: it.icon } : { label: tool, href: "/dashboard", icon: History };
  }
  function timeAgo(epochSec: number): string {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - epochSec));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
    return `${Math.floor(d / 7)}w ago`;
  }

  onMount(async () => {
    // Recent activity — real history feed.
    try {
      const res = await fetch("/api/me/history");
      if (res.ok) {
        const { items } = (await res.json()) as { items: Array<{ id: number; tool: string; subject: string; createdAt: number }> };
        activities = (items ?? []).slice(0, 3).map((r) => {
          const m = toolMeta(r.tool);
          return { id: r.id, label: r.subject ? `${m.label}: ${r.subject}` : m.label, type: m.label, href: m.href, icon: m.icon, time: timeAgo(r.createdAt) };
        });
      }
    } catch { /* leave empty */ }
    activityLoading = false;

    // Shop-health summary — only meaningful when a shop is connected.
    if (data.shopConnected) {
      healthLoading = true;
      try {
        const res = await fetch("/api/my-shop/audit");
        if (res.ok) {
          const a = (await res.json()) as { count: number; listings: Array<{ score: number }>; cached?: boolean };
          const scores = (a.listings ?? []).map((l) => l.score);
          const avg = scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : 0;
          health = { score: avg, count: a.count ?? scores.length, needsWork: scores.filter((s) => s < 60).length, estimated: true, cached: a.cached };
        } else { healthError = true; }
      } catch { healthError = true; }
      healthLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Workspace — VieRank</title>
  <meta name="description" content="Your VieRank dashboard — access Etsy SEO tools, keywords, and analytics." />
</svelte:head>

<div class="max-w-5xl mx-auto workspace-hub space-y-8">
  <!-- Header greeting -->
  <header>
    <p class="section-kicker mb-1">My workspace</p>
    <h1 class="text-3xl font-bold tracking-tight text-text-primary">
      {greeting()}, {data.user?.name ?? "there"}
    </h1>
    <p class="lead mt-2 max-w-xl">Welcome to your SEO bench. Find a tool below or search to get started.</p>
  </header>

  <!-- Interactive Search / Command Bar -->
  <div class="hub-search-wrapper !mb-4">
    <SearchIcon size={18} class="hub-search-icon" />
    <input
      type="text"
      placeholder="Search for tools (e.g. Title Generator, Shop Audit...)"
      bind:value={searchQuery}
      class="hub-search-input"
    />
  </div>

  <!-- Quick Filter Chips -->
  <div class="flex flex-wrap gap-2 mb-6">
    {#each ["All", "My Shop", "Research", "Keywords", "Create", "Optimize & Track", "Calculators"] as filter}
      <button
        type="button"
        class="hub-filter-chip {activeFilter === filter ? 'active' : ''}"
        onclick={() => activeFilter = filter}
      >
        {filter}
      </button>
    {/each}
  </div>

  {#if !searchQuery}
    <!-- Block 1: Shop Health Card — real data (or honest connect CTA) -->
    <section class="health-card">
      <div class="health-grid">
        <div class="space-y-3 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
              <Store size={16} />
            </span>
            <h2 class="text-lg font-bold text-text-primary">Etsy Shop SEO Health</h2>
            {#if health}<EstimatedBadge tooltip="Overall score is the average of your listings' estimated SEO scores." />{/if}
          </div>

          {#if !data.shopConnected}
            <p class="text-sm text-text-secondary max-w-md">Connect your Etsy shop to see a real SEO health score across your live listings — no fabricated numbers.</p>
          {:else if healthLoading}
            <div class="space-y-2 max-w-md"><Skeleton height="0.5rem" /><Skeleton lines={1} width="60%" /></div>
          {:else if healthError}
            <p class="text-sm text-text-secondary">Couldn't load your shop health right now. <a href="/tools/shop-audit" class="copy-link !text-teal">Open Shop Audit →</a></p>
          {:else if health}
            <div class="space-y-1 max-w-md">
              <div class="flex justify-between text-xs font-semibold text-text-secondary">
                <span>Overall Score</span>
                <span class="text-teal"><CountUp value={health.score} suffix="%" /> (Grade {gradeFor(health.score)})</span>
              </div>
              <ScoreBar score={health.score} />
            </div>
            <div class="health-metrics-strip text-xs text-text-muted">
              <div class="health-metric-item"><span class="font-bold text-text-primary"><CountUp value={health.count} /></span><span>Active Listings</span></div>
              <div class="health-metric-item"><span class="font-bold text-text-primary"><CountUp value={health.needsWork} /></span><span>Need Work (&lt;60)</span></div>
            </div>
          {/if}
        </div>

        <div class="flex flex-col gap-2 shrink-0 sm:w-56">
          {#if data.shopConnected}
            <div class="p-3.5 bg-bg-page border border-border rounded-xl flex items-center gap-3">
              <CheckCircle2 size={16} class="text-success shrink-0" />
              <div class="min-w-0">
                <p class="text-xs font-bold text-text-primary">Etsy API Linked</p>
                <p class="text-[10px] text-text-secondary truncate">Connected to your shop</p>
              </div>
            </div>
            <a href="/settings/connections" class="btn btn-secondary !py-2.5 !px-4 text-xs font-bold w-full justify-center">Manage Connection</a>
          {:else}
            <div class="p-3.5 bg-bg-page border border-border rounded-xl flex items-center gap-3">
              <AlertCircle size={16} class="text-warning shrink-0" />
              <div class="min-w-0">
                <p class="text-xs font-bold text-text-primary">Not connected</p>
                <p class="text-[10px] text-text-secondary truncate">Link your shop for real data</p>
              </div>
            </div>
            <a href="/settings/connections" class="btn btn-primary !py-2.5 !px-4 text-xs font-bold w-full justify-center"><Plug size={13} /> Connect Etsy shop</a>
          {/if}
        </div>
      </div>
    </section>

    <!-- Block 2: Recent Activity — real history feed -->
    {#if activityLoading || activities.length}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <Clock size={15} class="text-text-muted" />
          <h3 class="text-xs font-bold text-text-muted uppercase tracking-wider">Recent Activity</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {#if activityLoading}
            {#each Array(3) as _, i (i)}
              <div class="recent-activity-item"><Skeleton height="2rem" width="2rem" rounded="lg" /><div class="flex-1"><Skeleton lines={2} /></div></div>
            {/each}
          {:else}
            {#each activities as act (act.id)}
              {@const Icon = act.icon}
              <a href={act.href} class="recent-activity-item group hover-lift">
                <span class="w-8 h-8 rounded-lg bg-bg-page text-text-secondary group-hover:text-teal group-hover:bg-teal/5 flex items-center justify-center shrink-0 transition-colors">
                  <Icon size={15} />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-bold text-text-primary group-hover:text-teal transition-colors truncate">{act.label}</p>
                  <p class="text-[10px] text-text-secondary mt-0.5">{act.time} · {act.type}</p>
                </div>
                <ArrowUpRight size={13} class="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </a>
            {/each}
          {/if}
        </div>
      </section>
    {/if}
  {/if}

  <!-- Tool Grid Categories -->
  <main class="space-y-8 !mt-10">
    {#each filteredGroups() as group}
      <div>
        <h2 class="hub-category-title">{group.heading}</h2>
        <div class="hub-grid">
          {#each group.items as item}
            {@const Icon = item.icon}
            <a href={item.href} class="hub-card group">
              <span class="hub-card-icon">
                <Icon size={20} />
              </span>
              <div>
                <h3 class="hub-card-title group-hover:text-teal transition-colors font-semibold">
                  {item.label}
                </h3>
                <p class="hub-card-desc">
                  {item.desc}
                </p>
              </div>
            </a>
          {/each}
        </div>
      </div>
    {:else}
      <div class="text-center py-12 text-text-secondary border border-dashed border-border rounded-2xl">
        <AlertCircle size={28} class="mx-auto text-text-muted mb-2" />
        <p class="font-medium text-sm">No tools found matching "{searchQuery}"</p>
        <button
          type="button"
          onclick={() => searchQuery = ""}
          class="text-teal font-bold hover:underline mt-2 text-xs"
        >
          Clear search query
        </button>
      </div>
    {/each}
  </main>

  <!-- Plan Standings / Ledger Summary (Only if search is empty) -->
  {#if !searchQuery}
    <section class="pt-4">
      <hr class="rule" />
      <dl class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div class="py-6 sm:pr-8">
          <dt class="section-kicker">Credits left</dt>
          <dd class="mt-1 text-2xl font-bold tracking-tight text-text-primary tabular-nums">{data.credits?.balance ?? 0}</dd>
          <p class="field-hint">Spent a few credits each time an analysis runs.</p>
        </div>
        <div class="py-6 sm:pl-8">
          <dt class="section-kicker">Your plan</dt>
          <dd class="mt-1 text-2xl font-bold tracking-tight text-text-primary capitalize">{data.subscription?.plan ?? "free"}</dd>
          <p class="field-hint capitalize">Status: {data.subscription?.status ?? "active"}</p>
        </div>
      </dl>
      <hr class="rule" />
    </section>

    <!-- Pricing Upgrade Nudge -->
    {#if isFree}
      <section class="rounded-2xl px-8 py-7 text-white mt-8" style="background: var(--teal-dark)">
        <h2 class="text-lg font-bold">Room to do more</h2>
        <p class="text-white/80 mt-2 text-sm max-w-lg leading-relaxed">
          Your research &amp; SEO tools are unlimited on free. A paid plan adds more AI media credits ({data.credits?.balance ?? 0} left), daily rank tracking, and more linked shops — when you're ready.
        </p>
        <a href="/pricing" class="copy-link mt-4 !text-white/90 hover:!text-white font-bold inline-flex items-center gap-1">
          See the plans <ArrowRight size={14} />
        </a>
      </section>
    {/if}
  {/if}
</div>

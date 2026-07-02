<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import { CalendarDays, Clock, ArrowUpRight, Copy, Check, Download } from "lucide-svelte";

  type Market = "ALL" | "US" | "CA" | "UK" | "AU" | "EU";
  type ThemeFn = string | ((y: number) => string);
  type SeasonalEvent = {
    month: number;
    name: string;
    leadWeeks: number;
    themes: ThemeFn[];
    markets: Market[];
    marketNote?: string;
  };

  const SEASONAL_EVENTS: SeasonalEvent[] = [
    // January
    { month: 1, name: "New Year & Resolutions", leadWeeks: 3, markets: ["ALL"],
      themes: [(y) => `${y} planner`, "new year gift", "motivational wall art", "fitness journal"] },
    { month: 1, name: "Australia Day", leadWeeks: 3, markets: ["AU"],
      themes: ["australia day gift", "aussie pride shirt", "australia flag art", "down under decor"],
      marketNote: "AU — 26 January" },
    // February
    { month: 2, name: "Valentine's Day", leadWeeks: 5, markets: ["ALL"],
      themes: ["valentines gift for him", "personalized couple gift", "anniversary keepsake", "love card"] },
    // March
    { month: 3, name: "International Women's Day", leadWeeks: 3, markets: ["ALL"],
      themes: ["womens day gift", "feminist art print", "girl boss mug", "women empowerment gift"],
      marketNote: "8 March" },
    { month: 3, name: "Mothering Sunday", leadWeeks: 5, markets: ["UK"],
      themes: ["mothers day uk", "personalised mum gift", "mothering sunday card", "gift for mum"],
      marketNote: "UK — 4th Sunday of Lent (mid-late March)" },
    { month: 3, name: "St. Patrick's Day & Spring", leadWeeks: 4, markets: ["US", "CA", "UK", "AU"],
      themes: ["st patricks day shirt", "spring decor", "easter basket name tag", "lucky charm"] },
    // April
    { month: 4, name: "Easter", leadWeeks: 5, markets: ["ALL"],
      themes: ["easter gift", "personalised easter egg", "easter basket", "spring wreath"] },
    { month: 4, name: "ANZAC Day", leadWeeks: 3, markets: ["AU"],
      themes: ["anzac day poppy", "military memorial gift", "lest we forget", "anzac tribute"],
      marketNote: "AU & NZ — 25 April" },
    // May
    { month: 5, name: "Mother's Day", leadWeeks: 6, markets: ["US", "CA", "AU"],
      themes: ["mothers day gift", "gift for grandma", "graduation gift", (y) => `class of ${y}`],
      marketNote: "US, CA, AU — 2nd Sunday of May" },
    // June
    { month: 6, name: "Father's Day, Weddings & Pride", leadWeeks: 5, markets: ["US", "CA", "UK", "EU"],
      themes: ["fathers day gift", "personalized wedding gift", "bridesmaid proposal", "pride flag"] },
    // July
    { month: 7, name: "4th of July / Independence Day", leadWeeks: 4, markets: ["US"],
      themes: ["4th of july decor", "american flag shirt", "patriotic gift", "independence day"],
      marketNote: "US — 4 July" },
    { month: 7, name: "Canada Day", leadWeeks: 3, markets: ["CA"],
      themes: ["canada day gift", "maple leaf decor", "canada pride shirt", "canadian gift"],
      marketNote: "CA — 1 July" },
    { month: 7, name: "Summer & Back-to-School prep", leadWeeks: 6, markets: ["ALL"],
      themes: ["summer wedding favors", "teacher appreciation gift", "personalized backpack tag", "beach decor"] },
    // August
    { month: 8, name: "Back to School & Fall preview", leadWeeks: 4, markets: ["ALL"],
      themes: ["teacher gift", "first day of school sign", "fall home decor", "dorm decor"] },
    { month: 8, name: "Oktoberfest prep", leadWeeks: 6, markets: ["EU"],
      themes: ["oktoberfest gift", "german beer mug", "bavarian decor", "dirndl accessory", "lederhosen gift"],
      marketNote: "EU — Oktoberfest runs late Sept to early Oct" },
    // September
    { month: 9, name: "Father's Day", leadWeeks: 4, markets: ["AU"],
      themes: ["fathers day gift", "personalised dad gift", "gift for dad", "dad mug"],
      marketNote: "AU — 1st Sunday of September" },
    { month: 9, name: "Halloween prep & Fall", leadWeeks: 7, markets: ["US", "CA", "UK", "AU"],
      themes: ["halloween decor", "personalized halloween bag", "fall wreath", "thanksgiving sign"] },
    // October
    { month: 10, name: "Halloween & Holiday lead-in", leadWeeks: 4, markets: ["US", "CA", "UK", "AU"],
      themes: ["halloween costume", "christmas ornament", "personalized stocking", "advent calendar"] },
    { month: 10, name: "Canadian Thanksgiving", leadWeeks: 3, markets: ["CA"],
      themes: ["canadian thanksgiving decor", "harvest table decor", "thankful sign", "pumpkin centerpiece"],
      marketNote: "CA — 2nd Monday of October" },
    // November
    { month: 11, name: "Black Friday, Cyber Monday & Christmas", leadWeeks: 8, markets: ["ALL"],
      themes: ["christmas gift", "personalized christmas ornament", "secret santa gift", "stocking stuffer", "family christmas pajamas"],
      marketNote: "All markets — peak season" },
    { month: 11, name: "Bonfire Night / Guy Fawkes", leadWeeks: 3, markets: ["UK"],
      themes: ["bonfire night gift", "fireworks print", "guy fawkes decor", "november 5th"],
      marketNote: "UK — 5 November" },
    // December
    { month: 12, name: "Christmas, Hanukkah & Year-end", leadWeeks: 3, markets: ["ALL"],
      themes: ["last minute christmas gift", "personalized gift digital download", "new year decoration", "hanukkah gift"] },
    { month: 12, name: "Sinterklaas", leadWeeks: 5, markets: ["EU"],
      themes: ["sinterklaas gift", "saint nicholas gift", "dutch christmas gift", "pepernoot"],
      marketNote: "NL/BE — 5 December" },
  ];

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  function monthName(month: number): string {
    return MONTH_NAMES[(month - 1 + 12) % 12];
  }

  type Row = Omit<SeasonalEvent, "themes"> & {
    themes: string[];
    weeksUntil: number;
    status: "now" | "soon" | "later";
  };

  const nowDate = new Date();
  const curMonth = nowDate.getMonth() + 1;
  const curYear = nowDate.getFullYear();
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

  const rows: Row[] = SEASONAL_EVENTS.map((e) => {
    let year = curYear;
    if (e.month < curMonth) year += 1;
    const target = new Date(year, e.month - 1, 15);
    const weeksUntil = Math.max(0, Math.round((target.getTime() - nowDate.getTime()) / MS_WEEK));
    let status: Row["status"];
    if (weeksUntil <= e.leadWeeks) status = "now";
    else if (weeksUntil <= e.leadWeeks + 6) status = "soon";
    else status = "later";
    const themes = e.themes.map((t) => (typeof t === "function" ? t(year) : t));
    return { ...e, themes, weeksUntil, status };
  }).sort((a, b) => a.weeksUntil - b.weeksUntil);

  // Market filter
  type MarketFilter = "ALL" | "US" | "UK" | "AU" | "EU";
  let marketFilter = $state<MarketFilter>("ALL");

  const MARKET_FILTERS: { key: MarketFilter; label: string }[] = [
    { key: "ALL", label: "All Markets" },
    { key: "US", label: "US & Canada" },
    { key: "UK", label: "United Kingdom" },
    { key: "AU", label: "Australia & NZ" },
    { key: "EU", label: "Europe" },
  ];

  function marketMatch(eventMarkets: Market[], filter: MarketFilter): boolean {
    if (filter === "ALL") return true;
    if (eventMarkets.includes("ALL")) return true;
    if (filter === "US") return eventMarkets.includes("US") || eventMarkets.includes("CA");
    return eventMarkets.includes(filter);
  }

  // Status filter
  type StatusFilter = "all" | "now" | "soon" | "later";
  let statusFilter = $state<StatusFilter>("all");

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "now", label: "List Now" },
    { key: "soon", label: "Prep Soon" },
    { key: "later", label: "Plan Ahead" },
  ];

  const filtered = $derived(
    rows.filter((r) =>
      marketMatch(r.markets, marketFilter) &&
      (statusFilter === "all" || r.status === statusFilter)
    )
  );

  const actNow = $derived(
    rows.filter((r) => r.status === "now" && marketMatch(r.markets, marketFilter))
  );

  const statusLabel = (r: Row) =>
    r.status === "now" ? "List now" : r.status === "soon" ? "Prep soon" : "Plan ahead";
  const statusColor = (r: Row) =>
    r.status === "now" ? "var(--danger)" : r.status === "soon" ? "var(--warning)" : "var(--text-muted)";

  // Copy theme
  let copiedTheme = $state<string | null>(null);
  const copyTheme = async (theme: string) => {
    await navigator.clipboard.writeText(theme);
    copiedTheme = theme;
    setTimeout(() => { copiedTheme = null; }, 1500);
  };

  // CSV export
  const exportCsv = () => {
    const headers = ["Month", "Event", "Markets", "Status", "Weeks Until", "Lead Weeks", "Note", "Themes"];
    const csvRows = filtered.map((r) => [
      monthName(r.month),
      r.name,
      r.markets.join("/"),
      statusLabel(r),
      r.weeksUntil,
      r.leadWeeks,
      r.marketNote ?? "",
      r.themes.join("; "),
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seasonal-calendar.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
</script>

<ToolPageLayout
  title="Seasonal Calendar"
  description="Buyers shop ahead — sometimes months ahead. This shows what's coming, how early people start searching, and the themes to optimize for now so your listings are ranked before the rush."
  icon={CalendarDays}
>
  {#snippet controls()}
    <p class="section-kicker mb-3">Right now ({monthName(curMonth)})</p>
    {#if actNow.length}
      <p class="lead text-sm mb-4">These events are inside their search window — listings should be live and optimized today.</p>
      <div class="space-y-2">
        {#each actNow as r}
          <div class="p-3 rounded-lg border border-border">
            <p class="text-sm font-medium text-text-primary">{r.name}</p>
            <p class="text-[0.8125rem] mt-0.5" style="color: {statusColor(r)}">≈ {r.weeksUntil} weeks out · list now</p>
          </div>
        {/each}
      </div>
    {:else}
      <p class="lead text-sm">Nothing urgent this week — a good time to plan ahead for the events below.</p>
    {/if}

    <hr class="rule mt-5 mb-4" />

    <p class="section-kicker mb-2">Your market</p>
    <div class="grid grid-cols-2 gap-1.5">
      {#each MARKET_FILTERS as m}
        <button
          onclick={() => { marketFilter = m.key; }}
          class="col-span-{m.key === 'ALL' ? 2 : 1} px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors text-left {marketFilter === m.key ? 'bg-teal text-white border-teal' : 'bg-white text-text-secondary border-border hover:border-teal/40 hover:text-teal'}"
        >{m.label}</button>
      {/each}
    </div>
    <p class="field-hint mt-2">Filter events by the market you sell to.</p>

    <hr class="rule mt-5 mb-4" />

    <div class="flex items-center gap-2">
      <EstimatedBadge
        label="Editorial"
        tooltip="Lead times and themes are editorial guidance based on common Etsy seasonality — not live trend data. Use them as a starting point, then validate with the Keyword Generator."
      />
      <span class="text-[0.75rem] text-text-muted">Guidance, not live trends</span>
    </div>
  {/snippet}

  <div class="animate-fade-in">
    <!-- Controls row -->
    <div class="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <div class="flex rounded-lg border border-border-light overflow-hidden">
        {#each STATUS_FILTERS as f}
          <button
            onclick={() => { statusFilter = f.key; }}
            class="px-3 py-1.5 text-xs font-medium transition-colors border-r border-border-light last:border-r-0 {statusFilter === f.key ? 'bg-teal text-white' : 'bg-white text-text-secondary hover:bg-surface-2'}"
          >{f.label}</button>
        {/each}
      </div>
      <button onclick={exportCsv} class="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-teal transition-colors">
        <Download size={13} /> Export CSV
      </button>
    </div>

    <p class="section-kicker mb-1">The year ahead</p>
    <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">Sorted by what's closest</h2>

    {#if filtered.length === 0}
      <p class="text-sm text-text-muted">No events match the current filters.</p>
    {:else}
      <div class="space-y-3 stagger-children">
        {#each filtered as r (r.name)}
          <div class={`hover-lift p-4 rounded-xl border shadow-sm ${r.status === "now" ? "card-accent border-teal/40 bg-teal/[0.03]" : "bg-white border-border"}`}>
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[0.6875rem] uppercase tracking-wide font-semibold text-text-muted">{monthName(r.month)}</span>
                  <span
                    class="inline-flex items-center gap-1 text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded"
                    style="color: {statusColor(r)}; background: color-mix(in srgb, {statusColor(r)} 10%, transparent)"
                  >
                    <Clock size={10} />
                    {statusLabel(r)}
                  </span>
                </div>
                <p class="text-[0.9375rem] font-medium text-text-primary mt-1">{r.name}</p>
                {#if r.marketNote}
                  <p class="text-[0.8125rem] text-text-muted mt-0.5">{r.marketNote}</p>
                {/if}
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-semibold tabular-nums text-text-primary">≈ {r.weeksUntil}w</p>
                <p class="text-[0.6875rem] text-text-muted">lead {r.leadWeeks}w</p>
              </div>
            </div>

            <!-- Theme chips: click = copy, ↗ = Keyword Generator -->
            <div class="flex flex-wrap gap-2 mt-3">
              {#each r.themes as theme}
                <div class="group/chip inline-flex items-center rounded-full bg-surface-2 hover:bg-teal/8 transition-colors overflow-hidden">
                  <button
                    type="button"
                    onclick={() => copyTheme(theme)}
                    title="Copy theme keyword"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.8125rem] text-text-secondary group-hover/chip:text-teal transition-colors"
                  >
                    {#if copiedTheme === theme}
                      <Check size={10} class="text-success shrink-0" />
                    {:else}
                      <Copy size={10} class="opacity-0 group-hover/chip:opacity-100 shrink-0 transition-opacity" />
                    {/if}
                    {theme}
                  </button>
                  <a
                    href={`/tools/keyword-generator?seed=${encodeURIComponent(theme)}`}
                    title="Open in Keyword Generator"
                    class="pr-2 text-text-muted hover:text-teal transition-colors"
                  >
                    <ArrowUpRight size={11} />
                  </a>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</ToolPageLayout>

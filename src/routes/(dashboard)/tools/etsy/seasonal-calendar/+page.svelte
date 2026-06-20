<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { CalendarDays, Clock, ArrowRight } from "lucide-svelte";

  type SeasonalEvent = {
    month: number;
    name: string;
    leadWeeks: number;
    themes: string[];
    markets?: string;
  };

  const SEASONAL_EVENTS: SeasonalEvent[] = [
    { month: 1, name: "New Year & Resolutions", leadWeeks: 3, themes: ["2025 planner", "new year gift", "motivational wall art", "fitness journal"] },
    { month: 2, name: "Valentine's Day", leadWeeks: 5, themes: ["valentines gift for him", "personalized couple gift", "anniversary keepsake", "love card"], markets: "US, UK, EU" },
    { month: 3, name: "St. Patrick's Day & Spring", leadWeeks: 4, themes: ["st patricks day shirt", "spring decor", "easter basket name tag", "lucky charm"] },
    { month: 4, name: "Easter & Mother's Day prep (UK)", leadWeeks: 5, themes: ["easter gift", "mothers day uk", "personalized garden sign", "spring wreath"], markets: "UK Mother's Day (late March)" },
    { month: 5, name: "Mother's Day (US) & Graduation", leadWeeks: 6, themes: ["mothers day gift", "gift for grandma", "graduation gift 2025", "class of 2025"], markets: "US, CA, AU" },
    { month: 6, name: "Father's Day, Weddings & Pride", leadWeeks: 5, themes: ["fathers day gift", "personalized wedding gift", "bridesmaid proposal", "pride flag"] },
    { month: 7, name: "Summer & Back-to-School prep", leadWeeks: 6, themes: ["summer wedding favors", "teacher appreciation gift", "personalized backpack tag", "beach decor"] },
    { month: 8, name: "Back to School & Fall preview", leadWeeks: 4, themes: ["teacher gift", "first day of school sign", "fall home decor", "dorm decor"] },
    { month: 9, name: "Halloween prep & Fall", leadWeeks: 7, themes: ["halloween decor", "personalized halloween bag", "fall wreath", "thanksgiving sign"] },
    { month: 10, name: "Halloween & Holiday lead-in", leadWeeks: 4, themes: ["halloween costume", "christmas ornament 2025", "personalized stocking", "advent calendar"] },
    { month: 11, name: "Black Friday, Cyber Monday & Christmas", leadWeeks: 8, themes: ["christmas gift", "personalized christmas ornament", "secret santa gift", "stocking stuffer", "family christmas pajamas"], markets: "All — peak season" },
    { month: 12, name: "Christmas, Hanukkah & Year-end", leadWeeks: 3, themes: ["last minute christmas gift", "personalized gift digital download", "new year decoration", "hanukkah gift"] },
  ];

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function monthName(month: number): string {
    return MONTH_NAMES[(month - 1 + 12) % 12];
  }

  type Row = SeasonalEvent & { weeksUntil: number; status: "now" | "soon" | "later" };

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

  const rows: Row[] = SEASONAL_EVENTS.map((e) => {
    let year = curYear;
    if (e.month < curMonth) year += 1;
    const target = new Date(year, e.month - 1, 15);
    const weeksUntil = Math.max(0, Math.round((target.getTime() - now.getTime()) / MS_WEEK));
    let status: Row["status"];
    if (weeksUntil <= e.leadWeeks) status = "now";
    else if (weeksUntil <= e.leadWeeks + 6) status = "soon";
    else status = "later";
    return { ...e, weeksUntil, status };
  }).sort((a, b) => a.weeksUntil - b.weeksUntil);

  const actNow = $derived(rows.filter((r) => r.status === "now"));

  const statusLabel = (r: Row) =>
    r.status === "now" ? "List now" : r.status === "soon" ? "Prep soon" : "Plan ahead";

  const statusColor = (r: Row) =>
    r.status === "now" ? "var(--danger)" : r.status === "soon" ? "var(--warning)" : "var(--text-muted)";
</script>

<ToolPageLayout
  title="Seasonal Calendar"
  prefix="Etsy"
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
    <p class="field-hint mt-4">Lead time = how early buyers start searching. Have listings ranked before that window opens.</p>
  {/snippet}

  <div class="animate-fade-in">
    <p class="section-kicker mb-1">The year ahead</p>
    <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">Sorted by what's closest</h2>
    <div class="space-y-3">
      {#each rows as r}
        <div class={`p-4 rounded-xl border ${r.status === "now" ? "border-teal/40 bg-teal/[0.03]" : "border-border"}`}>
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
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
              {#if r.markets}
                <p class="text-[0.8125rem] text-text-muted mt-0.5">{r.markets}</p>
              {/if}
            </div>
            <div class="text-right shrink-0">
              <p class="text-sm font-semibold tabular-nums text-text-primary">≈ {r.weeksUntil}w</p>
              <p class="text-[0.6875rem] text-text-muted">lead {r.leadWeeks}w</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 mt-3">
            {#each r.themes as theme}
              <a
                href={`/tools/keyword-generator?seed=${encodeURIComponent(theme)}`}
                class="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 hover:bg-teal/8 text-[0.8125rem] text-text-secondary hover:text-teal transition-colors"
              >
                {theme}
                <ArrowRight size={11} class="opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</ToolPageLayout>

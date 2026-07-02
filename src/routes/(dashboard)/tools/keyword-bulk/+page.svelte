<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import RealDataBadge from "$lib/components/ui/RealDataBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { Layers, Copy, Check, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import SaveToListMenu from "$lib/components/tools/SaveToListMenu.svelte";

  type Level = "low" | "medium" | "high";
  type KeywordRow = {
    keyword: string;
    volume: number;
    competition: Level;
    cpc?: string;
    trend: string;
    longTail?: boolean;
    broad?: boolean;
    real?: boolean;
    realDemand?: number | null;
    realCompetition?: Level | null;
  };
  type SeedGroup = { seed: string; keywords: KeywordRow[] };

  let seedsText = $state("");
  let groups = $state<SeedGroup[]>([]);
  let charged = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let copiedSeed = $state<string | null>(null);
  // Seeds we actually submitted on the last search, to spot any the backend dropped.
  let requestedSeeds = $state<string[]>([]);

  const seedList = $derived(
    seedsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Submitted seeds that came back with no keyword group (case-insensitive match).
  const droppedSeeds = $derived(
    requestedSeeds.filter(
      (s) => !groups.some((g) => g.seed.toLowerCase() === s.toLowerCase()),
    ),
  );

  // Colour a trend string by its sign: rising green, falling red, flat muted.
  const trendColor = (trend: string) => {
    const t = trend.trim();
    if (/^[+]/.test(t) || /^[1-9]/.test(t)) return "var(--teal-dark)";
    if (/^-/.test(t) || /\bdown\b/i.test(t)) return "var(--danger)";
    return "var(--text-muted)";
  };

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!seedList.length || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const submitted = seedList.slice(0, 10);
    requestedSeeds = submitted;

    const res = await callTool<{ results: SeedGroup[]; charged: number }>("bulk-keywords", {
      seeds: submitted,
    });

    if (res.ok) {
      groups = res.data.results ?? [];
      charged = res.data.charged ?? 0;
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };

  const copyGroup = (g: SeedGroup) => {
    navigator.clipboard.writeText(g.keywords.map((k) => k.keyword).join(", "));
    copiedSeed = g.seed;
    setTimeout(() => {
      if (copiedSeed === g.seed) copiedSeed = null;
    }, 2000);
  };
</script>

<ToolPageLayout
  title="Bulk Keywords"
  description="Researching a whole range? Drop in a list of products and get keyword ideas for every one at once — one credit per seed."
  icon={Layers}
  credits={1}
>
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label for="kb-seeds" class="field-label">
        Seed keywords <span class="text-text-muted font-normal">(one per line, up to 10)</span>
      </label>
      <textarea
        id="kb-seeds"
        rows={10}
        bind:value={seedsText}
        placeholder={`personalized necklace\ncustom mug\nwedding sign`}
        class="field resize-none"
      ></textarea>
      <div class="flex justify-between items-center mt-1.5">
        <p class="field-hint !mt-0">
          {seedList.length} seed{seedList.length === 1 ? "" : "s"} ·
          {Math.min(seedList.length, 10)} credit{Math.min(seedList.length, 10) === 1 ? "" : "s"}
        </p>
      </div>
      <button
        type="submit"
        disabled={loading || !seedList.length}
        class="btn btn-primary w-full justify-center mt-3"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Researching…{:else}Research all{/if}
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

  {#if loading}
    <div class="animate-fade-in space-y-8">
      <Skeleton width="35%" height="1rem" />
      {#each Array(2) as _, s (s)}
        <section>
          <Skeleton width="25%" height="0.875rem" />
          <div class="mt-3 overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr><th>Keyword</th><th class="text-right">Volume</th><th>Competition</th><th class="text-right">CPC</th><th class="text-right">Trend</th></tr>
              </thead>
              <tbody>
                {#each Array(4) as _, i (i)}
                  <tr>
                    <td><Skeleton width="70%" /></td>
                    <td><Skeleton width="60%" /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width="50%" /></td>
                    <td><Skeleton width="50%" /></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/each}
    </div>
  {:else if groups.length}
    <div class="animate-fade-in space-y-8">
      <div>
        <p class="text-sm text-text-muted">
          Researched {groups.length} seed{groups.length === 1 ? "" : "s"} · {charged} credit{charged === 1 ? "" : "s"} used.
        </p>
        <p class="text-[0.8125rem] text-text-secondary mt-2 inline-flex items-center gap-2 flex-wrap">
          Volume, CPC and trend are <EstimatedBadge label="Estimated" tooltip="Volume, CPC and trend are AI estimates, not official Etsy data." />
          · measured rows show <RealDataBadge label="demand" tooltip="Real 0-100 demand measured by VieRank's Etsy index — not an estimate." />
          · tagged <span class="text-success font-medium">long-tail</span>/<span class="text-warning font-medium">broad</span> per <a href="https://www.etsy.com/seller-handbook/article/22794885498" target="_blank" rel="noopener" class="copy-link !text-text-muted hover:!text-teal">Etsy guidance ↗</a>
        </p>
        {#if droppedSeeds.length}
          <div class="mt-3 flex items-start gap-2 text-[0.8125rem] text-text-secondary panel-tint p-3">
            <CircleAlert size={15} class="text-warning flex-shrink-0 mt-0.5" />
            <p>No keywords came back for {droppedSeeds.length} seed{droppedSeeds.length === 1 ? "" : "s"}: <span class="font-medium text-text-primary">{droppedSeeds.join(", ")}</span>. Try rewording or a broader term.</p>
          </div>
        {/if}
      </div>
      {#each groups as g (g.seed)}
        <section>
          <div class="flex items-center justify-between mb-3">
            <p class="section-kicker !mb-0">{g.seed}</p>
            <div class="flex items-center gap-4">
              <button type="button" class="copy-link" onclick={() => copyGroup(g)}>
                {#if copiedSeed === g.seed}
                  <Check size={13} class="text-success" /> Copied
                {:else}
                  <Copy size={13} /> Copy
                {/if}
              </button>
              <SaveToListMenu
                items={g.keywords.map((k) => ({ keyword: k.keyword, volume: k.volume, competition: k.competition }))}
                label="Save"
                disabled={!g.keywords.length}
              />
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th class="text-right">Volume</th>
                  <th>Competition</th>
                  <th class="text-right">CPC</th>
                  <th class="text-right">Trend</th>
                </tr>
              </thead>
              <tbody>
                {#each g.keywords as kw, i (kw.keyword + "-" + i)}
                  <tr>
                    <td class="text-[0.9375rem] text-text-primary">
                      <span class="inline-flex items-center gap-2 flex-wrap">
                        {kw.keyword}
                        {#if kw.broad}
                          <span class="rounded text-[0.6875rem] font-medium text-warning bg-warning/10 px-1.5 py-0.5">broad</span>
                        {:else if kw.longTail}
                          <span class="rounded text-[0.6875rem] font-medium text-success bg-success/10 px-1.5 py-0.5">long-tail</span>
                        {/if}
                        {#if kw.real}
                          <RealDataBadge label={`demand ${kw.realDemand}`} tooltip="Real 0-100 demand measured by VieRank's Etsy index — not an estimate." />
                        {/if}
                      </span>
                    </td>
                    <td class="text-right text-text-primary tabular-nums">{kw.volume.toLocaleString()}</td>
                    <td><Badge level={kw.real && kw.realCompetition ? kw.realCompetition : kw.competition} /></td>
                    <td class="text-right text-text-secondary tabular-nums">{kw.cpc ?? "—"}</td>
                    <td class="text-right font-medium tabular-nums" style="color: {trendColor(kw.trend)}">{kw.trend}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/each}
    </div>
  {:else if !error}
    <ToolEmpty
      icon={Layers}
      title="Bulk results will appear here"
      hint="List your products on the left — one per line — and we'll research keywords for each in a single pass."
    >
      {#snippet preview()}
        <p class="section-kicker !mb-2">personalized necklace</p>
        <table class="w-full">
          <tbody>
            {#each [{ k: "personalized name necklace", v: 40500, c: "high" }, { k: "custom necklace gold", v: 18100, c: "medium" }, { k: "dainty initial necklace", v: 8100, c: "low" }] as r (r.k)}
              <tr class="border-b border-border-light">
                <td class="py-2 text-[0.9375rem] text-text-primary">{r.k}</td>
                <td class="py-2 text-sm text-right text-text-primary tabular-nums pr-4">{r.v.toLocaleString()}</td>
                <td class="py-2"><Badge level={r.c as "low" | "medium" | "high"} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import RealDataBadge from "$lib/components/ui/RealDataBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { Search, Copy, Check, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import SaveToListMenu from "$lib/components/tools/SaveToListMenu.svelte";

  type Level = "high" | "medium" | "low";
  type KeywordRow = {
    keyword: string;
    volume: number;
    competition: Level;
    cpc: string;
    trend: string;
    // Signals added by the backend (Etsy long-tail quality + real-data overlay).
    longTail?: boolean;
    broad?: boolean;
    real?: boolean;
    realDemand?: number | null;
    realCompetition?: Level | null;
  };

  let seed = $state($page.url.searchParams.get("seed") ?? "");
  let keywords = $state<KeywordRow[]>([]);
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let selectedKws = $state<string[]>([]);
  let copied = $state(false);

  const handleSearch = async (e: Event) => {
    e.preventDefault();
    if (!seed.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ keywords: KeywordRow[] }>("keyword-generator", {
      seed: seed.trim(),
    });

    if (res.ok) {
      keywords = res.data.keywords ?? [];
      hasSearched = true;
      selectedKws = [];
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };

  const toggleKw = (kw: string) => {
    selectedKws = selectedKws.includes(kw) ? selectedKws.filter((k) => k !== kw) : [...selectedKws, kw];
  };

  // Rows to save: the ticked ones, or all results when nothing is ticked. Carries the
  // AI-estimated metrics so the saved list's columns populate.
  const saveRows = $derived(
    (selectedKws.length ? keywords.filter((k) => selectedKws.includes(k.keyword)) : keywords).map((k) => ({
      keyword: k.keyword,
      volume: k.volume,
      competition: k.competition,
    })),
  );

  // Colour a trend string by its sign: rising green, falling red, flat muted.
  const trendColor = (trend: string) => {
    const t = trend.trim();
    if (/^[+]/.test(t) || /^[1-9]/.test(t)) return "var(--teal-dark)";
    if (/^-/.test(t) || /\bdown\b/i.test(t)) return "var(--danger)";
    return "var(--text-muted)";
  };
  const copyKws = () => {
    navigator.clipboard.writeText(selectedKws.join(", "));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };
</script>

<ToolPageLayout
  title="Keyword Finder"
  description="See the words buyers actually type when they're after something like yours — tagged long-tail or broad per Etsy's guidance, with real measured demand shown wherever our Etsy index has it."
  icon={Search}
  credits={1}
>
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label for="keyword-seed" class="field-label">What's your starting word?</label>
      <input
        id="keyword-seed"
        type="text"
        bind:value={seed}
        placeholder="personalized necklace"
        class="field"
      />
      <p class="field-hint">A product or a phrase — we'll branch out from there to find related searches.</p>
      <button type="submit" disabled={loading || !seed.trim()} class="btn btn-primary w-full justify-center mt-4">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Looking…{:else}Find keywords{/if}
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
    <div class="animate-fade-in">
      <Skeleton width="40%" height="1.25rem" />
      <div class="mt-5 overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-9"></th>
              <th>Keyword</th>
              <th class="text-right">Volume</th>
              <th>Competition</th>
              <th class="text-right">CPC</th>
              <th class="text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {#each Array(8) as _, i (i)}
              <tr>
                <td></td>
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
    </div>
  {:else if hasSearched && keywords.length}
    <div class="animate-fade-in">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <p class="section-kicker mb-1">Related keywords</p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">{keywords.length} to consider</h2>
          <p class="lead text-sm">Tick the ones that fit, then copy them across to your listing.</p>
        </div>
        <div class="flex items-center gap-4 shrink-0 pt-1">
          <button
            type="button"
            onclick={copyKws}
            disabled={!selectedKws.length}
            class="copy-link disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {#if copied}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{selectedKws.length ? ` (${selectedKws.length})` : ""}{/if}
          </button>
          <SaveToListMenu
            items={saveRows}
            label={selectedKws.length ? "Save selected" : "Save all"}
            disabled={!keywords.length}
          />
        </div>
      </div>

      <p class="text-[0.8125rem] text-text-secondary mb-2 inline-flex items-center gap-2 flex-wrap">
        Volume, CPC and trend are <EstimatedBadge label="Estimated" method="Volume, CPC and trend are relative AI estimates, not official Etsy data." />
        · rows we've measured show <RealDataBadge label="demand" tooltip="Real 0-100 demand measured by VieRank's Etsy index — not an estimate." />
      </p>
      <p class="text-[0.75rem] text-text-muted mb-4">
        Tagged <span class="text-success font-medium">long-tail</span> / <span class="text-warning font-medium">broad</span> per
        <a href="https://www.etsy.com/seller-handbook/article/22794885498" target="_blank" rel="noopener" class="copy-link !text-text-muted hover:!text-teal">Etsy's keyword guidance ↗</a> — specific long-tail phrases convert better than broad single words.
      </p>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-9"></th>
              <th>Keyword</th>
              <th class="text-right">Volume</th>
              <th>Competition</th>
              <th class="text-right">CPC</th>
              <th class="text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {#each keywords as kw, i (kw.keyword + "-" + i)}
              <tr class="cursor-pointer" onclick={() => toggleKw(kw.keyword)}>
                <td><input type="checkbox" checked={selectedKws.includes(kw.keyword)} onchange={() => toggleKw(kw.keyword)} onclick={(e) => e.stopPropagation()} class="w-4 h-4 rounded border-border accent-teal cursor-pointer" /></td>
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
                <td class="text-right text-text-secondary tabular-nums">{kw.cpc}</td>
                <td class="text-right font-medium tabular-nums" style="color: {trendColor(kw.trend)}">{kw.trend}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty icon={Search} title="Your keywords will appear here" hint="Give us a starting word on the left and we'll branch out into the searches buyers actually type — each with an honest read on volume and competition.">
      {#snippet preview()}
        <table class="w-full">
          <tbody>
            {#each [{ keyword: "personalized necklace", volume: 8320, competition: "medium" as Level }, { keyword: "name necklace gold", volume: 5140, competition: "low" as Level }, { keyword: "bridesmaid gift necklace", volume: 2960, competition: "low" as Level }] as ex, i (i)}
              <tr class="border-b border-border-light">
                <td class="py-2 text-[0.8125rem] text-text-primary">{ex.keyword}</td>
                <td class="py-2 text-[0.8125rem] text-right text-text-primary tabular-nums pr-4">{ex.volume.toLocaleString()}</td>
                <td class="py-2"><Badge level={ex.competition} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

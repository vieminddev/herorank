<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, Copy, Check, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type Level = "high" | "medium" | "low";
  type KeywordRow = {
    keyword: string;
    volume: number;
    competition: Level;
    cpc: string;
    trend: string;
  };

  let seed = $state("");
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
  const copyKws = () => {
    navigator.clipboard.writeText(selectedKws.join(", "));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };
</script>

<ToolPageLayout
  title="Keyword Finder"
  description="See the words buyers actually type when they're after something like yours. We show volume and competition as estimates, so you know what's worth chasing."
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

  {#if hasSearched && keywords.length}
    <div class="animate-fade-in">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div>
          <p class="section-kicker mb-1">Related keywords</p>
          <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">{keywords.length} to consider</h2>
          <p class="lead text-sm">Tick the ones that fit, then copy them across to your listing.</p>
        </div>
        <button
          type="button"
          onclick={copyKws}
          disabled={!selectedKws.length}
          class="copy-link shrink-0 pt-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {#if copied}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{selectedKws.length ? ` (${selectedKws.length})` : ""}{/if}
        </button>
      </div>

      <p class="text-[0.8125rem] text-text-secondary mb-4 inline-flex items-center gap-2">
        Volume, CPC and trend are <EstimatedBadge label="Estimated" tooltip="These signals are estimated, not official Etsy figures." />
      </p>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border">
              <th class="w-9 py-2.5"></th>
              <th class="text-left py-2.5 text-[0.8125rem] font-medium text-text-secondary">Keyword</th>
              <th class="text-right py-2.5 text-[0.8125rem] font-medium text-text-secondary pr-4">Volume</th>
              <th class="text-left py-2.5 text-[0.8125rem] font-medium text-text-secondary">Competition</th>
              <th class="text-right py-2.5 text-[0.8125rem] font-medium text-text-secondary pr-4">CPC</th>
              <th class="text-right py-2.5 text-[0.8125rem] font-medium text-text-secondary">Trend</th>
            </tr>
          </thead>
          <tbody>
            {#each keywords as kw (kw.keyword)}
              <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer" onclick={() => toggleKw(kw.keyword)}>
                <td class="py-3"><input type="checkbox" checked={selectedKws.includes(kw.keyword)} onchange={() => toggleKw(kw.keyword)} onclick={(e) => e.stopPropagation()} class="w-4 h-4 rounded border-border accent-teal cursor-pointer" /></td>
                <td class="py-3 text-[0.9375rem] text-text-primary">{kw.keyword}</td>
                <td class="py-3 text-sm text-right text-text-primary tabular-nums pr-4">{kw.volume.toLocaleString()}</td>
                <td class="py-3"><Badge level={kw.competition} /></td>
                <td class="py-3 text-sm text-right text-text-secondary tabular-nums pr-4">{kw.cpc}</td>
                <td class="py-3 text-sm text-right font-medium text-success tabular-nums">{kw.trend}</td>
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

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { Search, Copy, Check } from "lucide-svelte";

  const MOCK_KEYWORDS = [
    { keyword: "personalized necklace", volume: 18200, competition: "high" as const, cpc: "$1.20", trend: "+12%" },
    { keyword: "custom name necklace", volume: 14800, competition: "medium" as const, cpc: "$0.95", trend: "+8%" },
    { keyword: "dainty gold necklace", volume: 12400, competition: "medium" as const, cpc: "$0.85", trend: "+15%" },
    { keyword: "personalized jewelry for women", volume: 9800, competition: "low" as const, cpc: "$0.75", trend: "+22%" },
    { keyword: "name plate necklace", volume: 8200, competition: "low" as const, cpc: "$0.65", trend: "+5%" },
    { keyword: "custom jewelry gift", volume: 7600, competition: "medium" as const, cpc: "$0.90", trend: "+18%" },
    { keyword: "bridesmaid necklace gift", volume: 6400, competition: "low" as const, cpc: "$0.55", trend: "+28%" },
    { keyword: "initial necklace gold", volume: 5800, competition: "low" as const, cpc: "$0.60", trend: "+10%" },
    { keyword: "engraved necklace for mom", volume: 4200, competition: "low" as const, cpc: "$0.50", trend: "+35%" },
    { keyword: "minimalist name jewelry", volume: 3600, competition: "low" as const, cpc: "$0.45", trend: "+42%" },
  ];

  let seed = $state("");
  let hasSearched = $state(false);
  let selectedKws = $state<string[]>([]);
  let copied = $state(false);

  const handleSearch = (e: Event) => { e.preventDefault(); if (seed.trim()) hasSearched = true; };
  const toggleKw = (kw: string) => {
    selectedKws = selectedKws.includes(kw) ? selectedKws.filter((k) => k !== kw) : [...selectedKws, kw];
  };
  const copyKws = () => { navigator.clipboard.writeText(selectedKws.join(", ")); copied = true; setTimeout(() => (copied = false), 2000); };
</script>

<ToolPageLayout title="Keyword Generator" prefix="" description="Find related keywords for any seed term. See search volume, competition, and trends to discover the best keywords for your listings.">
  <form onsubmit={handleSearch} class="mb-8">
    <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Seed keyword <span class="text-danger text-xs font-normal">(required)</span></label>
    <div class="flex gap-3">
      <div class="relative flex-1"><Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="text" bind:value={seed} placeholder="e.g. personalized necklace" class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" /></div>
      <button type="submit" class="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style="background: var(--navy)">Search</button>
    </div>
  </form>
  {#if hasSearched}
    <div class="animate-fade-in">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-base font-bold text-text-primary">Related Keywords ({MOCK_KEYWORDS.length})</h3>
        <button onclick={copyKws} disabled={!selectedKws.length} class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all" style="background: var(--navy)">
          {#if copied}<Check size={14} /> Copied!{:else}<Copy size={14} /> Copy Selected ({selectedKws.length}){/if}
        </button>
      </div>
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead><tr class="border-b border-border-light bg-bg-page/50">
              <th class="w-10 px-4 py-3"></th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Keyword</th>
              <th class="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Volume</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Competition</th>
              <th class="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">CPC</th>
              <th class="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Trend</th>
            </tr></thead>
            <tbody>
              {#each MOCK_KEYWORDS as kw (kw.keyword)}
                <tr class="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer" onclick={() => toggleKw(kw.keyword)}>
                  <td class="px-4 py-3"><input type="checkbox" checked={selectedKws.includes(kw.keyword)} onchange={() => toggleKw(kw.keyword)} onclick={(e) => e.stopPropagation()} class="w-4 h-4 rounded accent-teal cursor-pointer" /></td>
                  <td class="px-4 py-3 text-sm font-medium text-text-primary">{kw.keyword}</td>
                  <td class="px-4 py-3 text-sm text-right text-text-primary">{kw.volume.toLocaleString()}</td>
                  <td class="px-4 py-3"><Badge level={kw.competition} /></td>
                  <td class="px-4 py-3 text-sm text-right text-text-secondary">{kw.cpc}</td>
                  <td class="px-4 py-3 text-sm text-right font-medium text-success">{kw.trend}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</ToolPageLayout>

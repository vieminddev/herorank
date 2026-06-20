<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Layers, Copy, Check, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  type Level = "low" | "medium" | "high";
  type KeywordRow = {
    keyword: string;
    volume: number;
    competition: Level;
    cpc?: string;
    trend: string;
  };
  type SeedGroup = { seed: string; keywords: KeywordRow[] };

  let seedsText = $state("");
  let groups = $state<SeedGroup[]>([]);
  let charged = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let copiedSeed = $state<string | null>(null);

  const seedList = $derived(
    seedsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!seedList.length || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ results: SeedGroup[]; charged: number }>("bulk-keywords", {
      seeds: seedList.slice(0, 10),
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
  prefix="Etsy"
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

  {#if groups.length}
    <div class="animate-fade-in space-y-8">
      <p class="text-sm text-text-muted">
        Researched {groups.length} seed{groups.length === 1 ? "" : "s"} · {charged} credit{charged === 1 ? "" : "s"} used.
      </p>
      {#each groups as g (g.seed)}
        <section>
          <div class="flex items-center justify-between mb-3">
            <p class="section-kicker !mb-0">{g.seed}</p>
            <button type="button" class="copy-link" onclick={() => copyGroup(g)}>
              {#if copiedSeed === g.seed}
                <Check size={13} class="text-success" /> Copied
              {:else}
                <Copy size={13} /> Copy
              {/if}
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <tbody>
                {#each g.keywords as kw (kw.keyword)}
                  <tr class="border-b border-border-light">
                    <td class="py-2.5 text-[0.9375rem] text-text-primary">{kw.keyword}</td>
                    <td class="py-2.5 text-sm text-right text-text-primary tabular-nums pr-4">{kw.volume.toLocaleString()}</td>
                    <td class="py-2.5"><Badge level={kw.competition} /></td>
                    <td class="py-2.5 text-sm text-right font-medium text-success tabular-nums">{kw.trend}</td>
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
    />
  {/if}
</ToolPageLayout>

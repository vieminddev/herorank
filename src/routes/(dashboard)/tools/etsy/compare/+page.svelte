<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import { Columns3, Trophy, X, Plus, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // One compared listing as returned by POST /api/tools/listing-compare (etsy-tools.ts).
  interface CompareRow {
    listingId: number;
    title: string;
    url?: string;
    imageUrl: string | null;
    price: string;
    priceValue: number;
    faves: number;
    tagCount: number;
    titleLength: number;
    imageCount: number;
    hasVideo: boolean;
    seoScore: number;
  }

  let inputs = $state<string[]>(["", ""]);
  let rows = $state<CompareRow[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);

  // Index of the best row per winnable metric (used to highlight the leader).
  const best = $derived.by<Record<string, number>>(() => {
    if (!rows.length) return {};
    const max = (sel: (r: CompareRow) => number) =>
      rows.reduce((bi, r, i, a) => (sel(r) > sel(a[bi]) ? i : bi), 0);
    return {
      seoScore: max((r) => r.seoScore),
      faves: max((r) => r.faves),
      tagCount: max((r) => r.tagCount),
      imageCount: max((r) => r.imageCount),
    };
  });

  type Metric = {
    key: string;
    label: string;
    fmt: (r: CompareRow) => string;
    winnable: boolean;
  };

  const METRICS: Metric[] = [
    { key: "seoScore", label: "SEO score", fmt: (r) => `${r.seoScore}/100`, winnable: true },
    { key: "price", label: "Price", fmt: (r) => r.price, winnable: false },
    { key: "faves", label: "Favourites", fmt: (r) => r.faves.toLocaleString(), winnable: true },
    { key: "tagCount", label: "Tags used", fmt: (r) => `${r.tagCount}/13`, winnable: true },
    { key: "titleLength", label: "Title length", fmt: (r) => `${r.titleLength} chars`, winnable: false },
    { key: "imageCount", label: "Photos", fmt: (r) => String(r.imageCount), winnable: true },
    { key: "hasVideo", label: "Has video", fmt: (r) => (r.hasVideo ? "Yes" : "No"), winnable: false },
  ];

  const addRow = () => {
    if (inputs.length < 4) inputs = [...inputs, ""];
  };
  const removeRow = (i: number) => {
    inputs = inputs.filter((_, idx) => idx !== i);
  };

  const handleCompare = async (e: SubmitEvent) => {
    e.preventDefault();
    const listings = inputs.map((s) => s.trim()).filter(Boolean);
    if (listings.length < 2 || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<{ listings: CompareRow[] }>("listing-compare", { listings });

    if (res.ok) {
      rows = res.data.listings;
      await invalidateAll(); // refresh Header credits badge
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
  title="Compare Listings"
  prefix="Etsy"
  description="Put two to four listings side by side and see how they stack up — SEO, tags, photos, favourites. Spot what the stronger listing is doing that yours isn't."
  icon={Columns3}
  credits={3}
>
  {#snippet controls()}
    <form onsubmit={handleCompare}>
      <p class="section-kicker mb-3">Listings to compare</p>
      <div class="space-y-2">
        {#each inputs as input, i (i)}
          <div class="flex gap-2">
            <input
              bind:value={inputs[i]}
              placeholder={`Listing URL or ID ${i + 1}`}
              class="field flex-1"
            />
            {#if inputs.length > 2}
              <button
                type="button"
                onclick={() => removeRow(i)}
                class="btn btn-ghost px-2 shrink-0"
                aria-label="Remove"
              >
                <X size={15} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
      {#if inputs.length < 4}
        <button type="button" onclick={addRow} class="copy-link mt-3">
          <Plus size={13} /> Add another
        </button>
      {/if}
      <button
        type="submit"
        disabled={loading || inputs.filter((s) => s.trim()).length < 2}
        class="btn btn-primary w-full justify-center mt-5"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Comparing…{:else}Compare{/if}
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

  {#if rows.length}
    <div class="animate-fade-in">
      <p class="section-kicker mb-1 inline-flex items-center gap-2">
        Side by side
        <EstimatedBadge
          label="SEO estimated"
          tooltip="SEO score is a rule-based estimate. Price, favourites, tags and photos are real listing data."
        />
      </p>
      <div class="overflow-x-auto mt-3">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="text-left py-3 pr-4 text-[0.8125rem] font-medium text-text-secondary align-bottom w-32">Metric</th>
              {#each rows as r (r.listingId)}
                <th class="text-left py-3 px-3 align-bottom min-w-[140px]">
                  <div class="w-16 h-16 rounded-lg bg-surface-2 overflow-hidden mb-2">
                    {#if r.imageUrl}
                      <img src={r.imageUrl} alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
                    {/if}
                  </div>
                  {#if r.url}
                    <a href={r.url} target="_blank" rel="noopener" class="text-[0.8125rem] text-text-primary line-clamp-2 hover:text-teal">{r.title}</a>
                  {:else}
                    <span class="text-[0.8125rem] text-text-primary line-clamp-2">{r.title}</span>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each METRICS as metric (metric.key)}
              <tr class="border-t border-border-light">
                <td class="py-3 pr-4 text-sm text-text-secondary">{metric.label}</td>
                {#each rows as r, i (r.listingId)}
                  {@const isBest = metric.winnable && best[metric.key] === i}
                  <td class="py-3 px-3 text-sm tabular-nums {isBest ? 'text-success font-semibold' : 'text-text-primary'}">
                    <span class="inline-flex items-center gap-1.5">
                      {metric.fmt(r)}
                      {#if isBest}<Trophy size={12} class="text-success" />{/if}
                    </span>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty
      icon={Columns3}
      title="Your comparison will appear here"
      hint="Add two to four Etsy listing URLs on the left — yours and a competitor's — and we'll line up the numbers."
    />
  {/if}
</ToolPageLayout>

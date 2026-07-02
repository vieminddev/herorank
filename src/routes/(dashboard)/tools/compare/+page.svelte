<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { Columns3, Trophy, X, Plus, LoaderCircle, CircleAlert, Download, Copy, Check } from "lucide-svelte";
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
    tags: string[];
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
  let copied = $state(false);

  // Index of the best row per winnable metric (used to highlight the leader).
  const best = $derived.by<Record<string, number>>(() => {
    if (!rows.length) return {} as Record<string, number>;
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

  // --- Tag overlap / gap analysis ------------------------------------------
  const normTags = (r: CompareRow) => (r.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

  const tagAnalysis = $derived.by(() => {
    if (rows.length < 2) return null;
    const sets = rows.map((r) => new Set(normTags(r)));
    // Shared across ALL listings.
    const shared = [...sets[0]].filter((t) => sets.every((s) => s.has(t)));
    // Unique to each listing (present in this one, absent in all others).
    const unique = rows.map((_, i) =>
      [...sets[i]].filter((t) => sets.every((s, j) => j === i || !s.has(t)))
    );
    const hasAnyTags = sets.some((s) => s.size > 0);
    return { shared: shared.sort(), unique, hasAnyTags };
  });

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

  // --- Export / copy --------------------------------------------------------
  function buildCsv(): string {
    const header = ["Metric", ...rows.map((r) => r.title.replace(/\s+/g, " ").trim())];
    const lines: string[][] = [header];
    for (const m of METRICS) {
      lines.push([m.label, ...rows.map((r) => m.fmt(r))]);
    }
    if (tagAnalysis) {
      lines.push(["Shared tags", ...rows.map(() => tagAnalysis.shared.join(" | "))]);
      lines.push(["Unique tags", ...rows.map((_, i) => tagAnalysis.unique[i].join(" | "))]);
    }
    return lines
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
  }

  function downloadCsv() {
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "etsy-listing-comparison.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyComparison() {
    const lines = [
      "Etsy listing comparison",
      ...rows.map((r, i) => `${i + 1}. ${r.title}`),
      "",
      ...METRICS.map((m) => `${m.label}: ${rows.map((r) => m.fmt(r)).join(" | ")}`),
    ];
    if (tagAnalysis?.shared.length) lines.push("", `Shared tags: ${tagAnalysis.shared.join(", ")}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }
</script>

<ToolPageLayout
  title="Compare Listings"
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

  {#if loading}
    <div class="animate-fade-in" aria-hidden="true">
      <p class="section-kicker mb-3">Side by side</p>
      <Skeleton height="5rem" class="mb-3" />
      <Skeleton lines={7} />
    </div>
  {:else if rows.length}
    <div class="animate-fade-in">
      <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
        <p class="section-kicker inline-flex items-center gap-2">
          Side by side
          <EstimatedBadge
            label="SEO estimated"
            tooltip="SEO score is a rule-based estimate. Price, favourites, tags and photos are real listing data."
          />
        </p>
        <div class="flex gap-2 shrink-0">
          <button type="button" onclick={copyComparison} class="btn btn-ghost gap-1.5">
            {#if copied}<Check size={14} class="text-success" /> Copied{:else}<Copy size={14} /> Copy{/if}
          </button>
          <button type="button" onclick={downloadCsv} class="btn btn-ghost gap-1.5">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-32">Metric</th>
              {#each rows as r (r.listingId)}
                <th class="min-w-[140px] !normal-case !tracking-normal">
                  <div class="w-16 h-16 rounded-lg bg-bg-page border border-border overflow-hidden mb-2">
                    {#if r.imageUrl}
                      <img src={r.imageUrl} alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
                    {/if}
                  </div>
                  {#if r.url}
                    <a href={r.url} target="_blank" rel="noopener" class="text-[0.8125rem] font-medium text-text-primary line-clamp-2 hover:text-teal">{r.title}</a>
                  {:else}
                    <span class="text-[0.8125rem] font-medium text-text-primary line-clamp-2">{r.title}</span>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each METRICS as metric (metric.key)}
              <tr>
                <td class="text-text-secondary">{metric.label}</td>
                {#each rows as r, i (r.listingId)}
                  {@const isBest = metric.winnable && best[metric.key] === i}
                  <td class="tabular-nums {isBest ? 'font-semibold' : 'text-text-primary'}" style={isBest ? "color: var(--orange)" : ""}>
                    <span class="inline-flex items-center gap-1.5">
                      {metric.fmt(r)}
                      {#if isBest}<Trophy size={12} style="color: var(--orange)" />{/if}
                    </span>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Tag overlap / gap analysis -->
      {#if tagAnalysis}
        <hr class="rule my-8" />
        <p class="section-kicker mb-1">Tag overlap &amp; gaps</p>
        <p class="lead text-sm mb-4">Shared tags show where these listings compete head-to-head; unique tags show the keyword ground each one owns alone.</p>

        {#if !tagAnalysis.hasAnyTags}
          <div class="panel-tint p-4 text-sm text-text-secondary">No tags found on these listings.</div>
        {:else}
          <div class="panel-tint p-4 mb-4">
            <p class="text-sm font-medium text-text-primary mb-2">
              Shared by all <span class="text-text-muted font-normal">({tagAnalysis.shared.length})</span>
            </p>
            {#if tagAnalysis.shared.length}
              <div class="flex flex-wrap gap-1.5">
                {#each tagAnalysis.shared as tag, i (tag + "-" + i)}
                  <span class="badge badge-nodata">{tag}</span>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-text-secondary">No tags shared across all listings — they target different searches.</p>
            {/if}
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            {#each rows as r, i (r.listingId)}
              <div class="card p-4">
                <p class="text-sm font-medium text-text-primary line-clamp-1 mb-1">{r.title}</p>
                <p class="section-kicker mb-2">Unique tags <span class="text-text-muted">({tagAnalysis.unique[i].length})</span></p>
                {#if tagAnalysis.unique[i].length}
                  <div class="flex flex-wrap gap-1.5">
                    {#each tagAnalysis.unique[i] as tag, j (tag + "-" + j)}
                      <span class="badge badge-nodata" style="border-color: var(--orange-light); color: var(--orange-dark)">{tag}</span>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm text-text-secondary">No unique tags — every tag is shared with another listing.</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {:else if !error}
    <ToolEmpty
      icon={Columns3}
      title="Your comparison will appear here"
      hint="Add two to four Etsy listing URLs on the left — yours and a competitor's — and we'll line up the numbers."
    />
  {/if}
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, Star, ShieldCheck, ShieldAlert, ShieldX, LoaderCircle, CircleAlert } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // REDEFINED (BA spec §4.7): buyer data does not exist in any Etsy source. This tool now
  // analyzes a SHOP's public review reputation. Input is a shop name/URL, output is shop
  // reputation. `riskLevel` is an estimated reputation signal → EstimatedBadge.
  interface ShopReview {
    product: string; // listing/product within this shop
    rating: number;
    text: string;
    date: string;
  }
  interface ReputationResult {
    shop: string;         // backend field name (BuyerCheckResponse.shop)
    shopOpened: string;
    totalReviews: number;
    avgRating: number;
    positivePct: number;  // % reviews >= 4 stars
    accountAgeYears: number; // backend field name (number, not string)
    riskLevel: "low" | "medium" | "high";
    reviews: ShopReview[];
  }

  let shopInput = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let notFound = $state(false);
  let result = $state<ReputationResult | null>(null);

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!shopInput.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    notFound = false;

    const res = await callTool<ReputationResult>("buyer-check", {
      shop: shopInput.trim(),
    });

    if (res.ok) {
      result = res.data;
      hasSearched = true;
      await invalidateAll();
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else if (res.status === 404) {
      notFound = true;
      result = null;
      hasSearched = true;
    } else {
      error = res.message;
    }
    loading = false;
  };
</script>

<ToolPageLayout title="Reputation Check" description="Before you buy or partner with a shop, take a quiet look at its track record — review history, rating consistency, and any risk signals. The risk read is an estimate from public reviews.">
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label class="field-label" for="shop-input">Which shop should we look into?</label>
      <div class="relative"><Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input id="shop-input" type="text" bind:value={shopInput} placeholder="e.g. CaitlynMinimalist" class="field pl-10" data-testid="shop-input" /></div>
      <p class="field-hint">Paste a shop name or its Etsy URL — either works.</p>
      <button type="submit" disabled={loading || !shopInput.trim()} class="btn btn-primary w-full justify-center mt-4" data-testid="shop-submit">
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Checking…{:else}Check reputation{/if}
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

  {#if notFound}
    <div class="resting animate-fade-in">
      <p class="text-sm text-text-secondary">We couldn't find that shop.</p>
      <p class="text-[0.8125rem]">Double-check the name or URL and try again.</p>
    </div>
  {/if}

  {#if hasSearched && result}
    <div class="animate-fade-in">
      <!-- Shop header + risk read -->
      <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p class="section-kicker mb-1">Reputation check</p>
          <h2 class="text-xl font-semibold tracking-tight text-text-primary">{result.shop}</h2>
          <p class="lead text-sm mt-0.5">Shop opened {result.shopOpened}.</p>
        </div>
        <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full" style="background: {result.riskLevel === 'low' ? 'var(--success-bg)' : result.riskLevel === 'medium' ? 'var(--warning-bg)' : 'var(--danger-bg)'}">
          {#if result.riskLevel === "low"}
            <ShieldCheck size={18} class="text-success" />
          {:else if result.riskLevel === "medium"}
            <ShieldAlert size={18} class="text-warning" />
          {:else}
            <ShieldX size={18} class="text-danger" />
          {/if}
          <span class="text-sm font-semibold capitalize" style="color: {result.riskLevel === 'low' ? 'var(--success)' : result.riskLevel === 'medium' ? 'var(--warning)' : 'var(--danger)'}">{result.riskLevel} risk</span>
          <EstimatedBadge label="Est." tooltip="Reputation risk is estimated from public review signals — not an official Etsy rating." />
        </div>
      </div>

      <!-- Stats — hairline-bounded row, no nested boxes -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6 py-5 border-y border-border-light mb-8">
        <div><div class="text-2xl font-semibold text-text-primary tabular-nums">{result.totalReviews.toLocaleString()}</div><div class="entry-meta mt-0.5">Total reviews</div></div>
        <div><div class="text-2xl font-semibold text-text-primary tabular-nums">{result.avgRating}</div><div class="entry-meta mt-0.5">Avg rating</div></div>
        <div><div class="text-2xl font-semibold text-success tabular-nums">{result.positivePct}%</div><div class="entry-meta mt-0.5">Positive</div></div>
        <div><div class="text-2xl font-semibold text-text-primary tabular-nums">{result.accountAgeYears}y</div><div class="entry-meta mt-0.5">Shop age</div></div>
      </div>

      <!-- Recent reviews -->
      <p class="section-kicker mb-1">In their own words</p>
      <h3 class="text-lg font-semibold tracking-tight text-text-primary mb-4">Recent reviews</h3>
      <div class="entry-list">
        {#each result.reviews as r, i (i)}
          <div class="entry">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-3 mb-1">
                <span class="text-sm font-semibold text-text-primary truncate">{r.product}</span>
                <span class="entry-meta shrink-0">{r.date}</span>
              </div>
              <div class="flex gap-0.5 mb-1.5">{#each [1,2,3,4,5] as s (s)}<Star size={12} class={s <= r.rating ? "text-warning fill-warning" : "text-border"} />{/each}</div>
              <p class="text-sm text-text-secondary leading-relaxed">{r.text}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if !hasSearched && !error}
    <ToolEmpty
      icon={ShieldCheck}
      title="A shop's reputation will appear here"
      hint="Enter a shop name on the left and we'll lay out its review history and rating consistency — with a quiet, estimated risk read from public reviews."
    >
      {#snippet preview()}
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <p class="text-[0.9375rem] font-semibold text-text-primary leading-tight">CaitlynMinimalist</p>
            <p class="entry-meta mt-0.5">Shop opened 2017</p>
          </div>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style="background: var(--success-bg)">
            <ShieldCheck size={14} class="text-success" />
            <span class="text-xs font-semibold text-success">Low risk</span>
          </span>
        </div>
        <div class="grid grid-cols-3 gap-x-6 gap-y-4 py-4 border-y border-border-light">
          {#each [["Total reviews", "—"], ["Avg rating", "—"], ["Positive", "—"]] as [label, value] (label)}
            <div>
              <div class="text-xl font-semibold text-text-muted tabular-nums">{value}</div>
              <div class="entry-meta mt-0.5">{label}</div>
            </div>
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

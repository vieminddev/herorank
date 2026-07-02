<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Search, Star, ShieldCheck, ShieldAlert, ShieldX, LoaderCircle, CircleAlert, ExternalLink, Store, AlertTriangle, TrendingUp, TrendingDown, Minus, Fingerprint, CircleCheck, ChevronLeft, ChevronRight } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  interface ShopReview {
    product: string;
    listingId?: number;
    rating: number;
    text: string;
    date: string;
  }
  interface ReputationResult {
    shop: string;
    shopOpened: string;
    totalReviews: number;
    avgRating: number;
    positivePct: number;
    accountAgeYears: number;
    riskLevel: "low" | "medium" | "high";
    reviews: ShopReview[];
    reviewsSampled: number;
    rawFetched?: number;
    complaints: { key: string; label: string; count: number; pct: number; recentCount: number }[];
    ratingTrend?: { recentAvg: number; delta: number; direction: "improving" | "declining" | "stable"; sampleSize: number };
    authenticity?: { noTextPct: number; shortTextPct: number; suspiciousBurst: boolean; burstCount?: number };
  }

  let shopInput = $state("");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let notFound = $state(false);
  let result = $state<ReputationResult | null>(null);

  const loadDemo = () => {
    result = {
      shop: "VintageCharmCrafts (Demo)",
      shopOpened: "2018",
      totalReviews: 12450,
      avgRating: 4.8,
      positivePct: 96,
      accountAgeYears: 8,
      riskLevel: "low",
      reviewsSampled: 100,
      reviews: [
        { product: "Personalized Brass Bookmark", rating: 5, text: "Absolutely stunning! The engraving was beautiful and it arrived in a gorgeous box.", date: "Jun 24, 2026" },
        { product: "Custom Leather Journal", rating: 5, text: "Excellent quality leather and fast shipping. Highly recommend this shop!", date: "Jun 23, 2026" },
        { product: "Vintage Style Key Ring", rating: 4, text: "Very nice item, though shipping took a day longer than expected.", date: "Jun 20, 2026" },
      ],
      complaints: [],
      ratingTrend: { recentAvg: 4.9, delta: 0.1, direction: "improving", sampleSize: 20 },
      authenticity: { noTextPct: 12, shortTextPct: 15, suspiciousBurst: false }
    };
    hasSearched = true;
  };

  type ReviewFilter = "all" | "positive" | "neutral" | "negative";
  let reviewFilter = $state<ReviewFilter>("all");
  let reviewPage = $state(1);
  const REVIEWS_PER_PAGE = 10;

  const filteredReviews = $derived(
    result?.reviews.filter((r) => {
      if (reviewFilter === "positive") return r.rating >= 4;
      if (reviewFilter === "neutral") return r.rating === 3;
      if (reviewFilter === "negative") return r.rating <= 2;
      return true;
    }) ?? []
  );

  const auth = $derived(result?.authenticity);
  const hasAuthFlags = $derived(
    !!auth && (auth.suspiciousBurst || (auth.noTextPct ?? 0) >= 25 || (auth.shortTextPct ?? 0) >= 40)
  );

  const totalReviewPages = $derived(Math.max(1, Math.ceil(filteredReviews.length / REVIEWS_PER_PAGE)));
  // Clamp the current page when the filtered set shrinks (e.g. switching to a smaller filter).
  const safePage = $derived(Math.min(reviewPage, totalReviewPages));
  const pagedReviews = $derived(
    filteredReviews.slice((safePage - 1) * REVIEWS_PER_PAGE, safePage * REVIEWS_PER_PAGE)
  );

  function setReviewFilter(key: ReviewFilter) {
    reviewFilter = key;
    reviewPage = 1;
  }

  const shopAge = $derived(
    result
      ? result.accountAgeYears === 0 ? "< 1y" : `${result.accountAgeYears}y`
      : "—"
  );

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!shopInput.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    notFound = false;
    reviewFilter = "all";

    try {
      const res = await callTool<ReputationResult>("buyer-check", {
        shop: shopInput.trim(),
      });

      if (res.ok) {
        result = res.data;
        hasSearched = true;
        void invalidateAll();
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
    } catch {
      error = "Something went wrong. Please try again.";
    }
    loading = false;
  };
</script>

<ToolPageLayout title="Reputation Check" description="Before you buy or partner with a shop, take a quiet look at its track record — review history, rating consistency, and any risk signals. The risk read is an estimate from public reviews." credits={3}>
  {#snippet controls()}
    <form onsubmit={handleSearch}>
      <label class="field-label" for="shop-input">Which shop should we look into?</label>
      <div class="field-wrap"><span class="field-affix"><Search size={16} /></span><input id="shop-input" type="text" bind:value={shopInput} placeholder="e.g. CaitlynMinimalist" class="field" data-testid="shop-input" /></div>
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
      <!-- Shop header + risk badge -->
      <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <p class="section-kicker mb-1">Reputation check</p>
          <h2 class="text-xl font-semibold tracking-tight text-text-primary">{result.shop}</h2>
          <p class="lead text-sm mt-0.5">Shop opened {result.shopOpened}.</p>
        </div>
        {#if result.totalReviews === 0}
          <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-bg-page border border-border">
            <ShieldAlert size={18} class="text-text-muted" />
            <span class="text-sm font-semibold text-text-secondary">No track record yet</span>
            <EstimatedBadge label="Est." tooltip="This shop has no public reviews yet, so there's no history to assess. New shops aren't necessarily risky — there's just nothing to read." />
          </div>
        {:else}
          <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full" style="background: {result.riskLevel === 'low' ? 'var(--success-bg)' : result.riskLevel === 'medium' ? 'var(--warning-bg)' : 'var(--danger-bg)'}">
            {#if result.riskLevel === "low"}
              <ShieldCheck size={18} class="text-success" />
            {:else if result.riskLevel === "medium"}
              <ShieldAlert size={18} class="text-warning" />
            {:else}
              <ShieldX size={18} class="text-danger" />
            {/if}
            <span class="text-sm font-semibold capitalize" style="color: {result.riskLevel === 'low' ? 'var(--success)' : result.riskLevel === 'medium' ? 'var(--warning)' : 'var(--danger)'}">{result.riskLevel} risk</span>
            <EstimatedBadge label="Est." method="Reputation risk is estimated from public review signals (volume and sentiment of a shop's reviews). Not an official Etsy rating." />
          </div>
        {/if}
      </div>

      <!-- Action links -->
      <div class="flex items-center gap-3 mb-6">
        <a href="https://www.etsy.com/shop/{result.shop}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-teal transition-colors">
          <ExternalLink size={13} /> View on Etsy
        </a>
        <span class="text-border-light">·</span>
        <a href="/tools/shop-analyzer?shop={encodeURIComponent(result.shop)}" class="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-teal transition-colors">
          <Store size={13} /> Analyze this shop
        </a>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6 py-5 border-y border-border-light mb-6">
        <div><div class="text-2xl font-semibold text-text-primary tabular-nums">{result.totalReviews.toLocaleString()}</div><div class="entry-meta mt-0.5">Total reviews</div></div>
        <div><div class="text-2xl font-semibold text-text-primary tabular-nums">{result.avgRating}</div><div class="entry-meta mt-0.5">Avg rating</div></div>
        <div><div class="text-2xl font-semibold text-success tabular-nums">{result.positivePct}%</div><div class="entry-meta mt-0.5">Positive</div></div>
        <div><div class="text-2xl font-semibold text-text-primary tabular-nums">{shopAge}</div><div class="entry-meta mt-0.5">Shop age</div></div>
      </div>

      <!-- A: Rating trend — ALWAYS shown (steady is a positive signal, not nothing) -->
      {#if result.ratingTrend}
        {@const t = result.ratingTrend}
        {@const isImproving = t.direction === 'improving'}
        {@const isDeclining = t.direction === 'declining'}
        {@const tColor = isImproving ? 'var(--success)' : isDeclining ? 'var(--danger)' : 'var(--text-muted)'}
        {@const tBg = isImproving ? 'var(--success-bg)' : isDeclining ? 'var(--danger-bg)' : 'var(--bg-page)'}
        {@const tBorder = isImproving ? 'var(--success-light, var(--success))' : isDeclining ? 'var(--danger-light, var(--danger))' : 'var(--border-light)'}
        <div class="flex items-center gap-3 px-4 py-3 rounded-xl border mb-8" style="background: {tBg}; border-color: {tBorder}">
          {#if isImproving}
            <TrendingUp size={15} style="color: {tColor}" class="shrink-0" />
          {:else if isDeclining}
            <TrendingDown size={15} style="color: {tColor}" class="shrink-0" />
          {:else}
            <Minus size={15} style="color: {tColor}" class="shrink-0" />
          {/if}
          <div class="flex-1 min-w-0">
            <span class="text-sm font-semibold" style="color: {tColor}">
              {isImproving ? 'Rating improving' : isDeclining ? 'Rating declining' : 'Rating holding steady'}
            </span>
            <span class="text-xs text-text-muted ml-1.5">recent avg {t.recentAvg} vs overall {result.avgRating} · {t.sampleSize} most recent reviews</span>
          </div>
          <span class="text-sm font-bold tabular-nums shrink-0" style="color: {tColor}">
            {t.delta > 0 ? '+' : ''}{t.delta}
          </span>
        </div>
      {/if}

      <!-- B: Review signals (complaint patterns + timing) — ALWAYS shown -->
      <div class="mb-8">
        <div class="flex items-center gap-2 mb-3">
          <p class="section-kicker">Review signals</p>
          <EstimatedBadge label="Est." tooltip="Detected by keyword scan of {result.reviewsSampled} unique review texts — not full sentiment analysis. A single mention already counts; use as a starting point, not a verdict." />
        </div>
        <div class="rounded-xl border border-border bg-white divide-y divide-border-light">
          {#if result.complaints?.length}
            {#each result.complaints as c}
              {@const color = c.pct >= 20 ? 'var(--danger)' : c.pct >= 10 ? 'var(--warning)' : 'var(--text-muted)'}
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <div class="flex items-center gap-2 min-w-0">
                  <AlertTriangle size={14} style="color: {color}" class="shrink-0" />
                  <span class="text-sm text-text-secondary">{c.label}</span>
                  {#if c.recentCount > 0}
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style="background: var(--warning-bg); color: var(--warning)">{c.recentCount} recent</span>
                  {/if}
                </div>
                <span class="text-sm font-semibold tabular-nums shrink-0" style="color: {color}">
                  {c.pct}% <span class="font-normal text-text-muted text-xs">({c.count} of {result.reviewsSampled})</span>
                </span>
              </div>
            {/each}
          {:else}
            <div class="flex items-center gap-2 px-4 py-3">
              <CircleCheck size={14} class="text-success shrink-0" />
              <span class="text-sm text-text-secondary">No recurring complaint patterns in the {result.reviewsSampled} reviews scanned.</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- C: Authenticity signals — ALWAYS shown -->
      <div class="mb-8">
        <div class="flex items-center gap-2 mb-3">
          <p class="section-kicker">Authenticity signals</p>
          <EstimatedBadge label="Est." tooltip="Detected from review text patterns in the public sample. Not a fraud verdict — use as one signal among many." />
        </div>
        <div class="rounded-xl border border-border bg-white divide-y divide-border-light">
          {#if hasAuthFlags}
            {#if (auth?.noTextPct ?? 0) >= 25}
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <div class="flex items-center gap-2">
                  <Fingerprint size={14} class="text-warning shrink-0" />
                  <span class="text-sm text-text-secondary">Rating-only reviews (no text)</span>
                </div>
                <span class="text-sm font-semibold tabular-nums text-warning shrink-0">{auth?.noTextPct}%</span>
              </div>
            {/if}
            {#if (auth?.shortTextPct ?? 0) >= 40}
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <div class="flex items-center gap-2">
                  <Fingerprint size={14} class="text-warning shrink-0" />
                  <span class="text-sm text-text-secondary">Very short reviews (&lt; 20 chars)</span>
                </div>
                <span class="text-sm font-semibold tabular-nums text-warning shrink-0">{auth?.shortTextPct}%</span>
              </div>
            {/if}
            {#if auth?.suspiciousBurst}
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <div class="flex items-center gap-2">
                  <Fingerprint size={14} class="text-danger shrink-0" />
                  <span class="text-sm text-text-secondary">Burst of {auth.burstCount} five-star reviews in a single week with very short text</span>
                </div>
                <span class="text-sm font-semibold tabular-nums text-danger shrink-0">Unusual</span>
              </div>
            {/if}
          {:else}
            <div class="flex items-center gap-2 px-4 py-3">
              <CircleCheck size={14} class="text-success shrink-0" />
              <span class="text-sm text-text-secondary">Reviews look authentic — no rating-only flooding, ultra-short text, or suspicious five-star bursts.</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Recent reviews -->
      <p class="section-kicker mb-0.5">In their own words</p>
      <h3 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Recent reviews</h3>
      <p class="text-xs text-text-muted mb-4">{result.reviews.length} unique reviews · {result.rawFetched ?? result.reviewsSampled} fetched from Etsy</p>

      <!-- Filter pills -->
      <div class="flex gap-2 mb-4 flex-wrap">
        {#each ([["all", "All"], ["positive", "Positive"], ["neutral", "Neutral"], ["negative", "Negative"]] as const) as [key, label]}
          <button
            type="button"
            onclick={() => setReviewFilter(key)}
            class="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors {reviewFilter === key ? 'border-teal bg-teal/10 text-teal' : 'border-border text-text-secondary hover:bg-bg-page'}"
          >{label}</button>
        {/each}
      </div>

      <div class="space-y-4">
        {#each pagedReviews as r, i (i)}
          <div class="pb-4 border-b border-border-light last:border-0">
            <div class="flex items-center gap-2 mb-1">
              <div class="flex gap-0.5">
                {#each [1,2,3,4,5] as s (s)}<Star size={12} class={s <= r.rating ? "text-warning fill-warning" : "text-border"} />{/each}
              </div>
              <span class="text-xs text-text-muted">{r.date}</span>
            </div>
            {#if r.text.trim()}
              <p class="text-sm text-text-secondary whitespace-pre-line break-words">{r.text}</p>
            {:else}
              <p class="text-xs text-text-muted italic">Rating only — no written review.</p>
            {/if}
          </div>
        {:else}
          <p class="text-sm text-text-muted py-2">No {reviewFilter} reviews in this sample.</p>
        {/each}
      </div>

      {#if filteredReviews.length > REVIEWS_PER_PAGE}
        <div class="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-border-light">
          <button
            type="button"
            onclick={() => { reviewPage = Math.max(1, safePage - 1); }}
            disabled={safePage <= 1}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-page disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span class="text-xs text-text-muted tabular-nums">
            Page {safePage} of {totalReviewPages}
            <span class="text-border-light">·</span>
            {(safePage - 1) * REVIEWS_PER_PAGE + 1}–{Math.min(safePage * REVIEWS_PER_PAGE, filteredReviews.length)} of {filteredReviews.length}
          </span>
          <button
            type="button"
            onclick={() => { reviewPage = Math.min(totalReviewPages, safePage + 1); }}
            disabled={safePage >= totalReviewPages}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-page disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      {/if}
    </div>
  {:else if !hasSearched && !error}
    <ToolEmpty
      icon={ShieldCheck}
      title="A shop's reputation will appear here"
      hint="Enter a shop name on the left and we'll lay out its review history and rating consistency — with a quiet, estimated risk read from public reviews."
      onLoadDemo={loadDemo}
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

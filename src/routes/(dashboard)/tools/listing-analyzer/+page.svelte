<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import EstimatedBadge from "$lib/components/ui/EstimatedBadge.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { Search, ExternalLink, Star, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, LoaderCircle, CircleAlert, FileText, Wrench, ArrowRight, Eye, Truck, Tag, Layers, PencilLine } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";

  type ScoreKey = "title" | "tags" | "images" | "video" | "description";
  type FeedbackItem = { status: "good" | "warning" | "error"; text: string };
  type ScoreData = { score: number; feedback: { clarity: FeedbackItem[]; seo: FeedbackItem[] } };

  // Response shape per BA spec §4.1 (maps onto the former MOCK_LISTING). `estimatedSales`/
  // `estimatedRevenue` are estimates → EstimatedBadge. The `enrichment` block carries the
  // newer sales-optimization signals (real lifetime views + estimated conversion, handling
  // speed, attribute completeness, variation pricing) — all rendered defensively below.
  type ShippingVerdict = "fast" | "average" | "slow" | "unknown";
  interface ViewsInsight {
    views: number;
    conversionRatePct: number | null;
    note: string | null;
  }
  interface ShippingInsight {
    processingMin: number | null;
    processingMax: number | null;
    verdict: ShippingVerdict;
    label: string;
    note: string;
  }
  interface AttributeCompleteness {
    filledAttributes: string[];
    missingAttributes: string[];
    missingRequired: string[];
    completenessPct: number;
  }
  interface VariationInsight {
    variationCount: number;
    minPrice: string;
    maxPrice: string;
    priceSpread: string;
  }
  interface ListingEnrichment {
    views: ViewsInsight;
    shipping: ShippingInsight | null;
    attributes: AttributeCompleteness | null;
    variations: VariationInsight | null;
  }
  interface ListingResult {
    title: string;
    shop: string;
    price: string;
    rating: number;
    numRatings: number;
    date: string;
    url?: string;
    imageUrl: string | null;
    scores: Record<ScoreKey, ScoreData>;
    stats: {
      estimatedSales: number;
      estimatedRevenue: string;
      faves: number;
    };
    enrichment?: ListingEnrichment;
  }

  let listingInput = $state(page.url.searchParams.get("listing") ?? "");
  let hasSearched = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let notFound = $state(false);
  let expandedScore = $state<ScoreKey | null>(null);
  let listing = $state<ListingResult | null>(null);

  const scoreKeys: ScoreKey[] = ["title", "tags", "images", "video", "description"];
  const cap = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

  // The analyzer response only carries `shop_id` (rendered server-side as "Shop {id}") or "—".
  // We don't have the real shop name here, so rather than show a meaningless "Shop 12345678",
  // we suppress the placeholder and label it as the user's own listing.
  const isShopPlaceholder = (shop: string | undefined): boolean =>
    !shop || shop === "—" || /^Shop\s+\d+$/.test(shop);
  const shopLabel = $derived(
    listing && !isShopPlaceholder(listing.shop) ? listing.shop : "Your listing",
  );

  // "Fix this" hand-offs: a weak section links to the tool that improves it, with context
  // passed as a query param (harmless if the target doesn't read it yet).
  const FIX_TARGETS: Partial<Record<ScoreKey, { label: string; href: string; param: string }>> = {
    title: { label: "Open Title Generator", href: "/tools/title-generator", param: "description" },
    tags: { label: "Open Tag Generator", href: "/tools/tag-generator", param: "keyword" },
    description: { label: "Open Description Generator", href: "/tools/description-generator", param: "description" },
  };
  // A section is "weak" (worth a nudge) below 70 — matches the score-band threshold used below.
  const WEAK_THRESHOLD = 70;
  const fixHref = (key: ScoreKey): string | null => {
    const t = FIX_TARGETS[key];
    if (!t || !listing) return null;
    const ctx = listing.title?.trim();
    return ctx ? `${t.href}?${t.param}=${encodeURIComponent(ctx)}` : t.href;
  };

  // Numeric listing id (from the entered URL/id or the result URL) → "Edit this listing" hand-off.
  // The Editor only loads the seller's OWN listings, so it gracefully rejects a competitor's id.
  const analyzedListingId = $derived.by(() => {
    const src = listing?.url || listingInput;
    const m = src.match(/listing\/(\d+)/i) ?? src.match(/(\d{6,})/);
    return m ? m[1] : null;
  });

  // --- Enrichment (sales-optimization signals) -----------------------------
  const enrich = $derived(listing?.enrichment ?? null);

  // Verdict → color band (reuses the score-band CSS vars used elsewhere in the tool).
  const shippingColor = (v: ShippingVerdict): string =>
    v === "fast" ? "var(--score-high)" : v === "average" ? "var(--score-medium)" : v === "slow" ? "var(--score-low)" : "var(--text-muted)";
  const shippingWord = (v: ShippingVerdict): string =>
    v === "fast" ? "Fast" : v === "average" ? "Average" : v === "slow" ? "Slow" : "Unknown";
  const completenessColor = (pct: number): string =>
    pct >= 70 ? "var(--score-high)" : pct >= 40 ? "var(--score-medium)" : "var(--score-low)";

  const handleSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!listingInput.trim() || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;
    notFound = false;

    const res = await callTool<ListingResult>("listing-analyzer", {
      listing: listingInput.trim(),
    });

    if (res.ok) {
      listing = res.data;
      hasSearched = true;
      await invalidateAll(); // refresh Header credits badge
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else if (res.status === 404) {
      notFound = true;
      listing = null;
      hasSearched = true;
    } else {
      error = res.message;
    }
    loading = false;
  };
</script>

<ToolPageLayout
  title="Listing Optimizer"
  description="Paste a listing and we'll read it the way a buyer's search does — then point out the small fixes that help it get found."
>
  {#snippet controls()}
    <!-- Search -->
    <form onsubmit={handleSearch}>
      <label class="field-label" for="listing-input">Which listing should we look at?</label>
      <div class="field-wrap">
        <span class="field-affix"><Search size={16} /></span>
        <input
          id="listing-input"
          type="text"
          bind:value={listingInput}
          placeholder="e.g. 4511075902"
          class="field"
          data-testid="listing-input"
        />
      </div>
      <p class="field-hint">A full Etsy URL or just the listing ID — either works.</p>
      <button
        type="submit"
        disabled={loading || !listingInput.trim()}
        class="btn btn-primary w-full justify-center mt-4"
        data-testid="listing-submit"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Reading it...{:else}Check it{/if}
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
    <ToolEmpty icon={FileText} title="We couldn't find that listing" hint="Double-check the URL or ID and give it another go — a full Etsy link or just the listing ID both work." />
  {/if}

  {#if loading}
    <div class="animate-fade-in">
      <div class="flex flex-col md:flex-row gap-6">
        <Skeleton height="14rem" width="14rem" rounded="lg" class="flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <Skeleton width="80%" height="1.5rem" class="mb-2" />
          <Skeleton width="6rem" height="1rem" />
          <div class="mt-5 space-y-2.5">
            {#each Array(5) as _, i (i)}
              <Skeleton height="0.75rem" />
            {/each}
          </div>
        </div>
      </div>
      <hr class="rule my-8" />
      <Skeleton height="8rem" rounded="lg" />
    </div>
  {:else if hasSearched && listing}
    <div class="animate-fade-in">
      <!-- Listing Header -->
      <div class="flex flex-col md:flex-row gap-6">
        <!-- Product image (real Etsy photo) -->
        {#if listing.imageUrl}
          <img src={listing.imageUrl} alt={listing.title} loading="lazy" class="w-full md:w-56 h-56 rounded-lg object-cover flex-shrink-0" />
        {:else}
          <div class="w-full md:w-56 h-56 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0">
            <span class="text-text-muted text-xs">No image</span>
          </div>
        {/if}

        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1 leading-snug">
            {listing.title}
          </h2>
          <span class="text-sm text-teal">
            {shopLabel}
          </span>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
            <span class="text-lg font-semibold text-text-primary">
              {listing.price}
            </span>
            <div class="flex items-center gap-1">
              {#each [1, 2, 3, 4, 5] as s}
                <Star
                  size={12}
                  class={s <= listing.rating ? "text-warning fill-warning" : "text-border"}
                />
              {/each}
              <span class="text-xs text-text-muted">
                {listing.rating} ({listing.numRatings})
              </span>
            </div>
            <span class="text-xs text-text-muted">{listing.date}</span>
            {#if listing.url}
              <a
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                class="copy-link"
              >
                <ExternalLink size={11} /> View on Etsy
              </a>
            {/if}
            {#if analyzedListingId}
              <a href="/tools/listing-editor?listing={analyzedListingId}" class="copy-link !text-teal">
                <PencilLine size={11} /> Edit this listing →
              </a>
            {/if}
          </div>

          <!-- Score Summary Bars -->
          <div class="mt-5 space-y-2.5">
            {#each scoreKeys as key}
              <ScoreBar label={cap(key)} score={listing.scores[key].score} />
            {/each}
          </div>
        </div>
      </div>

      <hr class="rule my-8" />

      <!-- Stats Row. Views StatCard removed (PM Q7): Etsy v3 exposes no views for others'
           listings, so we do not fabricate one. Sales/Revenue carry an Estimated badge. -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-5">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="section-kicker">Estimated sales</span>
            <EstimatedBadge method="Projected from review velocity (reviews in the last 90 days) calibrated to this category's review rate. Not Etsy's transaction data." />
          </div>
          <div class="text-2xl font-semibold tracking-tight text-text-primary">{listing.stats.estimatedSales}</div>
          <p class="text-xs text-text-muted mt-0.5">per month</p>
        </div>
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="section-kicker">Estimated revenue</span>
            <EstimatedBadge method="Estimated sales multiplied by the listing's current price. Built from review velocity, not Etsy's real transaction figures." />
          </div>
          <div class="text-2xl font-semibold tracking-tight text-text-primary">{listing.stats.estimatedRevenue}</div>
          <p class="text-xs text-text-muted mt-0.5">per month</p>
        </div>
        <div>
          <span class="section-kicker">Faves</span>
          <div class="text-2xl font-semibold tracking-tight text-text-primary mt-1">{listing.stats.faves}</div>
        </div>
      </div>

      {#if enrich}
        <hr class="rule my-8" />

        <!-- Sales-optimization signals from the listing's richer data -->
        <p class="section-kicker mb-1">Sales optimization</p>
        <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">Signals beyond the copy</h2>
        <p class="lead text-sm mb-5">Traffic, handling speed and catalog attributes — the levers that move ranking and conversion.</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Views + estimated conversion -->
          <div class="panel-tint p-4">
            <div class="flex items-center gap-2 mb-2">
              <Eye size={15} class="text-teal" />
              <span class="section-kicker">Traffic &amp; conversion</span>
            </div>
            <div class="flex items-end gap-6 flex-wrap">
              <div>
                <div class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">
                  {enrich.views.views.toLocaleString()}
                </div>
                <p class="text-xs text-text-muted mt-0.5">lifetime views (real, cumulative)</p>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  {#if enrich.views.conversionRatePct !== null}
                    <span class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{enrich.views.conversionRatePct}%</span>
                    <EstimatedBadge label="Est." method="Estimated monthly sales divided by lifetime (cumulative) views. Views are real and lifetime; sales are estimated from review velocity, so this is a rough order-of-magnitude conversion, not Etsy's true rate." />
                  {:else}
                    <span class="text-sm text-text-muted">Not enough data</span>
                  {/if}
                </div>
                <p class="text-xs text-text-muted mt-0.5">est. monthly conversion</p>
              </div>
            </div>
            {#if enrich.views.note}
              <p class="text-xs text-text-secondary mt-3">{enrich.views.note}</p>
            {/if}
          </div>

          <!-- Shipping / handling speed -->
          {#if enrich.shipping}
            <div class="panel-tint p-4">
              <div class="flex items-center gap-2 mb-2">
                <Truck size={15} class="text-teal" />
                <span class="section-kicker">Handling speed</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-2xl font-semibold tracking-tight tabular-nums" style="color: {shippingColor(enrich.shipping.verdict)}">
                  {shippingWord(enrich.shipping.verdict)}
                </span>
                <span class="text-sm text-text-secondary">{enrich.shipping.label}</span>
              </div>
              <p class="text-xs text-text-secondary mt-3">{enrich.shipping.note}</p>
            </div>
          {/if}

          <!-- Variation / price summary -->
          {#if enrich.variations}
            <div class="panel-tint p-4">
              <div class="flex items-center gap-2 mb-2">
                <Layers size={15} class="text-teal" />
                <span class="section-kicker">Variations &amp; price</span>
              </div>
              <div class="flex items-end gap-6 flex-wrap">
                <div>
                  <div class="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{enrich.variations.variationCount}</div>
                  <p class="text-xs text-text-muted mt-0.5">variations</p>
                </div>
                <div>
                  <div class="text-sm font-semibold text-text-primary">{enrich.variations.minPrice} – {enrich.variations.maxPrice}</div>
                  <p class="text-xs text-text-muted mt-0.5">price range (spread {enrich.variations.priceSpread})</p>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Attribute completeness — the actionable SEO gap -->
        {#if enrich.attributes}
          {@const attr = enrich.attributes}
          <div class="panel-tint p-4 mt-4">
            <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div class="flex items-center gap-2">
                <Tag size={15} class="text-teal" />
                <span class="section-kicker">Attribute completeness</span>
              </div>
              <span class="text-sm font-semibold tabular-nums" style="color: {completenessColor(attr.completenessPct)}">
                {attr.completenessPct}% filled
              </span>
            </div>
            <div class="score-bar mb-3">
              <div class="score-bar-fill" style="width: {attr.completenessPct}%; background: {completenessColor(attr.completenessPct)}"></div>
            </div>

            {#if attr.missingAttributes.length > 0}
              <p class="text-xs text-text-secondary mb-2">
                Filling these category attributes makes your listing eligible for more of Etsy's filters and searches:
              </p>
              <div class="flex flex-wrap gap-2">
                {#each attr.missingAttributes as name, i (name + "-" + i)}
                  <span
                    class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
                    class:border-danger={attr.missingRequired.includes(name)}
                    style="border-color: {attr.missingRequired.includes(name) ? 'var(--danger)' : 'var(--border)'}"
                  >
                    {#if attr.missingRequired.includes(name)}
                      <AlertCircle size={11} class="text-danger" />
                    {:else}
                      <XCircle size={11} class="text-text-muted" />
                    {/if}
                    {name}
                  </span>
                {/each}
              </div>
              {#if attr.missingRequired.length > 0}
                <p class="text-xs text-danger mt-2">Outlined attributes are required by this category — fill them first.</p>
              {/if}
            {:else}
              <p class="flex items-center gap-2 text-xs text-success">
                <CheckCircle size={13} class="text-success" /> Every attribute this category supports is filled. Nice.
              </p>
            {/if}
          </div>
        {/if}
      {/if}

      <hr class="rule my-8" />

      <!-- Detailed Score Sections -->
      <p class="section-kicker mb-1">Where to look next</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">A closer read, section by section</h2>
      <p class="lead text-sm mb-5">Open any line to see what's working and what's worth a tweak.</p>
      <div class="entry-list">
        {#each scoreKeys as key}
          {@const scoreData = listing.scores[key]}
          {@const isExpanded = expandedScore === key}
          {@const label = cap(key)}
          {@const fix = scoreData.score < WEAK_THRESHOLD ? fixHref(key) : null}
          <div class="entry !block !py-0">
            <button
              onclick={() => (expandedScore = isExpanded ? null : key)}
              class="w-full flex items-center justify-between py-4 text-left"
              data-testid="score-toggle-{key}"
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <span class="text-sm font-medium text-text-primary">{label}</span>
                <EstimatedBadge label="Est." method="A rule/AI audit scores the title, tags, images, video and description, then averages them. Not an official Etsy ranking." />
                <div class="flex-1 max-w-md hidden sm:block">
                  <div class="score-bar">
                    <div
                      class="score-bar-fill"
                      style="width: {scoreData.score}%; background: {scoreData.score >= 70 ? 'var(--score-high)' : scoreData.score >= 40 ? 'var(--score-medium)' : 'var(--score-low)'}"
                    ></div>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="text-sm font-semibold tabular-nums"
                  style="color: {scoreData.score >= 70 ? 'var(--score-high)' : scoreData.score >= 40 ? 'var(--score-medium)' : 'var(--score-low)'}"
                >
                  {scoreData.score}/100
                </span>
                {#if isExpanded}<ChevronUp size={16} class="text-text-muted" />{:else}<ChevronDown size={16} class="text-text-muted" />{/if}
              </div>
            </button>

            {#if isExpanded}
              <div class="pb-5 pl-1 animate-fade-in">
                {#if scoreData.feedback.clarity.length > 0}
                  <div class="mb-4">
                    <h4 class="section-kicker mb-2 flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                      Clarity
                    </h4>
                    <ul class="space-y-1.5">
                      {#each scoreData.feedback.clarity as item}
                        <li class="flex items-start gap-2 text-xs text-text-secondary">
                          {#if item.status === "good"}
                            <CheckCircle size={12} class="text-success flex-shrink-0 mt-0.5" />
                          {:else if item.status === "warning"}
                            <AlertCircle size={12} class="text-warning flex-shrink-0 mt-0.5" />
                          {:else}
                            <XCircle size={12} class="text-danger flex-shrink-0 mt-0.5" />
                          {/if}
                          <span>{item.text}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                {#if scoreData.feedback.seo.length > 0}
                  <div>
                    <h4 class="section-kicker mb-2 flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-teal"></span>
                      SEO
                    </h4>
                    <ul class="space-y-1.5">
                      {#each scoreData.feedback.seo as item}
                        <li class="flex items-start gap-2 text-xs text-text-secondary">
                          {#if item.status === "good"}
                            <CheckCircle size={12} class="text-success flex-shrink-0 mt-0.5" />
                          {:else if item.status === "warning"}
                            <AlertCircle size={12} class="text-warning flex-shrink-0 mt-0.5" />
                          {:else}
                            <XCircle size={12} class="text-danger flex-shrink-0 mt-0.5" />
                          {/if}
                          <span>{item.text}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if fix && FIX_TARGETS[key]}
                  <div class="mt-4 panel-tint p-3 flex flex-wrap items-center justify-between gap-2">
                    <p class="text-xs text-text-secondary">This {label.toLowerCase()} could pull more searches.</p>
                    <a href={fix} class="btn btn-primary !py-1.5 !px-3 text-xs inline-flex w-auto" data-testid="fix-{key}">
                      <Wrench size={12} /> {FIX_TARGETS[key]?.label} <ArrowRight size={12} />
                    </a>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if !error && !notFound}
    <ToolEmpty mascot icon={FileText} title="Your listing's read will appear here" hint="Paste a listing on the left and we'll read it the way a buyer's search does — section by section, with the small fixes that help it get found.">
      {#snippet preview()}
        <div class="flex items-start gap-4">
          <div class="w-16 h-16 rounded-lg bg-gradient-to-br from-bg-page to-border shrink-0"></div>
          <div class="flex-1 min-w-0">
            <p class="text-[0.8125rem] font-medium text-text-primary leading-snug">Handmade Ceramic Coffee Mug · Rustic Blue Pottery</p>
            <span class="text-xs text-teal">BlueClayStudio</span>
          </div>
        </div>
        <div class="mt-4 space-y-2.5">
          {#each [{ l: "Title", n: 88 }, { l: "Tags", n: 72 }, { l: "Images", n: 95 }] as ex (ex.l)}
            <ScoreBar label={ex.l} score={ex.n} />
          {/each}
        </div>
      {/snippet}
    </ToolEmpty>
  {/if}
</ToolPageLayout>

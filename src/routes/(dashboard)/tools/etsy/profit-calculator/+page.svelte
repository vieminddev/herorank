<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";

  let country = $state("US");
  let itemPrice = $state("25.00");
  let shippingCharged = $state("5.99");
  let materialCost = $state("8.00");
  let laborCost = $state("5.00");
  let shippingCost = $state("4.50");
  let packagingCost = $state("1.00");
  let etsyAds = $state("0.00");

  const REGIONS = [
    { code: "US", name: "United States (3% + $0.25)", rate: 0.03, fixed: 0.25, currency: "$" },
    { code: "UK", name: "United Kingdom (4% + £0.20)", rate: 0.04, fixed: 0.20, currency: "£" },
    { code: "CA", name: "Canada (3% + $0.25 CAD)", rate: 0.03, fixed: 0.25, currency: "$" },
    { code: "EU", name: "Europe (4% + €0.30)", rate: 0.04, fixed: 0.30, currency: "€" },
    { code: "AU", name: "Australia (3% + $0.25 AUD)", rate: 0.03, fixed: 0.25, currency: "$" }
  ];

  const activeRegion = $derived(REGIONS.find((r) => r.code === country) ?? REGIONS[0]);

  const calculations = $derived.by(() => {
    const price = parseFloat(itemPrice) || 0;
    const shipping = parseFloat(shippingCharged) || 0;
    const material = parseFloat(materialCost) || 0;
    const labor = parseFloat(laborCost) || 0;
    const shipCost = parseFloat(shippingCost) || 0;
    const packaging = parseFloat(packagingCost) || 0;
    const ads = parseFloat(etsyAds) || 0;

    const totalRevenue = price + shipping;
    const listingFee = 0.2;
    const transactionFee = totalRevenue * 0.065;
    const processingFee = totalRevenue * activeRegion.rate + activeRegion.fixed;
    const totalEtsyFees = listingFee + transactionFee + processingFee;
    const totalCosts = material + labor + shipCost + packaging + ads + totalEtsyFees;
    const profit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      totalRevenue: totalRevenue.toFixed(2),
      listingFee: listingFee.toFixed(2),
      transactionFee: transactionFee.toFixed(2),
      processingFee: processingFee.toFixed(2),
      totalEtsyFees: totalEtsyFees.toFixed(2),
      totalCosts: totalCosts.toFixed(2),
      profit: profit.toFixed(2),
      margin: margin.toFixed(1),
    };
  });

  const isProfit = $derived(parseFloat(calculations.profit) >= 0);

  const fields = $derived([
    { label: "Item Price", value: itemPrice, key: "itemPrice" },
    { label: "Shipping Charged to Buyer", value: shippingCharged, key: "shippingCharged" },
    { label: "Material Cost", value: materialCost, key: "materialCost" },
    { label: "Labor Cost", value: laborCost, key: "laborCost" },
    { label: "Shipping Cost", value: shippingCost, key: "shippingCost" },
    { label: "Packaging Cost", value: packagingCost, key: "packagingCost" },
    { label: "Etsy Ads Spend", value: etsyAds, key: "etsyAds" },
  ] as const);

  function setField(key: string, value: string) {
    switch (key) {
      case "itemPrice": itemPrice = value; break;
      case "shippingCharged": shippingCharged = value; break;
      case "materialCost": materialCost = value; break;
      case "laborCost": laborCost = value; break;
      case "shippingCost": shippingCost = value; break;
      case "packagingCost": packagingCost = value; break;
      case "etsyAds": etsyAds = value; break;
    }
  }
</script>

<ToolPageLayout
  title="Profit Calculator"
  prefix="Etsy"
  description="See what you actually keep on a sale. Put in your numbers and we'll work out the fees, the shipping, and your take-home."
>
  {#snippet controls()}
    <!-- Input Section -->
    <p class="section-kicker mb-4">Your numbers</p>
    <div class="space-y-4">
      <div>
        <label for="profit-country" class="field-label">Etsy Payments Country</label>
        <select
          id="profit-country"
          bind:value={country}
          class="field appearance-none cursor-pointer"
        >
          {#each REGIONS as r}
            <option value={r.code}>{r.name}</option>
          {/each}
        </select>
        <p class="field-hint">Etsy Payments processing fees vary depending on your shop's country.</p>
      </div>

      {#each fields as field (field.key)}
        <div>
          <label for={`profit-${field.key}`} class="field-label">
            {field.label}
          </label>
          <div class="field-wrap">
            <span class="field-affix">{activeRegion.currency}</span>
            <input
              id={`profit-${field.key}`}
              type="number"
              step="0.01"
              value={field.value}
              oninput={(e) => setField(field.key, e.currentTarget.value)}
              class="field"
            />
          </div>
        </div>
      {/each}
    </div>
  {/snippet}

  <!-- Results Section -->
  <div>
    <!-- Profit Display -->
    <p class="section-kicker mb-1">What you keep</p>
    <div
      class="text-5xl font-semibold tracking-tight"
      style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}"
    >
      {activeRegion.currency}{calculations.profit}
    </div>
    <p class="lead text-sm mt-2">
      {#if isProfit}
        That's a <span class="font-semibold" style="color: var(--success)">{calculations.margin}% margin</span> after Etsy takes its cut.
      {:else}
        You're <span class="font-semibold" style="color: var(--danger)">in the red</span> here — a {calculations.margin}% margin once the fees land.
      {/if}
    </p>

    <hr class="rule my-8" />

    <!-- Fee Breakdown -->
    <p class="section-kicker mb-4">Where it goes</p>
    <div class="space-y-3">
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Total revenue</span>
        <span class="font-semibold tabular-nums text-success">+{activeRegion.currency}{calculations.totalRevenue}</span>
      </div>
      <hr class="rule" />
      <p class="section-kicker">Etsy's fees</p>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Listing fee (equivalent)</span>
        <span class="tabular-nums text-danger">-{activeRegion.currency}{calculations.listingFee}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Transaction fee (6.5%)</span>
        <span class="tabular-nums text-danger">-{activeRegion.currency}{calculations.transactionFee}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Processing fee ({activeRegion.rate * 100}% + {activeRegion.fixed})</span>
        <span class="tabular-nums text-danger">-{activeRegion.currency}{calculations.processingFee}</span>
      </div>
      <div class="flex justify-between text-sm font-semibold pt-1">
        <span class="text-text-primary">Etsy fees, all in</span>
        <span class="tabular-nums text-danger">-{activeRegion.currency}{calculations.totalEtsyFees}</span>
      </div>
      <hr class="rule" />
      <div class="flex justify-between text-sm font-semibold">
        <span class="text-text-primary">Everything it costs you</span>
        <span class="tabular-nums text-danger">-{activeRegion.currency}{calculations.totalCosts}</span>
      </div>
      <div class="flex justify-between text-base font-semibold pt-1">
        <span class="text-text-primary">Take-home</span>
        <span class="tabular-nums" style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}">
          {activeRegion.currency}{calculations.profit}
        </span>
      </div>
    </div>
  </div>
</ToolPageLayout>

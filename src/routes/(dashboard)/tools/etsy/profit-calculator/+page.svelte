<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";

  let itemPrice = $state("25.00");
  let shippingCharged = $state("5.99");
  let materialCost = $state("8.00");
  let laborCost = $state("5.00");
  let shippingCost = $state("4.50");
  let packagingCost = $state("1.00");
  let etsyAds = $state("0.00");

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
    const processingFee = totalRevenue * 0.03 + 0.25;
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
  description="Know your real profit on every sale. Plug in your costs and Etsy calculates the rest — fees, shipping, and your take-home."
>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Input Section -->
    <div class="card p-6">
      <h3 class="text-base font-bold text-text-primary mb-5">Costs</h3>
      <div class="space-y-4">
        {#each fields as field (field.key)}
          <div>
            <label class="text-xs font-semibold text-text-secondary mb-1 block">
              {field.label}
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
              <input
                type="number"
                step="0.01"
                value={field.value}
                oninput={(e) => setField(field.key, e.currentTarget.value)}
                class="w-full pl-7 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white"
              />
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Results Section -->
    <div class="space-y-4">
      <!-- Profit Display -->
      <div
        class="card p-6 text-center"
        style="background: {isProfit ? 'var(--success-bg)' : 'var(--danger-bg)'}; border-color: {isProfit ? 'var(--success)' : 'var(--danger)'}"
      >
        <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
          Your Profit
        </div>
        <div
          class="text-4xl font-bold"
          style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}"
        >
          ${calculations.profit}
        </div>
        <div
          class="text-sm font-semibold mt-1"
          style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}"
        >
          {calculations.margin}% margin
        </div>
      </div>

      <!-- Fee Breakdown -->
      <div class="card p-6">
        <h3 class="text-base font-bold text-text-primary mb-4">
          Breakdown
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-text-secondary">Total Revenue</span>
            <span class="font-semibold text-success">+${calculations.totalRevenue}</span>
          </div>
          <hr class="border-border-light" />
          <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
            Etsy Fees
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-text-secondary">Listing Fee</span>
            <span class="text-danger">-${calculations.listingFee}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-text-secondary">Transaction Fee (6.5%)</span>
            <span class="text-danger">-${calculations.transactionFee}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-text-secondary">Processing Fee (3% + $0.25)</span>
            <span class="text-danger">-${calculations.processingFee}</span>
          </div>
          <div class="flex justify-between text-sm font-semibold border-t border-border-light pt-2">
            <span class="text-text-primary">Total Etsy Fees</span>
            <span class="text-danger">-${calculations.totalEtsyFees}</span>
          </div>
          <hr class="border-border-light" />
          <div class="flex justify-between text-sm font-semibold">
            <span class="text-text-primary">Total Costs</span>
            <span class="text-danger">-${calculations.totalCosts}</span>
          </div>
          <div class="flex justify-between text-base font-bold border-t border-border pt-3">
            <span class="text-text-primary">Net Profit</span>
            <span style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}">
              ${calculations.profit}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</ToolPageLayout>

<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Calculator, Download, Copy, Check } from "lucide-svelte";

  // --- Fee schedules (per region) ------------------------------------------
  // Payment processing varies by Etsy Payments country. Regulatory operating
  // fee is charged on item + shipping in a handful of regions. Offsite Ads is
  // auto-charged on the whole order total when a sale comes from Etsy's ads.
  type Region = {
    code: string;
    name: string;
    currency: string;
    rate: number; // processing % (decimal)
    fixed: number; // processing fixed fee
    regOpFee: number; // regulatory operating fee % (decimal) on item + shipping
    regOpLabel: string;
  };

  const REGIONS: Region[] = [
    { code: "US", name: "United States", currency: "$", rate: 0.03, fixed: 0.25, regOpFee: 0, regOpLabel: "" },
    { code: "UK", name: "United Kingdom", currency: "£", rate: 0.04, fixed: 0.2, regOpFee: 0.0032, regOpLabel: "UK 0.32%" },
    { code: "DE", name: "Germany", currency: "€", rate: 0.04, fixed: 0.3, regOpFee: 0.0042, regOpLabel: "DE 0.42%" },
    { code: "FR", name: "France", currency: "€", rate: 0.04, fixed: 0.3, regOpFee: 0.004, regOpLabel: "FR 0.40%" },
    { code: "IT", name: "Italy", currency: "€", rate: 0.04, fixed: 0.3, regOpFee: 0.0009, regOpLabel: "IT 0.09%" },
    { code: "ES", name: "Spain", currency: "€", rate: 0.04, fixed: 0.3, regOpFee: 0.004, regOpLabel: "ES 0.40%" },
    { code: "CA", name: "Canada", currency: "$", rate: 0.03, fixed: 0.25, regOpFee: 0, regOpLabel: "" },
    { code: "AU", name: "Australia", currency: "$", rate: 0.03, fixed: 0.25, regOpFee: 0, regOpLabel: "" },
  ];

  const TRANSACTION_RATE = 0.065; // Etsy transaction fee
  const LISTING_FEE = 0.2; // per listing (per quantity slot Etsy charges, kept per-listing here)

  let country = $state("US");
  let itemPrice = $state("25.00");
  let shippingCharged = $state("5.99");
  let quantity = $state("1");
  let materialCost = $state("8.00");
  let laborCost = $state("5.00");
  let shippingCost = $state("4.50");
  let packagingCost = $state("1.00");
  let otherCost = $state("0.00");

  // Offsite Ads
  let fromOffsiteAds = $state(false);
  let offsiteHighRevenue = $state(false); // ≥ $10k/yr → 12%, else 15%

  // Reverse helper
  let targetMargin = $state("30");

  let copied = $state(false);

  const activeRegion = $derived(REGIONS.find((r) => r.code === country) ?? REGIONS[0]);
  const cur = $derived(activeRegion.currency);
  const offsiteRate = $derived(offsiteHighRevenue ? 0.12 : 0.15);

  const fmt = (n: number) => `${cur}${n.toFixed(2)}`;

  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  // Has the user actually entered anything meaningful?
  const hasInput = $derived(num(itemPrice) > 0 || num(shippingCharged) > 0);

  const calc = $derived.by(() => {
    const qty = Math.max(1, Math.floor(num(quantity)) || 1);
    const price = num(itemPrice);
    const shipping = num(shippingCharged);

    // Revenue (per order = price * qty + shipping charged once per order)
    const itemRevenue = price * qty;
    const totalRevenue = itemRevenue + shipping;
    const feeBase = itemRevenue + shipping; // item + shipping

    // --- Etsy fees ---
    const listingFee = LISTING_FEE; // per listing (once per order here)
    const transactionFee = feeBase * TRANSACTION_RATE;
    const processingFee = totalRevenue * activeRegion.rate + activeRegion.fixed;
    const regOpFee = feeBase * activeRegion.regOpFee;
    const offsiteFee = fromOffsiteAds ? feeBase * offsiteRate : 0;
    const totalEtsyFees = listingFee + transactionFee + processingFee + regOpFee + offsiteFee;

    // --- Your costs (material/labor/packaging scale with quantity) ---
    const material = num(materialCost) * qty;
    const labor = num(laborCost) * qty;
    const packaging = num(packagingCost) * qty;
    const shipCost = num(shippingCost); // shipping cost is per order
    const other = num(otherCost);
    const productCosts = material + labor + packaging + shipCost + other;

    const totalCosts = productCosts + totalEtsyFees;
    const profit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      qty,
      totalRevenue,
      itemRevenue,
      listingFee,
      transactionFee,
      processingFee,
      regOpFee,
      offsiteFee,
      totalEtsyFees,
      material,
      labor,
      packaging,
      shipCost,
      other,
      productCosts,
      totalCosts,
      profit,
      margin,
    };
  });

  const isProfit = $derived(calc.profit >= 0);

  // --- Reverse: price needed to hit a target margin ------------------------
  // margin = profit / revenue. Solve for item price so that after all
  // percentage + fixed fees and fixed costs, margin = target.
  const suggestedPrice = $derived.by(() => {
    const target = num(targetMargin) / 100;
    if (target >= 1) return null;
    const qty = calc.qty;
    const shipping = num(shippingCharged);
    // Fixed costs (everything not depending on item price):
    const fixedCosts =
      num(materialCost) * qty +
      num(laborCost) * qty +
      num(packagingCost) * qty +
      num(shippingCost) +
      num(otherCost) +
      LISTING_FEE +
      activeRegion.fixed; // processing fixed component

    // Percentage fee rate applied to revenue (item*qty + shipping):
    const pctRate =
      TRANSACTION_RATE +
      activeRegion.rate +
      activeRegion.regOpFee +
      (fromOffsiteAds ? offsiteRate : 0);

    // revenue = item*qty + shipping. Let P = item price.
    // profit = revenue - revenue*pctRate - fixedCosts
    // margin = profit / revenue  =>  revenue*(1 - pctRate) - fixedCosts = target*revenue
    // revenue*(1 - pctRate - target) = fixedCosts
    const denom = 1 - pctRate - target;
    if (denom <= 0) return null;
    const revenue = fixedCosts / denom;
    const itemTotal = revenue - shipping;
    if (itemTotal <= 0) return null;
    return itemTotal / qty; // per-item price
  });

  // --- Breakdown rows (for table + export) ---------------------------------
  type Row = { label: string; amount: number; kind: "rev" | "fee" | "cost" | "total" };
  const breakdown = $derived.by<Row[]>(() => {
    const rows: Row[] = [
      { label: "Item revenue", amount: calc.itemRevenue, kind: "rev" },
      { label: "Shipping charged", amount: num(shippingCharged), kind: "rev" },
      { label: "Listing fee", amount: -calc.listingFee, kind: "fee" },
      { label: `Transaction fee (${(TRANSACTION_RATE * 100).toFixed(1)}%)`, amount: -calc.transactionFee, kind: "fee" },
      {
        label: `Payment processing (${(activeRegion.rate * 100).toFixed(0)}% + ${cur}${activeRegion.fixed.toFixed(2)})`,
        amount: -calc.processingFee,
        kind: "fee",
      },
    ];
    if (activeRegion.regOpFee > 0) {
      rows.push({ label: `Regulatory operating fee (${activeRegion.regOpLabel})`, amount: -calc.regOpFee, kind: "fee" });
    }
    if (fromOffsiteAds) {
      rows.push({ label: `Offsite Ads fee (${(offsiteRate * 100).toFixed(0)}%)`, amount: -calc.offsiteFee, kind: "fee" });
    }
    rows.push(
      { label: "Materials", amount: -calc.material, kind: "cost" },
      { label: "Labor", amount: -calc.labor, kind: "cost" },
      { label: "Packaging", amount: -calc.packaging, kind: "cost" },
      { label: "Shipping cost", amount: -calc.shipCost, kind: "cost" },
    );
    if (calc.other > 0) rows.push({ label: "Other costs", amount: -calc.other, kind: "cost" });
    return rows;
  });

  const moneyFields = $derived([
    { label: "Item Price (each)", key: "itemPrice", value: itemPrice },
    { label: "Shipping Charged to Buyer", key: "shippingCharged", value: shippingCharged },
    { label: "Material Cost (each)", key: "materialCost", value: materialCost },
    { label: "Labor Cost (each)", key: "laborCost", value: laborCost },
    { label: "Packaging Cost (each)", key: "packagingCost", value: packagingCost },
    { label: "Shipping Cost (per order)", key: "shippingCost", value: shippingCost },
    { label: "Other Costs (per order)", key: "otherCost", value: otherCost },
  ] as const);

  function setField(key: string, value: string) {
    switch (key) {
      case "itemPrice": itemPrice = value; break;
      case "shippingCharged": shippingCharged = value; break;
      case "materialCost": materialCost = value; break;
      case "laborCost": laborCost = value; break;
      case "packagingCost": packagingCost = value; break;
      case "shippingCost": shippingCost = value; break;
      case "otherCost": otherCost = value; break;
    }
  }

  // --- Export / copy --------------------------------------------------------
  function downloadCsv() {
    const lines: string[][] = [["Line item", "Amount", "Currency", "Type"]];
    lines.push(["Total revenue", calc.totalRevenue.toFixed(2), cur, "revenue"]);
    for (const r of breakdown) {
      lines.push([r.label, r.amount.toFixed(2), cur, r.kind]);
    }
    lines.push(["Total Etsy fees", (-calc.totalEtsyFees).toFixed(2), cur, "fees"]);
    lines.push(["Total costs", (-calc.totalCosts).toFixed(2), cur, "costs"]);
    lines.push(["Take-home profit", calc.profit.toFixed(2), cur, "profit"]);
    lines.push(["Margin %", calc.margin.toFixed(1), "", "margin"]);

    const csv = lines
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "etsy-profit-breakdown.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    const lines = [
      `Etsy Profit Breakdown (${activeRegion.name})`,
      `Quantity: ${calc.qty}`,
      `Total revenue: ${fmt(calc.totalRevenue)}`,
      `Etsy fees: -${fmt(calc.totalEtsyFees)}`,
      `Your costs: -${fmt(calc.productCosts)}`,
      `Take-home: ${fmt(calc.profit)} (${calc.margin.toFixed(1)}% margin)`,
    ];
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
  title="Profit Calculator"
  icon={Calculator}
  description="See what you actually keep on a sale. We work out every Etsy fee — including Offsite Ads and regional regulatory fees — so the number is honest."
>
  {#snippet controls()}
    <p class="section-kicker mb-4">Your numbers</p>
    <div class="space-y-4">
      <div>
        <label for="profit-country" class="field-label">Etsy Payments Country</label>
        <select id="profit-country" bind:value={country} class="field appearance-none cursor-pointer">
          {#each REGIONS as r (r.code)}
            <option value={r.code}>{r.name} ({r.currency})</option>
          {/each}
        </select>
        <p class="field-hint">Sets the processing-fee schedule, currency symbol and regulatory fee.</p>
      </div>

      <div>
        <label for="profit-qty" class="field-label">Quantity</label>
        <input
          id="profit-qty"
          type="number"
          min="1"
          step="1"
          value={quantity}
          oninput={(e) => (quantity = e.currentTarget.value)}
          class="field"
        />
        <p class="field-hint">Per-item costs scale with quantity; shipping &amp; listing fee stay per-order.</p>
      </div>

      {#each moneyFields as field (field.key)}
        <div>
          <label for={`profit-${field.key}`} class="field-label">{field.label}</label>
          <div class="field-wrap">
            <span class="field-affix">{cur}</span>
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

      <!-- Offsite Ads -->
      <div class="panel-tint p-3.5">
        <label class="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" bind:checked={fromOffsiteAds} class="mt-0.5" />
          <span>
            <span class="field-label !mb-0.5">Order came from Offsite Ads</span>
            <span class="field-hint !mt-0">Etsy auto-charges this fee on item + shipping when a sale comes from its ads.</span>
          </span>
        </label>
        {#if fromOffsiteAds}
          <label for="offsite-rate" class="field-label mt-3">Your shop's fee tier</label>
          <select id="offsite-rate" bind:value={offsiteHighRevenue} class="field appearance-none cursor-pointer">
            <option value={false}>15% — under {cur}10k in the last 12 months</option>
            <option value={true}>12% — {cur}10k+ in the last 12 months</option>
          </select>
        {/if}
      </div>
    </div>
  {/snippet}

  <!-- Results -->
  {#if !hasInput}
    <div class="panel-tint p-8 text-center animate-fade-in">
      <Calculator size={28} class="mx-auto text-text-muted mb-3" />
      <p class="text-sm font-medium text-text-primary">Enter a price to see your take-home</p>
      <p class="lead text-sm mt-1">Fill in your item price and costs on the left. We'll break down every Etsy fee and show what you actually keep.</p>
    </div>
  {:else}
    <div class="animate-fade-in">
      <!-- Headline profit -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="section-kicker mb-1">What you keep</p>
          <div
            class="text-5xl font-semibold tracking-tight tabular-nums"
            style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}"
          >
            {fmt(calc.profit)}
          </div>
          <p class="lead text-sm mt-2">
            {#if isProfit}
              That's a <span class="font-semibold" style="color: var(--orange)">{calc.margin.toFixed(1)}% margin</span> after Etsy takes its cut{calc.qty > 1 ? ` on ${calc.qty} items` : ""}.
            {:else}
              You're <span class="font-semibold" style="color: var(--danger)">in the red</span> here — a {calc.margin.toFixed(1)}% margin once the fees land.
            {/if}
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button type="button" onclick={copySummary} class="btn btn-ghost gap-1.5">
            {#if copied}<Check size={14} class="text-success" /> Copied{:else}<Copy size={14} /> Copy{/if}
          </button>
          <button type="button" onclick={downloadCsv} class="btn btn-ghost gap-1.5">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <hr class="rule my-8" />

      <!-- Breakdown table -->
      <p class="section-kicker mb-3">Where it goes</p>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Line item</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-text-primary font-medium">Total revenue</td>
              <td class="text-right tabular-nums font-semibold text-success">+{fmt(calc.totalRevenue)}</td>
            </tr>
            {#each breakdown as row (row.label)}
              <tr>
                <td class="text-text-secondary">{row.label}</td>
                <td class="text-right tabular-nums {row.amount < 0 ? 'text-danger' : 'text-success'}">
                  {row.amount < 0 ? "−" : "+"}{cur}{Math.abs(row.amount).toFixed(2)}
                </td>
              </tr>
            {/each}
            <tr>
              <td class="text-text-primary font-medium">Etsy fees, all in</td>
              <td class="text-right tabular-nums font-semibold text-danger">−{fmt(calc.totalEtsyFees)}</td>
            </tr>
            <tr>
              <td class="text-text-primary font-medium">Everything it costs you</td>
              <td class="text-right tabular-nums font-semibold text-danger">−{fmt(calc.totalCosts)}</td>
            </tr>
            <tr>
              <td class="text-text-primary font-semibold">Take-home</td>
              <td
                class="text-right tabular-nums font-semibold"
                style="color: {isProfit ? 'var(--success)' : 'var(--danger)'}"
              >
                {fmt(calc.profit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr class="rule my-8" />

      <!-- Reverse helper -->
      <div class="card-accent-gold card p-4">
        <p class="section-kicker mb-2">Price for a target margin</p>
        <div class="flex items-end gap-3 flex-wrap">
          <div>
            <label for="target-margin" class="field-label">Target margin %</label>
            <div class="field-wrap" style="max-width: 120px">
              <input
                id="target-margin"
                type="number"
                min="0"
                max="95"
                step="1"
                value={targetMargin}
                oninput={(e) => (targetMargin = e.currentTarget.value)}
                class="field"
              />
            </div>
          </div>
          <div class="flex-1 min-w-[180px]">
            {#if suggestedPrice !== null}
              <p class="text-sm text-text-secondary">Suggested item price (each)</p>
              <p class="text-2xl font-semibold tabular-nums" style="color: var(--orange)">{fmt(suggestedPrice)}</p>
            {:else}
              <p class="text-sm text-text-muted">That margin isn't reachable with these fixed costs — lower the target or your costs.</p>
            {/if}
          </div>
        </div>
        <p class="field-hint mt-2">Covers all fees and your current costs at the chosen quantity. Honest break-even-plus pricing.</p>
      </div>
    </div>
  {/if}
</ToolPageLayout>

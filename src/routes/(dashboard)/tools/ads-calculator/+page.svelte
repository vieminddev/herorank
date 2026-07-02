<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Megaphone } from "lucide-svelte";

  let adSpend = $state("50.00");
  let cpc = $state("0.30");
  let convRate = $state("2.5");
  let aov = $state("28.00");
  let margin = $state("35");

  const calc = $derived.by(() => {
    const spend = parseFloat(adSpend) || 0;
    const costPerClick = parseFloat(cpc) || 0;
    const cr = (parseFloat(convRate) || 0) / 100;
    const orderValue = parseFloat(aov) || 0;
    const m = (parseFloat(margin) || 0) / 100;

    const clicks = costPerClick > 0 ? spend / costPerClick : 0;
    const orders = clicks * cr;
    const revenue = orders * orderValue;
    const roas = spend > 0 ? revenue / spend : 0;
    const acos = revenue > 0 ? (spend / revenue) * 100 : 0;
    const cpo = orders > 0 ? spend / orders : 0;
    const grossProfit = revenue * m;
    const netProfit = grossProfit - spend;
    const breakevenAcos = m * 100;

    return {
      clicks: clicks.toFixed(0),
      orders: orders.toFixed(1),
      revenue: revenue.toFixed(2),
      roas: roas.toFixed(2),
      acos: acos.toFixed(1),
      cpo: cpo.toFixed(2),
      netProfit,
      breakevenAcos: breakevenAcos.toFixed(0),
      profitable: netProfit >= 0,
      hasData: revenue > 0,
    };
  });

  const fields = $derived([
    { label: "Ad spend", key: "adSpend", value: adSpend, affix: "$", step: "0.01" },
    { label: "Average cost per click (CPC)", key: "cpc", value: cpc, affix: "$", step: "0.01" },
    { label: "Conversion rate", key: "convRate", value: convRate, affix: "%", step: "0.1" },
    { label: "Average order value", key: "aov", value: aov, affix: "$", step: "0.01" },
    { label: "Profit margin per order (before ads)", key: "margin", value: margin, affix: "%", step: "1" },
  ] as const);

  // Money formatter that keeps the minus sign outside the $ ("-$9.17", not "$-9.17").
  const money = (n: number) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);

  function setField(key: string, value: string) {
    switch (key) {
      case "adSpend": adSpend = value; break;
      case "cpc": cpc = value; break;
      case "convRate": convRate = value; break;
      case "aov": aov = value; break;
      case "margin": margin = value; break;
    }
  }
</script>

<ToolPageLayout
  title="Etsy Ads ROI Calculator"
  icon={Megaphone}
  description="Before you raise that ad budget, see where it lands. Put in your numbers and we'll work out your return, your cost per order, and whether the ads actually pay for themselves."
>
  {#snippet controls()}
    <p class="section-kicker mb-4">Your numbers</p>
    <div class="space-y-4">
      {#each fields as field (field.key)}
        <div>
          <label for={`ads-${field.key}`} class="field-label">{field.label}</label>
          <div class="field-wrap">
            <span class="field-affix">{field.affix}</span>
            <input
              id={`ads-${field.key}`}
              type="number"
              step={field.step}
              value={field.value}
              oninput={(e) => setField(field.key, e.currentTarget.value)}
              class="field"
            />
          </div>
        </div>
      {/each}
    </div>
  {/snippet}

  <div>
    <p class="section-kicker mb-1">Return on ad spend</p>
    <div
      class="text-5xl font-semibold tracking-tight"
      style="color: {calc.profitable ? 'var(--success)' : 'var(--danger)'}"
    >
      {calc.roas}×
    </div>
    <p class="lead text-sm mt-2">
      {#if !calc.hasData}
        Fill in your numbers on the left to see the return.
      {:else if calc.profitable}
        Every $1 on ads brings back <span class="font-semibold" style="color: var(--success)">${calc.roas}</span> in sales — and you keep <span class="font-semibold" style="color: var(--success)">{money(calc.netProfit)}</span> after the spend.
      {:else}
        You're spending more than these ads return — <span class="font-semibold" style="color: var(--danger)">{money(calc.netProfit)}</span> once the product margin is in.
      {/if}
    </p>

    <hr class="rule my-8" />

    <p class="section-kicker mb-4">The breakdown</p>
    <div class="space-y-3">
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Clicks you'll buy</span>
        <span class="font-semibold tabular-nums text-text-primary">{calc.clicks}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Orders (est.)</span>
        <span class="font-semibold tabular-nums text-text-primary">{calc.orders}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Sales revenue</span>
        <span class="font-semibold tabular-nums text-success">+${calc.revenue}</span>
      </div>
      <hr class="rule" />
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Cost per order</span>
        <span class="tabular-nums text-text-primary">${calc.cpo}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">ACOS (ad cost ÷ revenue)</span>
        <span
          class="tabular-nums"
          style="color: {parseFloat(calc.acos) <= parseFloat(calc.breakevenAcos) ? 'var(--success)' : 'var(--danger)'}"
        >{calc.acos}%</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-text-secondary">Break-even ACOS (your margin)</span>
        <span class="tabular-nums text-text-muted">{calc.breakevenAcos}%</span>
      </div>
      <hr class="rule" />
      <div class="flex justify-between text-base font-semibold pt-1">
        <span class="text-text-primary">Net profit after ads</span>
        <span
          class="tabular-nums"
          style="color: {calc.profitable ? 'var(--success)' : 'var(--danger)'}"
        >{money(calc.netProfit)}</span>
      </div>
    </div>

    <p class="field-hint mt-6">
      Rule of thumb: ads pay off while your ACOS stays below your profit margin. Above it, each sale costs you money.
    </p>
  </div>
</ToolPageLayout>

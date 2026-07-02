<script lang="ts">
  import { Sprout, Check, X, BadgeCheck, Search, ArrowRight, ChevronRight, HelpCircle } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { useSession } from "$lib/auth-client";
  import MarketingNav from "$lib/components/marketing/MarketingNav.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";


  type BillingPeriod = "monthly" | "yearly";
  type PlanSlug = "side" | "business" | "enterprise";

  const session = useSession();
  const loggedIn = $derived(!!$session.data?.user);

  const PLANS: Array<{
    name: string;
    slug: PlanSlug;
    monthlyPrice: number;
    yearlyPrice: number;
    yearlyBilled: number;
    description: string;
    creditExample: string;
    features: string[];
    popular: boolean;
  }> = [
    {
      name: "Side Hustle",
      slug: "side",
      monthlyPrice: 7.99,
      yearlyPrice: 5.99,
      yearlyBilled: 71.88,
      description: "Perfect for hobbyists and sellers just getting started.",
      creditExample: "≈ 6 AI videos or 60 images / month",
      features: ["Unlimited research & SEO tools", "300 media credits / mo", "3 linked shops", "10 tracked listings", "Etsy Trends, Niche Finder & VieRank Assistant"],
      popular: false,
    },
    {
      name: "Business",
      slug: "business",
      monthlyPrice: 12.99,
      yearlyPrice: 9.99,
      yearlyBilled: 119.88,
      description: "For growing shops that need more power and flexibility.",
      creditExample: "≈ 10 AI videos or 100 images / month",
      features: ["Unlimited research & SEO tools", "500 media credits / mo", "10 linked shops", "50 tracked listings", "Best value for growing shops"],
      popular: true,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      monthlyPrice: 49.99,
      yearlyPrice: 29.99,
      yearlyBilled: 359.88,
      description: "For teams and power sellers who need maximum capacity.",
      creditExample: "≈ 30 AI videos or 300 images / month",
      features: ["Unlimited research & SEO tools", "1,500 media credits / mo", "25 linked shops", "200 tracked listings", "Built for agencies & multi-shop sellers"],
      popular: false,
    },
  ];

  // Pricing model: research/SEO tools are UNLIMITED (free) on every plan; credits are a MEDIA
  // pool spent only on AI media + the heavy Deep Analysis. Capacity rows first, then the
  // unlimited toolset, then the metered (credit-using) tools.
  const COMPARISON = [
    { feature: "Unlimited research & SEO tools", free: true, side: true, business: true, enterprise: true },
    { feature: "Media credits / month", free: "50 (once)", side: "300", business: "500", enterprise: "1,500" },
    { feature: "→ AI videos (50 cr each)", free: "1", side: "6", business: "10", enterprise: "30" },
    { feature: "→ or AI images (5 cr each)", free: "10", side: "60", business: "100", enterprise: "300" },
    { feature: "Linked Shops", free: "1", side: "3", business: "10", enterprise: "25" },
    { feature: "Rank Tracker (daily, auto-charted)", free: false, side: true, business: true, enterprise: true },
    { feature: "Tracked Listings (Daily)", free: "0", side: "10", business: "50", enterprise: "200" },
    // Unlimited on every plan ↓
    { feature: "Keyword Finder", free: true, side: true, business: true, enterprise: true },
    { feature: "Tag & Title Generators", free: true, side: true, business: true, enterprise: true },
    { feature: "Description Writer", free: true, side: true, business: true, enterprise: true },
    { feature: "Listing Optimizer", free: true, side: true, business: true, enterprise: true },
    { feature: "Competitor Research", free: true, side: true, business: true, enterprise: true },
    { feature: "Reputation Check", free: true, side: true, business: true, enterprise: true },
    { feature: "Search Position (one-off)", free: true, side: true, business: true, enterprise: true },
    { feature: "Etsy Trends · Niche Finder · Best Sellers", free: true, side: true, business: true, enterprise: true },
    { feature: "VieRank Assistant", free: true, side: true, business: true, enterprise: true },
    { feature: "Listing Editor & Builder (write to Etsy)", free: true, side: true, business: true, enterprise: true },
    { feature: "Review Requests", free: true, side: true, business: true, enterprise: true },
    { feature: "Profit & Ads calculators", free: true, side: true, business: true, enterprise: true },
    { feature: "Video Maker (slideshow, in-browser)", free: "Free", side: "Free", business: "Free", enterprise: "Free" },
    // Uses media credits ↓
    { feature: "AI Image Studio", free: "5 cr/img", side: "5 cr/img", business: "5 cr/img", enterprise: "5 cr/img" },
    { feature: "AI Video Studio", free: "50 cr", side: "50 cr", business: "50 cr", enterprise: "50 cr" },
    { feature: "Deep Competitor Analysis", free: "8 cr", side: "8 cr", business: "8 cr", enterprise: "8 cr" },
    { feature: "Support", free: true, side: true, business: true, enterprise: true },
  ];

  const FAQS = [
    { q: "Can I change plans anytime?", a: "Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect immediately for upgrades, or at the end of your billing period for downgrades and cancellations." },
    { q: "What are credits used for?", a: "Credits are only spent on AI media — image and video generation — and the heavy Deep Competitor Analysis. Everything else (keyword, tag, title & description tools, listing audits, competitor & trend research, the VieRank Assistant, writing to Etsy) is unlimited on every plan. Your media credits refresh each billing cycle; upgrade any time for more and it takes effect immediately." },
    { q: "Is there a free trial?", a: "Yes! Every new account gets unlimited research & SEO tools free, plus 50 media credits to try AI images and video — no credit card required." },
    { q: "What payment methods do you accept?", a: "We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment processor, Stripe. Your payment information is never stored on our servers." },
    { q: "Can I get a refund?", a: "We want you to love using VieRank. Because our tools provide instant access to premium data and resources, subscriptions are generally non-refundable. However, if you experience an issue, please reach out within the first 7 days." },
  ];

  let billing = $state<BillingPeriod>("yearly");
  let faqSearch = $state("");
  let openFaqIndex = $state<number | null>(null);

  // Which plan's button is mid-request (for spinner/disable) + a shared error message.
  let pendingPlan = $state<PlanSlug | null>(null);
  let checkoutError = $state<string | null>(null);

  const filteredFaqs = $derived(
    FAQS.filter(faq =>
      faq.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      faq.a.toLowerCase().includes(faqSearch.toLowerCase())
    )
  );

  function toggleFaq(index: number) {
    openFaqIndex = openFaqIndex === index ? null : index;
  }

  async function selectPlan(slug: PlanSlug) {
    checkoutError = null;

    // Not logged in → send them to sign up first (they checkout after auth).
    if (!$session.data?.user) {
      await goto("/auth/signup");
      return;
    }

    if (pendingPlan) return;
    pendingPlan = slug;
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: slug, period: billing }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        checkoutError = body?.message ?? "Could not start checkout. Please try again.";
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      if (url) {
        window.location.href = url;
      } else {
        checkoutError = "Checkout did not return a redirect URL.";
      }
    } catch {
      checkoutError = "Network error starting checkout. Please try again.";
    } finally {
      pendingPlan = null;
    }
  }
</script>

<svelte:head>
  <title>Pricing Plans — VieRank</title>
  <meta name="description" content="Simple, honest pricing for Etsy listing optimization. Free plan available, no credit card required." />
</svelte:head>

<div class="lp min-h-screen bg-white text-text-primary overflow-hidden">
  <!-- Navigation Header -->
  <MarketingNav {loggedIn} current="pricing" />

  <!-- Header Banner with Glow Blocks -->
  <section class="relative overflow-hidden pt-24 pb-20" style="background: var(--teal-dark)">
    <div class="absolute inset-0 grid-overlay opacity-[0.4]" aria-hidden="true"></div>
    <div class="absolute inset-0 opacity-[0.04]" style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 30px 30px;" aria-hidden="true"></div>
    <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20 blur-[120px]" style="background: var(--orange)" aria-hidden="true"></div>
    <div class="absolute top-20 -left-40 w-96 h-96 rounded-full opacity-35 blur-[120px]" style="background: var(--teal-light)" aria-hidden="true"></div>
    <div class="lp-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[130px]" style="background: radial-gradient(circle, var(--teal-light), transparent)" aria-hidden="true"></div>

    <div class="relative max-w-4xl mx-auto px-6 text-center text-white">
      <span class="badge-estimated !bg-white/10 !border-white/20 !text-white/95 mb-6 px-3 py-1 inline-flex items-center gap-1.5 rounded-full text-xs font-medium tracking-wide">
        <Sprout size={11} /> Transparent & Flexible Plans
      </span>
      <h1 class="text-4xl md:text-5xl font-bold mb-4 tracking-tight leading-tight">Pricing that grows with you</h1>
      <p class="text-white/80 max-w-xl mx-auto text-base leading-relaxed">
        Unlimited research &amp; SEO tools on every plan — credits are only for AI media. Start free, no credit card required.
      </p>

      <!-- Toggle Monthly/Yearly -->
      <div class="flex items-center justify-center gap-2 mt-8 bg-white/10 border border-white/15 rounded-full p-1.5 w-fit mx-auto backdrop-blur-md">
        <button
          type="button"
          onclick={() => (billing = "monthly")}
          class="px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all {billing === 'monthly' ? 'bg-white text-teal-dark shadow-md' : 'text-white/80 hover:text-white'}"
        >
          Monthly
        </button>
        <button
          type="button"
          onclick={() => (billing = "yearly")}
          class="px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 {billing === 'yearly' ? 'bg-white text-teal-dark shadow-md' : 'text-white/80 hover:text-white'}"
        >
          Yearly <span class="text-[9px] font-bold text-success-light bg-success-bg/15 px-1.5 py-0.5 rounded-full">Save up to 40%</span>
        </button>
      </div>
    </div>
  </section>

  <!-- Pricing Cards Section -->
  <section class="py-20 px-6 max-w-5xl mx-auto relative z-10">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch" id="pricing-cards">
      {#each PLANS as plan (plan.name)}
        <div class="premium-glass p-7 rounded-2xl flex flex-col justify-between hover-lift border transition-all duration-300 {plan.popular ? 'border-2 border-teal relative shadow-xl scale-[1.02] bg-white/85' : 'border-border'}">
          {#if plan.popular}
            <span class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-teal text-white text-[10px] font-bold rounded-full uppercase tracking-wider shadow-sm">Most Popular</span>
          {/if}
          <div>
            <h3 class="text-lg font-bold text-text-primary mb-1">{plan.name}</h3>
            <div class="mb-2 flex items-baseline gap-1">
              {#if billing === "yearly"}
                <span class="text-sm text-text-muted line-through mr-1.5">${plan.monthlyPrice}</span>
              {/if}
              <span class="text-3.5xl font-bold font-mono tracking-tight text-teal">${billing === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}</span>
              <span class="text-xs text-text-secondary">/mo</span>
            </div>
            {#if billing === "yearly"}
              <p class="text-[10px] font-bold text-success bg-success-bg px-2 py-0.5 rounded w-fit mb-3">${plan.yearlyBilled} billed yearly</p>
            {/if}
            <p class="text-[11px] text-text-muted leading-snug mb-2.5 italic">{plan.creditExample}</p>
            <p class="text-xs text-text-secondary leading-relaxed mb-6">{plan.description}</p>
            <ul class="space-y-3 mb-8 border-t border-border-light pt-5">
              {#each plan.features as f (f)}
                <li class="flex items-start gap-2.5 text-xs text-text-primary">
                  <Check size={14} class="text-success shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              {/each}
            </ul>
          </div>
          <button
            onclick={() => selectPlan(plan.slug)}
            disabled={pendingPlan !== null}
            class="btn w-full justify-center text-xs py-2.5 font-bold transition-all disabled:opacity-60 {plan.popular ? 'btn-primary btn-glow shadow-sm' : 'btn-secondary hover-lift'}"
          >
            {pendingPlan === plan.slug ? "Starting..." : `Get ${plan.name}`}
          </button>
        </div>
      {/each}
    </div>
    {#if checkoutError}
      <p class="text-center text-sm font-semibold text-danger mt-6 bg-danger-bg/40 border border-danger-light/20 px-4 py-2 rounded-xl w-fit mx-auto" role="alert">{checkoutError}</p>
    {/if}
    <p class="text-center text-xs text-text-secondary mt-8">
      Not ready to commit? <a href="/auth/signup" class="text-teal font-semibold hover:underline">Start free</a> — unlimited research + 50 media credits. No credit card required.
    </p>
  </section>

  <!-- Detailed Comparison Table with Illustration Graphic -->
  <section class="py-24 px-6 border-t border-border bg-bg-page/40 relative">
    <div class="lp .glow-teal opacity-5" aria-hidden="true"></div>
    <div class="max-w-5xl mx-auto">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <p class="section-kicker mb-2">Detailed Features</p>
        <h2 class="text-3xl font-semibold tracking-tight text-text-primary">Compare plan details</h2>
        <p class="lead text-sm mt-2">VieRank makes SEO accessible for every Etsy seller, not just big shops or big budgets.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1.15fr_minmax(0,0.85fr)] gap-12 items-start">
        <!-- Table on the left -->
        <div class="overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-bg-page border-b border-border text-text-secondary font-semibold">
                <th class="px-4 py-3 min-w-[150px]">Feature</th>
                <th class="text-center px-3 py-3">Free</th>
                <th class="text-center px-3 py-3">Side</th>
                <th class="text-center px-3 py-3 text-teal bg-teal/5 font-bold">Business</th>
                <th class="text-center px-3 py-3">Enterprise</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-light text-[11px]">
              {#each COMPARISON as row (row.feature)}
                <tr class="hover:bg-bg-page/40 transition-colors">
                  <td class="px-4 py-2.5 font-medium text-text-primary">{row.feature}</td>
                  <td class="px-3 py-2.5 text-center">
                    {#if row.free === true}
                      <Check size={14} class="mx-auto text-success" />
                    {:else if row.free === false}
                      <X size={14} class="mx-auto text-text-muted opacity-40" />
                    {:else}
                      <span class="font-mono text-text-secondary">{row.free}</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    {#if row.side === true}
                      <Check size={14} class="mx-auto text-success" />
                    {:else if row.side === false}
                      <X size={14} class="mx-auto text-text-muted opacity-40" />
                    {:else}
                      <span class="font-mono text-text-secondary">{row.side}</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2.5 text-center bg-teal/5">
                    {#if row.business === true}
                      <Check size={14} class="mx-auto text-success font-bold" />
                    {:else if row.business === false}
                      <X size={14} class="mx-auto text-text-muted opacity-40" />
                    {:else}
                      <span class="font-mono text-text-primary font-bold">{row.business}</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    {#if row.enterprise === true}
                      <Check size={14} class="mx-auto text-success" />
                    {:else if row.enterprise === false}
                      <X size={14} class="mx-auto text-text-muted opacity-40" />
                    {:else}
                      <span class="font-mono text-text-secondary">{row.enterprise}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Illustration on the right -->
        <div class="relative group lg:sticky lg:top-24">
          <div class="absolute inset-0 bg-gradient-to-tr from-teal/15 to-orange/5 blur-2xl rounded-2xl" aria-hidden="true"></div>
          <div class="relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg p-2.5 transition-transform duration-300 group-hover:scale-[1.01]">
            <img
              src="/etsy_seo_success.png"
              alt="VieRank Page 1 Rank Etsy SEO success dashboard illustration"
              class="w-full h-auto rounded-xl"
            />
          </div>
          <div class="mt-6 space-y-3 px-2">
            <span class="inline-flex items-center gap-1.5 badge-estimated !bg-teal-light/10 !border-teal-light/25 !text-teal-light text-[10px] font-bold rounded-full">
              <BadgeCheck size={11} /> Etsy Compliant Integration
            </span>
            <h3 class="text-base font-bold text-text-primary leading-snug">Drive Organic Shop Traffic</h3>
            <p class="text-xs text-text-secondary leading-relaxed">
              VieRank follows Etsy's official OAuth v3 integration guidelines. We help you write optimized titles, tags and descriptions that strengthen your listing's SEO — and, when you're ready, push them straight to your shop.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing FAQs Section -->
  <section class="max-w-3xl mx-auto px-6 py-24 border-t border-border">
    <div class="text-center max-w-2xl mx-auto mb-14">
      <p class="section-kicker mb-2">Support</p>
      <h2 class="text-3xl font-semibold tracking-tight text-text-primary">Questions? Answers.</h2>
      <p class="lead text-xs mt-2">Find quick answers regarding shop credits, billing cycles, and refunds.</p>
    </div>

    <!-- FAQ Search Input -->
    <div class="mb-8 max-w-md mx-auto">
      <div class="field-wrap">
        <Search size={16} class="field-affix" />
        <input
          type="text"
          bind:value={faqSearch}
          placeholder="Search questions..."
          class="field"
        />
      </div>
    </div>

    <!-- Accordion lists -->
    <div class="space-y-4">
      {#if filteredFaqs.length > 0}
        {#each filteredFaqs as faq, idx (faq.q)}
          <div class="premium-glass rounded-xl border border-border overflow-hidden transition-all">
            <button
              type="button"
              onclick={() => toggleFaq(idx)}
              class="w-full text-left p-5 font-semibold text-text-primary text-[14px] flex justify-between items-center hover:bg-bg-page/40 transition-colors"
            >
              <span>{faq.q}</span>
              <span class="text-text-muted transition-transform duration-200" style="transform: rotate({openFaqIndex === idx ? '180deg' : '0deg'})">
                <ChevronRight size={18} />
              </span>
            </button>
            
            {#if openFaqIndex === idx}
              <div class="px-5 pb-5 text-xs text-text-secondary leading-relaxed border-t border-border-light pt-3 animate-fade-in bg-white/30">
                {faq.a}
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <div class="text-center py-10 text-text-muted text-xs">
          No matching questions found for "{faqSearch}"
        </div>
      {/if}
    </div>
  </section>

  <!-- pricing page CTA section -->
  <section class="max-w-3xl mx-auto px-6 py-20 text-center relative z-10 border-t border-border">
    <h2 class="text-2xl font-bold tracking-tight text-text-primary mb-3">Ready to grow your shop?</h2>
    <p class="text-xs text-text-secondary mb-6">Honest, data-grounded SEO tools to help your listings get discovered. Start free — no credit card required.</p>
    <a href="/auth/signup" class="btn btn-primary btn-glow font-bold text-xs">
      Create Free Account <ArrowRight size={14} class="ml-1" />
    </a>
  </section>

  <!-- Footer -->
  <MarketingFooter />
</div>

<script lang="ts">
  import { Sprout, ArrowRight, ShieldCheck, TrendingUp, Search, Activity, BarChart3, LineChart } from "lucide-svelte";
  import MarketingNav from "$lib/components/marketing/MarketingNav.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";


  // Each section explains ONE estimate honestly + plainly: what data feeds it,
  // what model turns that data into a number, and — just as importantly — what it is NOT.
  const METHODS: Array<{
    icon: typeof Sprout;
    title: string;
    isReal?: boolean; // mark the one figure that is real, not estimated
    data: string;
    model: string;
    not: string;
  }> = [
    {
      icon: BarChart3,
      title: "Sales & revenue",
      data: "Reviews left on a listing in the trailing 90 days (its review velocity), the item's current price, and how often buyers in that category tend to leave a review.",
      model: "We take recent review velocity, divide by a category-specific review rate (a calibration of how many buyers review per sale), and multiply by price to project units and revenue.",
      not: "This is NOT Etsy's actual transaction data. Etsy does not publish sales counts, and no third-party tool has access to them. Anyone who shows you an exact sales number is guessing — we just show our work.",
    },
    {
      icon: ShieldCheck,
      title: "SEO score",
      data: "The public, visible parts of a listing: its title, tags, images, video, and description.",
      model: "A rule-based and AI audit scores each element on its own (length, keyword use, completeness, quality signals), then averages those into a single 0-100 score.",
      not: "This is NOT an official Etsy ranking or a promise of placement. It measures how well a listing follows known best practices — the things you control — not Etsy's private ranking algorithm.",
    },
    {
      icon: Search,
      title: "Keyword competition",
      isReal: true,
      data: "The real count of live Etsy listings that match a search term, pulled directly from Etsy's official API.",
      model: "We bucket that live count into a low / medium / high band so it's easy to read at a glance.",
      not: "This one is NOT an estimate — the underlying count is real data from Etsy. The only judgement we add is where the low/medium/high thresholds sit.",
    },
    {
      icon: Activity,
      title: "Demand index",
      data: "Engagement signals sampled from a set of listings for a term — chiefly favorites and how quickly they accumulate.",
      model: "We normalize those signals into a relative 0-100 index so terms can be compared against each other.",
      not: "This is NOT a search-volume number. Etsy does not publish search volume. The demand index is a relative signal — useful for ranking terms against one another, not for reading as 'X searches per month'.",
    },
    {
      icon: LineChart,
      title: "Trend forecast",
      data: "Our own recorded history of weekly demand for a term, built up over time from repeated sampling.",
      model: "We project that recorded history forward to suggest whether interest is rising, flat, or cooling.",
      not: "This is a forecast, NOT a guarantee. It describes a direction based on past weeks; real-world demand can change for reasons no model can see in advance.",
    },
  ];
</script>

<svelte:head>
  <title>How VieRank estimates — in the open. | VieRank</title>
  <meta
    name="description"
    content="VieRank explains exactly how every estimate is calculated — what data feeds it, what model turns it into a number, and what it is not. Honest, transparent Etsy SEO metrics."
  />
</svelte:head>

<div class="lp min-h-screen bg-white text-text-primary overflow-hidden">
  <!-- Navigation Header (same shell as /pricing) -->
  <MarketingNav />

  <!-- Header Banner -->
  <section class="relative overflow-hidden pt-24 pb-20" style="background: var(--teal-dark)">
    <div class="absolute inset-0 grid-overlay opacity-[0.4]" aria-hidden="true"></div>
    <div class="absolute inset-0 opacity-[0.04]" style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 30px 30px;" aria-hidden="true"></div>
    <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20 blur-[120px]" style="background: var(--orange)" aria-hidden="true"></div>
    <div class="absolute top-20 -left-40 w-96 h-96 rounded-full opacity-35 blur-[120px]" style="background: var(--teal-light)" aria-hidden="true"></div>

    <div class="relative max-w-4xl mx-auto px-6 text-center text-white">
      <span class="badge-estimated !bg-white/10 !border-white/20 !text-white/95 mb-6 px-3 py-1 inline-flex items-center gap-1.5 rounded-full text-xs font-medium tracking-wide">
        <ShieldCheck size={11} /> Honest by design
      </span>
      <h1 class="text-4xl md:text-5xl font-bold mb-4 tracking-tight leading-tight">How VieRank estimates — in the open.</h1>
      <p class="text-white/80 max-w-2xl mx-auto text-base leading-relaxed">
        Every estimated number in VieRank comes with a label — and here's why. We'd rather show you our work than hand you a confident-looking figure with no explanation behind it.
      </p>
    </div>
  </section>

  <!-- Why we label estimates -->
  <section class="py-16 px-6 max-w-3xl mx-auto relative z-10">
    <div class="premium-glass rounded-2xl border border-border p-7 md:p-9">
      <p class="section-kicker mb-2">Why we label estimates</p>
      <h2 class="text-2xl font-semibold tracking-tight text-text-primary mb-4">Most tools hide the math. We don't.</h2>
      <p class="text-sm text-text-secondary leading-relaxed mb-3">
        The most common complaint sellers have about Etsy SEO tools is simple: the numbers appear with no explanation. A bold "estimated monthly sales" figure shows up, but nobody tells you where it came from, what it assumes, or how wrong it could be.
      </p>
      <p class="text-sm text-text-secondary leading-relaxed">
        VieRank takes the opposite approach. When a number is an estimate, we say so — with the
        <span class="badge-estimated align-middle"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg> Estimated</span>
        badge — and we explain exactly how it's calculated. Honesty isn't a feature we bolted on. It's the whole point.
      </p>
    </div>
  </section>

  <!-- The methods -->
  <section class="pb-20 px-6 max-w-3xl mx-auto relative z-10">
    <div class="space-y-6">
      {#each METHODS as m (m.title)}
        <article class="premium-glass rounded-2xl border border-border p-7 hover-lift transition-all">
          <div class="flex items-center gap-3 mb-5">
            <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background: var(--success-bg)">
              <m.icon size={18} class="text-teal" />
            </span>
            <h3 class="text-lg font-bold text-text-primary">{m.title}</h3>
            {#if m.isReal}
              <span class="badge-low text-[10px] font-bold rounded-full px-2 py-0.5">Real data</span>
            {:else}
              <span class="badge-estimated text-[10px]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                Estimated
              </span>
            {/if}
          </div>

          <dl class="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
            <dt class="font-semibold text-text-primary">What data</dt>
            <dd class="text-text-secondary leading-relaxed">{m.data}</dd>

            <dt class="font-semibold text-text-primary">What model</dt>
            <dd class="text-text-secondary leading-relaxed">{m.model}</dd>

            <dt class="font-semibold text-text-primary">What it's not</dt>
            <dd class="text-text-secondary leading-relaxed">{m.not}</dd>
          </dl>
        </article>
      {/each}
    </div>
  </section>

  <!-- Closing line + CTA -->
  <section class="max-w-3xl mx-auto px-6 py-20 text-center relative z-10 border-t border-border">
    <TrendingUp size={28} class="text-teal mx-auto mb-4" />
    <h2 class="text-2xl font-bold tracking-tight text-text-primary mb-3">Estimates are honest, or they're noise.</h2>
    <p class="text-sm text-text-secondary max-w-xl mx-auto mb-6 leading-relaxed">
      We'd rather give you a number you can reason about than one you have to take on faith. That's the deal: every estimate, explained — so you always know what you're looking at.
    </p>
    <a href="/auth/signup" class="btn btn-primary btn-glow font-bold text-xs">
      Start free <ArrowRight size={14} class="ml-1" />
    </a>
  </section>

  <!-- Footer (same shell as /pricing) -->
  <MarketingFooter />
</div>

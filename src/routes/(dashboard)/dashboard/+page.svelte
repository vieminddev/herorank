<script lang="ts">
  import { Plug, ArrowRight, Store } from "lucide-svelte";

  let { data }: {
    data: {
      user?: { name?: string };
      credits?: { balance?: number };
      subscription?: { plan?: string; status?: string };
    };
  } = $props();

  const greeting = $derived(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  // Own-shop work first (Create / Optimize), repositioned names + honest copy.
  const tools = [
    { label: "Title Generator", href: "/tools/etsy/title-generator", desc: "SEO-friendly titles for your listings" },
    { label: "Tag Generator", href: "/tools/etsy/tag-generator", desc: "13 ready-to-use tags per listing" },
    { label: "Description Writer", href: "/tools/etsy/description-generator", desc: "Keyword-rich listing descriptions" },
    { label: "Listing Optimizer", href: "/tools/etsy/listing-analyzer", desc: "See what to fix on your listing" },
    { label: "Search Position", href: "/tools/etsy/rank-check", desc: "Track where your listing shows up" },
    { label: "VieRank Assistant", href: "/tools/rankhero-ai", desc: "Ask anything about selling on Etsy" },
  ];

  const isFree = $derived(data.subscription?.plan === "free" || !data.subscription);
</script>

<svelte:head>
  <title>My Shop — VieRank</title>
  <meta name="description" content="Your VieRank dashboard — connect your Etsy shop and optimize your listings." />
</svelte:head>

<div class="max-w-4xl mx-auto">
  <header class="mb-10">
    <p class="section-kicker mb-1">My shop</p>
    <h1 class="text-[1.75rem] font-semibold tracking-tight text-text-primary">
      {greeting()}, {data.user?.name ?? "there"}
    </h1>
    <p class="lead mt-2 max-w-xl">Here's your bench. Connect your shop, then pick a tool and get to work.</p>
  </header>

  <!-- Connect-shop — the primary action. Quiet green band, no gradients. -->
  <section class="rounded-xl px-6 py-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-5"
       style="background: var(--teal-dark)">
    <span class="w-11 h-11 rounded-lg bg-white/12 flex items-center justify-center shrink-0">
      <Store size={20} class="text-white" />
    </span>
    <div class="flex-1">
      <h2 class="text-base font-semibold text-white">Connect your Etsy shop</h2>
      <p class="text-sm text-white/80 mt-1 max-w-xl leading-relaxed">
        Link your shop and the tools start working on your own listings. We only touch listings you own — nothing to copy or paste.
      </p>
    </div>
    <a href="/settings/connections" class="btn !bg-white !text-teal-dark hover:!bg-white/90 text-sm shrink-0">
      <Plug size={16} /> Connect shop
    </a>
  </section>

  <!-- Getting started — momentum, and a no-friction way in -->
  <section class="mb-12">
    <p class="section-kicker mb-1">Getting started</p>
    <h2 class="text-lg font-semibold tracking-tight mb-1">Three steps to your first win</h2>
    <p class="lead text-sm mb-5">No shop needed to start — the Create tools work right now.</p>
    <div class="entry-list">
      <a href="/tools/etsy/title-generator" class="entry group items-center">
        <span class="entry-index">01</span>
        <div class="flex-1 min-w-0">
          <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">Draft a few titles</p>
          <p class="entry-meta mt-0.5">Describe a product and get scored title options — try it without connecting.</p>
        </div>
        <ArrowRight size={16} class="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
      <a href="/settings/connections" class="entry group items-center">
        <span class="entry-index">02</span>
        <div class="flex-1 min-w-0">
          <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">Connect your shop</p>
          <p class="entry-meta mt-0.5">Work on your own listings and see your real shop stats.</p>
        </div>
        <ArrowRight size={16} class="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
      <a href="/tools/etsy/rank-check" class="entry group items-center">
        <span class="entry-index">03</span>
        <div class="flex-1 min-w-0">
          <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">Apply and track</p>
          <p class="entry-meta mt-0.5">Publish what works, then watch your search position over time.</p>
        </div>
        <ArrowRight size={16} class="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    </div>
  </section>

  <!-- Account standing — quiet hairline ledger, no stat cards -->
  <section class="mb-12">
    <hr class="rule" />
    <dl class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
      <div class="py-5 sm:pr-8">
        <dt class="section-kicker">Credits left</dt>
        <dd class="mt-1 text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{data.credits?.balance ?? 0}</dd>
        <p class="field-hint">Spent a few each time a tool runs.</p>
      </div>
      <div class="py-5 sm:pl-8">
        <dt class="section-kicker">Your plan</dt>
        <dd class="mt-1 text-2xl font-semibold tracking-tight text-text-primary capitalize">{data.subscription?.plan ?? "free"}</dd>
        <p class="field-hint capitalize">{data.subscription?.status ?? "active"}</p>
      </div>
    </dl>
    <hr class="rule" />
  </section>

  <!-- Create & optimize — editorial list, hairline rows, no card grid -->
  <section class="mb-12">
    <p class="section-kicker mb-1">Create &amp; optimize</p>
    <h2 class="text-lg font-semibold tracking-tight mb-5">Pick something to work on</h2>
    <div class="entry-list">
      {#each tools as tool, i (tool.href)}
        <a href={tool.href} class="entry group items-center">
          <span class="entry-index">{String(i + 1).padStart(2, "0")}</span>
          <div class="flex-1 min-w-0">
            <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">{tool.label}</p>
            <p class="entry-meta mt-0.5">{tool.desc}</p>
          </div>
          <ArrowRight size={16} class="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      {/each}
    </div>
  </section>

  <!-- Upgrade nudge (free plan) — warm, restrained green band -->
  {#if isFree}
    <section class="rounded-xl px-7 py-7 text-white" style="background: var(--teal-dark)">
      <h2 class="text-lg font-semibold">Room to do more</h2>
      <p class="text-white/80 mt-2 text-sm max-w-lg leading-relaxed">
        You're on the free plan with {data.credits?.balance ?? 0} credits left. A paid plan buys more runs, search-position tracking, and a closer look at your shop — when you're ready, not before.
      </p>
      <a href="/pricing" class="copy-link mt-4 !text-white/90 hover:!text-white">
        See the plans <ArrowRight size={14} />
      </a>
    </section>
  {/if}
</div>

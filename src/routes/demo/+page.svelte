<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import {
    Star, ArrowRight, Layers, ChartColumn, Target, Tag, Crown,
    FileText, UserCheck, TrendingUp, Calculator, Type, AlignLeft,
    Video, Search, Wand, MessageSquare, Play, Sparkles, CheckCircle2,
    ShieldAlert, AlertCircle, RefreshCw, BarChart2
  } from "lucide-svelte";

  // Svelte 5 Runes for State Management
  let isLoaded = $state(false);
  let activeTab = $state("create");
  let emailInput = $state("");

  // Interactive Mock Tool State
  let listingTitle = $state("Handmade Ceramic Coffee Mug");
  let isAnalyzing = $state(false);
  let analysisStep = $state(0);
  let showResult = $state(false);

  // FAQ Accordion State
  let openFaqIndex = $state<number | null>(null);

  const STATS = [
    { value: "500K+", label: "Sellers trust HeroRank", color: "from-teal to-teal-light" },
    { value: "10M+", label: "Listings optimized", color: "from-orange to-orange-light" },
    { value: "98%", label: "Satisfaction rate", color: "from-success to-success-light" },
    { value: "127", label: "Countries active", color: "from-navy-light to-teal" },
  ];

  const TOOL_CATEGORIES = {
    create: [
      { name: "Tag Generator", desc: "Uncover tags that boost visibility and target buyer intent.", icon: Tag },
      { name: "Title Generator", desc: "Write click-magnet titles with high-value keywords.", icon: Type },
      { name: "Description Writer", desc: "Create conversion-focused descriptions with Svelte speed.", icon: AlignLeft },
      { name: "Keyword Finder", desc: "Discover search term trends and volume estimates.", icon: Search },
      { name: "HeroRank AI", desc: "Your personal Etsy-selling AI assistant.", icon: MessageSquare },
    ],
    optimize: [
      { name: "Listing Analyzer", desc: "Instant audit of your listing with clear improvement action plans.", icon: FileText },
      { name: "Search Position", desc: "Track where your listings rank for target terms.", icon: TrendingUp },
      { name: "Profit Calculator", desc: "Real-time cost, fee, and margin calculation.", icon: Calculator },
      { name: "Video Generator", desc: "Create social-ready product videos from photos.", icon: Video },
    ],
    research: [
      { name: "Shop Research", desc: "Deconstruct top competitors' strategies and best-sellers.", icon: ChartColumn },
      { name: "Niche Finder", desc: "Identify high-demand, low-competition product niches.", icon: Target },
      { name: "Best Sellers", desc: "Analyze what items are currently trending globally.", icon: Crown },
      { name: "Buyer Check", desc: "Evaluate shopper feedback history to spot serial returners.", icon: UserCheck },
    ]
  };

  const FAQS = [
    { q: "How does the Etsy integration work?", a: "HeroRank connects securely using Etsy's official OAuth 2.0 API. We import your listing metadata so you can run tools directly on your products without copy-pasting. We never see your password and can never edit your listings without your permission." },
    { q: "Are search volumes and stats accurate?", a: "Etsy does not publish exact search counts. While other platforms dress up random numbers, HeroRank is honest: we label all estimations clearly and show raw, real Etsy data (like reviews and sales) as verified real data." },
    { q: "Can I use HeroRank for free?", a: "Yes! Every account starts with a Free Tier providing 3 free searches per day across all tools. No credit card is required to sign up." },
    { q: "Can I cancel my subscription anytime?", a: "Absolutely. You can upgrade, downgrade, or cancel your subscription at any time with a single click from your account settings page." }
  ];

  const ANALYSIS_STEPS = [
    "Fetching listing metadata from Etsy API...",
    "Analyzing title structure and keyword density...",
    "Evaluating tag relevance and search volume...",
    "Auditing description structure and buyer readability...",
    "Generating optimization report..."
  ];

  onMount(() => {
    isLoaded = true;
  });

  function startMockAnalysis() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    showResult = false;
    analysisStep = 0;

    const interval = setInterval(() => {
      if (analysisStep < ANALYSIS_STEPS.length - 1) {
        analysisStep += 1;
      } else {
        clearInterval(interval);
        isAnalyzing = false;
        showResult = true;
      }
    }, 1000);
  }

  function toggleFaq(index: number) {
    openFaqIndex = openFaqIndex === index ? null : index;
  }
</script>

<svelte:head>
  <title>HeroRank Demo — Landing Page Wow Experience</title>
  <meta name="description" content="Experience the ultimate Etsy SEO toolkit with a modern, high-fidelity user interface and stunning animations." />
</svelte:head>

<!-- Body Wrap (Dark Theme for maximum visual wow factor) -->
<div class="min-h-screen bg-[#070b13] text-white overflow-hidden selection:bg-teal selection:text-white font-sans">
  
  <!-- Glowing background orbs -->
  <div class="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal/10 blur-[150px] -z-10 pointer-events-none"></div>
  <div class="absolute top-[30%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-orange/10 blur-[150px] -z-10 pointer-events-none"></div>
  <div class="absolute bottom-[-10%] left-[20%] w-[45vw] h-[45vw] rounded-full bg-teal/5 blur-[180px] -z-10 pointer-events-none"></div>

  <!-- Navbar -->
  {#if isLoaded}
    <nav 
      in:fly={{ y: -30, duration: 800, easing: cubicOut }}
      class="fixed top-0 left-0 right-0 z-50 bg-[#070b13]/85 backdrop-blur-md border-b border-white/5"
    >
      <div class="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="/" class="flex items-center gap-2 group">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange to-orange-dark flex items-center justify-center shadow-lg shadow-orange/20 group-hover:scale-105 transition-transform duration-300">
            <Layers size={18} class="text-white" />
          </div>
          <span class="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">HeroRank</span>
        </a>
        <div class="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
          <a href="#features" class="hover:text-white transition-colors">Features</a>
          <a href="#interactive" class="hover:text-white transition-colors">Interactive Demo</a>
          <a href="#pricing" class="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" class="hover:text-white transition-colors">FAQ</a>
        </div>
        <div class="flex items-center gap-4">
          <a href="/auth/login" class="text-sm font-medium text-white/70 hover:text-white transition-colors">Log in</a>
          <a 
            href="/auth/signup" 
            class="relative inline-flex items-center justify-center p-0.5 mb-2 me-2 overflow-hidden text-sm font-medium text-white rounded-lg group bg-gradient-to-br from-orange to-orange-dark group-hover:from-orange group-hover:to-orange-dark hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-orange/30 transition-all duration-300"
          >
            <span class="relative px-5 py-2.5 transition-all ease-in duration-75 bg-[#070b13] rounded-md group-hover:bg-opacity-0">
              Start Free
            </span>
          </a>
        </div>
      </div>
    </nav>
  {/if}

  <!-- Hero Section -->
  <section class="pt-40 pb-24 px-6 relative">
    <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      
      <!-- Left Content -->
      <div class="lg:col-span-7 space-y-8 text-left">
        {#if isLoaded}
          <div in:fly={{ y: 30, duration: 800, delay: 100, easing: cubicOut }} class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal/30 bg-teal/5 text-teal text-xs font-semibold tracking-wider uppercase">
            <Sparkles size={12} class="animate-pulse" /> Svelte 5 & Tailwind 4 Powered
          </div>
          
          <h1 in:fly={{ y: 30, duration: 800, delay: 200, easing: cubicOut }} class="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
            Your Etsy listings <br />
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-teal via-teal-light to-orange">Deserve to be Seen.</span>
          </h1>

          <p in:fly={{ y: 30, duration: 800, delay: 300, easing: cubicOut }} class="text-lg text-white/60 leading-relaxed max-w-xl">
            Stop guessing your SEO keywords. HeroRank parses Etsy's raw marketplace data to deliver honest, labeled estimations and clear listing audits so you can soar.
          </p>

          <div in:fly={{ y: 30, duration: 800, delay: 400, easing: cubicOut }} class="flex flex-wrap gap-4 items-center">
            <a 
              href="/auth/signup" 
              class="px-8 py-4 bg-gradient-to-r from-orange to-orange-dark rounded-xl text-base font-bold shadow-lg shadow-orange/30 hover:shadow-orange/50 hover:scale-[1.02] transition-all duration-300 flex items-center gap-2"
            >
              Get Started for Free <ArrowRight size={18} />
            </a>
            <a 
              href="#interactive" 
              class="px-8 py-4 border border-white/10 hover:border-white/20 rounded-xl text-base font-bold hover:bg-white/5 transition-all duration-300 flex items-center gap-2"
            >
              Run Instant Audit <Play size={16} />
            </a>
          </div>
        {/if}
      </div>

      <!-- Right Mockup Visual -->
      <div class="lg:col-span-5 relative">
        {#if isLoaded}
          <div 
            in:fly={{ x: 50, duration: 1000, delay: 300, easing: cubicOut }}
            class="relative rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-2xl overflow-hidden group hover:border-teal/30 transition-all duration-500"
          >
            <!-- Glowing accent behind mockup -->
            <div class="absolute -inset-1 rounded-2xl bg-gradient-to-r from-teal to-orange opacity-10 group-hover:opacity-20 blur-xl transition-all duration-500 -z-10"></div>
            
            <!-- Window Bar -->
            <div class="flex items-center justify-between px-3 pb-3 border-b border-white/5">
              <div class="flex items-center gap-1.5">
                <span class="w-3 h-3 rounded-full bg-red-500/50"></span>
                <span class="w-3 h-3 rounded-full bg-yellow-500/50"></span>
                <span class="w-3 h-3 rounded-full bg-green-500/50"></span>
              </div>
              <div class="text-[10px] text-white/30 font-mono">herorank.claystation.workers.dev</div>
              <div class="w-6"></div>
            </div>

            <!-- Dashboard Mockup Image -->
            <div class="relative overflow-hidden rounded-lg mt-3">
              <img 
                src="/landing_hero.png" 
                alt="HeroRank Premium Dashboard Preview" 
                class="w-full h-auto rounded-lg group-hover:scale-[1.03] transition-transform duration-700" 
              />
              <!-- Light sheen -->
              <div class="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-30 group-hover:translate-x-full transition-transform duration-[1500ms] ease-out pointer-events-none"></div>
            </div>
          </div>
        {/if}
      </div>

    </div>
  </section>

  <!-- Stats Grid -->
  <section class="py-12 border-y border-white/5 bg-white/[0.01] px-6">
    <div class="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
      {#each STATS as s, i (s.label)}
        {#if isLoaded}
          <div 
            in:fly={{ y: 30, duration: 600, delay: 100 * i, easing: cubicOut }}
            class="text-center space-y-2"
          >
            <div class="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r {s.color}">{s.value}</div>
            <div class="text-sm text-white/50">{s.label}</div>
          </div>
        {/if}
      {/each}
    </div>
  </section>

  <!-- Interactive Demo Tool -->
  <section id="interactive" class="py-24 px-6 relative">
    <div class="max-w-4xl mx-auto text-center space-y-12">
      
      <div class="space-y-4">
        <h2 class="text-3xl md:text-4xl font-bold tracking-tight">Try HeroRank In Real-Time</h2>
        <p class="text-white/60 max-w-xl mx-auto text-sm md:text-base">
          Experience our listing scanner directly. Put in a mock product name and run the Svelte analysis module.
        </p>
      </div>

      <!-- Live Simulator -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-xl text-left relative">
        <div class="absolute top-4 right-4 text-[10px] text-teal/80 font-mono tracking-wider uppercase bg-teal/10 px-2 py-0.5 rounded-full border border-teal/20">
          Live Sandbox
        </div>

        <div class="space-y-6">
          <!-- Input Area -->
          <div class="space-y-2">
            <label for="simulate-title" class="block text-sm font-semibold text-white/80">Etsy Product Listing Title</label>
            <div class="flex flex-col sm:flex-row gap-3">
              <input 
                id="simulate-title"
                type="text" 
                bind:value={listingTitle}
                disabled={isAnalyzing}
                class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-teal transition-all text-sm"
                placeholder="e.g. Handmade Blue Pottery Mug"
              />
              <button 
                onclick={startMockAnalysis}
                disabled={isAnalyzing || !listingTitle.trim()}
                class="px-6 py-3 bg-teal hover:bg-teal-dark disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-teal/10 hover:shadow-teal/20"
              >
                {#if isAnalyzing}
                  <RefreshCw size={16} class="animate-spin" /> Analyzing...
                {:else}
                  <Sparkles size={16} /> Run Analysis
                {/if}
              </button>
            </div>
          </div>

          <!-- Loading States -->
          {#if isAnalyzing}
            <div transition:slide class="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <div class="flex items-center justify-between text-xs text-white/40">
                <span>Scanner progress</span>
                <span>{Math.round(((analysisStep + 1) / ANALYSIS_STEPS.length) * 100)}%</span>
              </div>
              <!-- Progress bar -->
              <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-teal transition-all duration-300"
                  style="width: {((analysisStep + 1) / ANALYSIS_STEPS.length) * 100}%"
                ></div>
              </div>
              <p class="text-xs text-teal/95 font-mono animate-pulse">
                &gt; {ANALYSIS_STEPS[analysisStep]}
              </p>
            </div>
          {/if}

          <!-- Result Area -->
          {#if showResult}
            <div in:fly={{ y: 20, duration: 500, easing: cubicOut }} class="p-6 rounded-xl bg-white/[0.03] border border-white/10 space-y-6">
              
              <!-- Result Header -->
              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div class="flex items-center gap-4">
                  <div class="w-16 h-16 rounded-2xl bg-success/20 border-2 border-success flex items-center justify-center text-success text-3xl font-extrabold shadow-lg shadow-success/15">
                    A
                  </div>
                  <div>
                    <h3 class="font-bold text-lg text-white">Listing Score: 92/100</h3>
                    <p class="text-xs text-white/50">Highly optimized for Etsy search algorithm.</p>
                  </div>
                </div>
                <div class="text-xs text-white/40 font-mono">
                  Verified Etsy API Result
                </div>
              </div>

              <!-- Recommendation items -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-3">
                  <h4 class="text-xs font-bold uppercase text-white/40 tracking-wider">Strengths</h4>
                  <ul class="space-y-2">
                    <li class="flex items-start gap-2.5 text-xs text-white/70">
                      <CheckCircle2 size={14} class="text-success mt-0.5 flex-shrink-0" />
                      <span>Title is {listingTitle.length} chars (perfect range of 40-80).</span>
                    </li>
                    <li class="flex items-start gap-2.5 text-xs text-white/70">
                      <CheckCircle2 size={14} class="text-success mt-0.5 flex-shrink-0" />
                      <span>High-value keyword focus detected in early title tokens.</span>
                    </li>
                  </ul>
                </div>
                <div class="space-y-3">
                  <h4 class="text-xs font-bold uppercase text-white/40 tracking-wider">Action Needed</h4>
                  <ul class="space-y-2">
                    <li class="flex items-start gap-2.5 text-xs text-white/70">
                      <ShieldAlert size={14} class="text-orange mt-0.5 flex-shrink-0" />
                      <span>Only 5/13 tags utilized. Add 8 more to capture organic traffic.</span>
                    </li>
                    <li class="flex items-start gap-2.5 text-xs text-white/70">
                      <AlertCircle size={14} class="text-danger mt-0.5 flex-shrink-0" />
                      <span>Missing descriptive words like "stoneware" or "gift for her".</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Suggested SEO Tags -->
              <div class="space-y-3 pt-2">
                <h4 class="text-xs font-bold uppercase text-white/40 tracking-wider">Suggested Tag Replacements</h4>
                <div class="flex flex-wrap gap-2">
                  <span class="px-2.5 py-1 rounded-full bg-teal/10 border border-teal/20 text-teal text-[11px] font-medium hover:bg-teal/20 transition-all cursor-pointer">#pottery mug</span>
                  <span class="px-2.5 py-1 rounded-full bg-teal/10 border border-teal/20 text-teal text-[11px] font-medium hover:bg-teal/20 transition-all cursor-pointer">#ceramic coffee mug</span>
                  <span class="px-2.5 py-1 rounded-full bg-teal/10 border border-teal/20 text-teal text-[11px] font-medium hover:bg-teal/20 transition-all cursor-pointer">#stoneware mug blue</span>
                  <span class="px-2.5 py-1 rounded-full bg-teal/10 border border-teal/20 text-teal text-[11px] font-medium hover:bg-teal/20 transition-all cursor-pointer">#coffee lover gift</span>
                  <span class="px-2.5 py-1 rounded-full bg-teal/10 border border-teal/20 text-teal text-[11px] font-medium hover:bg-teal/20 transition-all cursor-pointer">#handmade pottery</span>
                </div>
              </div>

            </div>
          {/if}

        </div>
      </div>

    </div>
  </section>

  <!-- Premium Tool Grid Section -->
  <section id="features" class="py-24 px-6 bg-white/[0.01] border-t border-white/5 relative">
    <div class="max-w-6xl mx-auto space-y-16">
      
      <div class="text-center space-y-4">
        <h2 class="text-3xl md:text-5xl font-bold tracking-tight">The Ultimate Etsy Toolkit</h2>
        <p class="text-white/60 max-w-xl mx-auto text-sm md:text-base">
          Every aspect of listing optimization in one sleek, ultra-fast workspace.
        </p>
      </div>

      <!-- Tab Buttons -->
      <div class="flex justify-center border-b border-white/5">
        <div class="flex gap-4 md:gap-8 overflow-x-auto pb-px">
          <button 
            onclick={() => activeTab = "create"}
            class="pb-4 text-sm font-semibold border-b-2 transition-all relative {activeTab === 'create' ? 'text-teal border-teal' : 'text-white/40 border-transparent hover:text-white/70'}"
          >
            Create & Generate
          </button>
          <button 
            onclick={() => activeTab = "optimize"}
            class="pb-4 text-sm font-semibold border-b-2 transition-all relative {activeTab === 'optimize' ? 'text-teal border-teal' : 'text-white/40 border-transparent hover:text-white/70'}"
          >
            Optimize & Track
          </button>
          <button 
            onclick={() => activeTab = "research"}
            class="pb-4 text-sm font-semibold border-b-2 transition-all relative {activeTab === 'research' ? 'text-teal border-teal' : 'text-white/40 border-transparent hover:text-white/70'}"
          >
            Research Market
          </button>
        </div>
      </div>

      <!-- Features Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each TOOL_CATEGORIES[activeTab as keyof typeof TOOL_CATEGORIES] as tool, idx (tool.name)}
          <div 
            in:fly={{ y: 25, duration: 400, delay: idx * 50, easing: cubicOut }}
            class="bg-white/[0.02] border border-white/5 hover:border-teal/30 hover:bg-white/[0.04] p-6 rounded-2xl transition-all duration-300 group hover:shadow-2xl hover:shadow-teal/5"
          >
            <div class="flex items-center gap-4 mb-4">
              <div class="w-12 h-12 rounded-xl bg-teal/10 border border-teal/20 flex items-center justify-center text-teal group-hover:scale-110 group-hover:bg-teal/20 transition-all duration-300">
                <tool.icon size={22} />
              </div>
              <h3 class="font-bold text-base text-white group-hover:text-teal transition-colors">{tool.name}</h3>
            </div>
            <p class="text-sm text-white/50 leading-relaxed">{tool.desc}</p>
          </div>
        {/each}
      </div>

    </div>
  </section>

  <!-- Pricing -->
  <section id="pricing" class="py-24 px-6 border-t border-white/5 relative">
    <div class="max-w-6xl mx-auto space-y-16">
      
      <div class="text-center space-y-4">
        <h2 class="text-3xl md:text-5xl font-bold tracking-tight">Flexible Pricing Plans</h2>
        <p class="text-white/60 max-w-xl mx-auto text-sm">
          Simple scaling. Switch or cancel anytime. All estimates are transparently labeled.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">
        <!-- Free Plan -->
        <div class="bg-white/[0.02] border border-white/5 rounded-2xl p-8 flex flex-col justify-between hover:border-white/10 transition-all duration-300">
          <div class="space-y-4">
            <h3 class="text-lg font-bold text-white/60">Free</h3>
            <div class="flex items-baseline">
              <span class="text-5xl font-extrabold tracking-tight">$0</span>
            </div>
            <p class="text-xs text-white/40">Ideal to test connectivity</p>
            <hr class="border-white/5 my-4" />
            <ul class="space-y-3 text-xs text-white/60">
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> 3 searches per day</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Etsy shop connection</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Tag & Title generators</li>
            </ul>
          </div>
          <a 
            href="/auth/signup" 
            class="mt-8 block text-center py-3 border border-white/10 hover:border-white/20 rounded-xl text-sm font-bold hover:bg-white/5 transition-all duration-300"
          >
            Get Started
          </a>
        </div>

        <!-- Business Plan -->
        <div class="bg-gradient-to-b from-teal/10 to-transparent border-2 border-teal rounded-2xl p-8 flex flex-col justify-between relative shadow-2xl shadow-teal/5 hover:scale-[1.01] transition-all duration-300">
          <span class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-teal text-[#070b13] px-3.5 py-1 text-xs font-bold rounded-full tracking-wider uppercase">Most Popular</span>
          <div class="space-y-4">
            <h3 class="text-lg font-bold text-teal">Business</h3>
            <div class="flex items-baseline">
              <span class="text-5xl font-extrabold tracking-tight">$9.99</span>
              <span class="text-sm text-white/40 ml-1">/mo</span>
            </div>
            <p class="text-xs text-white/40">Full professional access</p>
            <hr class="border-white/10 my-4" />
            <ul class="space-y-3 text-xs text-white/70">
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Unlimited tool usage</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Deep competitors research</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Full SEO ranking tracking</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Listing Studio & AI assistant</li>
            </ul>
          </div>
          <a 
            href="/auth/signup" 
            class="mt-8 block text-center py-3 bg-teal hover:bg-teal-dark text-[#070b13] rounded-xl text-sm font-bold shadow-lg shadow-teal/20 transition-all duration-300"
          >
            Start Business Plan
          </a>
        </div>

        <!-- Enterprise Plan -->
        <div class="bg-white/[0.02] border border-white/5 rounded-2xl p-8 flex flex-col justify-between hover:border-white/10 transition-all duration-300">
          <div class="space-y-4">
            <h3 class="text-lg font-bold text-white/60">Enterprise</h3>
            <div class="flex items-baseline">
              <span class="text-5xl font-extrabold tracking-tight">$29.99</span>
              <span class="text-sm text-white/40 ml-1">/mo</span>
            </div>
            <p class="text-xs text-white/40">Built for high-volume shops</p>
            <hr class="border-white/5 my-4" />
            <ul class="space-y-3 text-xs text-white/60">
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Everything in Business</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Priority API scan queues</li>
              <li class="flex items-center gap-2"><CheckCircle2 size={14} class="text-teal" /> Multi-shop support (up to 5)</li>
            </ul>
          </div>
          <a 
            href="/auth/signup" 
            class="mt-8 block text-center py-3 border border-white/10 hover:border-white/20 rounded-xl text-sm font-bold hover:bg-white/5 transition-all duration-300"
          >
            Get Enterprise
          </a>
        </div>
      </div>

    </div>
  </section>

  <!-- FAQ Section -->
  <section id="faq" class="py-24 px-6 border-t border-white/5 bg-white/[0.005]">
    <div class="max-w-4xl mx-auto space-y-16">
      
      <div class="text-center space-y-4">
        <h2 class="text-3xl md:text-5xl font-bold tracking-tight">Frequently Asked Questions</h2>
        <p class="text-white/60 max-w-xl mx-auto text-sm">
          Have queries? We've gathered common topics below.
        </p>
      </div>

      <div class="space-y-4 max-w-3xl mx-auto">
        {#each FAQS as faq, idx}
          <div class="border border-white/5 bg-white/[0.01] rounded-2xl overflow-hidden transition-all duration-300">
            <button 
              onclick={() => toggleFaq(idx)}
              class="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-sm md:text-base hover:bg-white/[0.02] transition-colors"
            >
              <span>{faq.q}</span>
              <span class="text-teal transition-transform duration-300 {openFaqIndex === idx ? 'rotate-180' : ''}">
                ▼
              </span>
            </button>
            
            {#if openFaqIndex === idx}
              <div transition:slide class="px-6 pb-6 text-sm text-white/50 leading-relaxed border-t border-white/5 pt-4">
                {faq.a}
              </div>
            {/if}
          </div>
        {/each}
      </div>

    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-white/5 py-12 px-6 bg-black/40 text-sm text-white/40">
    <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange to-orange-dark flex items-center justify-center"><Layers size={14} class="text-white" /></div>
        <span class="text-lg font-bold text-white tracking-tight">HeroRank</span>
      </div>
      <div class="flex items-center gap-8">
        <a href="#features" class="hover:text-white transition-colors">Features</a>
        <a href="#pricing" class="hover:text-white transition-colors">Pricing</a>
        <a href="#faq" class="hover:text-white transition-colors">FAQ</a>
      </div>
      <p class="text-xs">© 2026 HeroRank. Built honestly for Etsy sellers.</p>
    </div>
  </footer>

</div>

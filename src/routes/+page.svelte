<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { slide, fade } from "svelte/transition";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";
  import CocoonToButterfly from "$lib/components/ui/CocoonToButterfly.svelte";
  import MarketingNav from "$lib/components/marketing/MarketingNav.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";
  import {
    ArrowRight, Plug, Sparkles, BadgeCheck, Check, Copy,
    Type, Tag, AlignLeft, Search, FileText, TrendingUp, Calculator,
    Store, Target, Crown, LineChart, ShieldCheck, HelpCircle,
    ChevronLeft, ChevronRight, Info, Lock, Shuffle, X, Play, Smartphone, Star
  } from "lucide-svelte";

  // Auth state from the root layout load — drives whether the header shows "Log in / Start free"
  // (guest) or "Go to dashboard" (signed in).
  let { data } = $props();
  const loggedIn = $derived(!!data.user);

  const PILLARS = [
    {
      key: "Create",
      title: "Create",
      blurb: "Write listing content buyers actually search for — for your own shop.",
      icon: Sparkles,
      tools: [
        { name: "Title Generator", href: "/tools/title-generator", icon: Type },
        { name: "Tag Generator", href: "/tools/tag-generator", icon: Tag },
        { name: "Description Writer", href: "/tools/description-generator", icon: AlignLeft },
        { name: "Keyword Finder", href: "/tools/keyword-generator", icon: Search },
        { name: "VieRank Assistant", href: "/tools/assistant", icon: Sparkles },
      ]
    },
    {
      key: "Optimize",
      title: "Optimize",
      blurb: "See what to fix on your listings and where they stand in search.",
      icon: FileText,
      tools: [
        { name: "Listing Optimizer", href: "/tools/listing-analyzer", icon: FileText },
        { name: "Search Position", href: "/tools/rank-check", icon: TrendingUp },
        { name: "Profit Calculator", href: "/tools/profit-calculator", icon: Calculator },
      ]
    },
    {
      key: "Research",
      title: "Research",
      blurb: "Look around for inspiration — niches, trends, and what good shops do.",
      icon: Store,
      tools: [
        { name: "Competitor Research", href: "/tools/shop-analyzer", icon: Store },
        { name: "Niche Finder", href: "/tools/niche-finder", icon: Target },
        { name: "Best Sellers", href: "/tools/best-sellers", icon: Crown },
        { name: "Etsy Trends", href: "/tools/etsy-trends", icon: LineChart },
        { name: "Reputation Check", href: "/tools/buyer-check", icon: ShieldCheck },
      ]
    },
  ];

  const STEPS = [
    { n: 1, title: "Connect your Etsy shop", body: "Link your shop in one click. The tools work on your own listings — nothing to copy or paste.", icon: Plug },
    { n: 2, title: "Get clear suggestions", body: "Better titles, tags, and descriptions for each listing — every estimate labeled as an estimate.", icon: Sparkles },
    { n: 3, title: "Publish and improve", body: "Apply what works, watch your search position, and keep refining as the shop grows.", icon: TrendingUp },
  ];

  // Interactive demo playground state
  let demoKeyword = $state("ceramic mug");
  let isDemoGenerating = $state(false);
  let demoProgress = $state(0);
  let demoTab = $state("audit"); // 'audit' | 'suggestions'

  const DEMO_KEYWORDS = ["ceramic mug", "wool scarf", "clay earrings"];

  const GENERATED_RESULTS = {
    "ceramic mug": {
      score: 94,
      checklist: [
        { name: "Title length (118 chars)", desc: "Excellent, allows room for search terms", ok: true },
        { name: "First 3 words keywords", desc: "Speckled ceramic mug is high demand", ok: true },
        { name: "13 tags found", desc: "All 13 listing tags are utilized fully", ok: true },
        { name: "Description structure", desc: "Missing shop policies paragraph link", ok: false }
      ],
      metrics: { demand: "High", competition: "Medium", opportunity: "Strong" },
      titles: [
        { t: "Handmade Ceramic Coffee Mug · Rustic Blue Pottery Mug", s: "strong", n: 96, w: "96%" },
        { t: "Speckled Blue Coffee Mug · Handmade Stoneware Mug", s: "strong", n: 91, w: "91%" },
      ],
      tags: ["ceramic mug", "pottery coffee mug", "handmade coffee cup", "stoneware mug", "gift for coffee lover"]
    },
    "wool scarf": {
      score: 88,
      checklist: [
        { name: "Title length (110 chars)", desc: "Good search engine coverage", ok: true },
        { name: "First 3 words keywords", desc: "Knit wool scarf matches high intent", ok: true },
        { name: "11 tags found", desc: "Add 2 more tags to reach maximum exposure", ok: false },
        { name: "Description structure", desc: "Generous length with solid material keywords", ok: true }
      ],
      metrics: { demand: "High", competition: "Low", opportunity: "Excellent" },
      titles: [
        { t: "Handmade Merino Wool Scarf · Soft Chunky Knit Winter Scarf", s: "strong", n: 95, w: "95%" },
        { t: "Chunky Knit Scarf · Warm Wool Shawl for Women", s: "strong", n: 88, w: "88%" },
      ],
      tags: ["wool scarf", "knit winter scarf", "chunky warm shawl", "handmade wool muffler", "holiday gift for her"]
    },
    "clay earrings": {
      score: 96,
      checklist: [
        { name: "Title length (132 chars)", desc: "Optimized title space for Etsy search", ok: true },
        { name: "First 3 words keywords", desc: "Statement clay earrings is a rising niche", ok: true },
        { name: "13 tags found", desc: "Maximum tag allocation active", ok: true },
        { name: "Description structure", desc: "Includes materials breakdown checklist", ok: true }
      ],
      metrics: { demand: "Medium", competition: "Low", opportunity: "Outstanding" },
      titles: [
        { t: "Polymer Clay Statement Earrings · Modern Geometric Dangles", s: "strong", n: 97, w: "97%" },
        { t: "Handmade Clay Earrings · Arch Drop Earrings for Her", s: "strong", n: 92, w: "92%" },
      ],
      tags: ["clay earrings", "statement jewelry", "handmade arch dangles", "polymer clay studs", "bridesmaid jewelry"]
    }
  };

  let currentScore = $state(GENERATED_RESULTS["ceramic mug"].score);
  let currentChecklist = $state(GENERATED_RESULTS["ceramic mug"].checklist);
  let currentMetrics = $state(GENERATED_RESULTS["ceramic mug"].metrics);
  let currentDemoTitles = $state(GENERATED_RESULTS["ceramic mug"].titles);
  let currentDemoTags = $state(GENERATED_RESULTS["ceramic mug"].tags);

  function triggerDemo(kw: string) {
    if (isDemoGenerating) return;
    demoKeyword = kw;
    isDemoGenerating = true;
    demoProgress = 0;
    
    const interval = setInterval(() => {
      demoProgress += 10;
      if (demoProgress >= 100) {
        clearInterval(interval);
        const normKw = kw.toLowerCase().trim();
        
        if (normKw === "ceramic mug" || normKw === "wool scarf" || normKw === "clay earrings") {
          const res = GENERATED_RESULTS[normKw];
          currentScore = res.score;
          currentChecklist = res.checklist;
          currentMetrics = res.metrics;
          currentDemoTitles = res.titles;
          currentDemoTags = res.tags;
        } else {
          const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          const capKw = capitalize(kw);
          currentScore = 85;
          currentChecklist = [
            { name: `Title length (${Math.min(100 + kw.length, 140)} chars)`, desc: "Valid length for Etsy catalog guidelines", ok: true },
            { name: "First 3 words keywords", desc: `${capKw} forms a solid search prefix`, ok: true },
            { name: "10 tags found", desc: "Add 3 more tags to max out search keywords", ok: false },
            { name: "Description structure", desc: "Optimize description text with structured headers", ok: false }
          ];
          currentMetrics = { demand: "Medium", competition: "Medium", opportunity: "Decent" };
          currentDemoTitles = [
            { t: `Handmade ${capKw} · Premium Custom ${capKw} Gift`, s: "strong", n: 92, w: "92%" },
            { t: `Personalized ${capKw} · Minimalist ${capKw} for Her`, s: "decent", n: 84, w: "84%" }
          ];
          currentDemoTags = [
            kw.toLowerCase(),
            `handmade ${kw.toLowerCase()}`,
            `custom ${kw.toLowerCase()}`,
            `${kw.toLowerCase()} gift`,
            `etsy ${kw.toLowerCase()}`
          ];
        }
        
        isDemoGenerating = false;
      }
    }, 80);
  }

  function handleDemoSubmit(e: Event) {
    e.preventDefault();
    if (demoKeyword.trim()) {
      triggerDemo(demoKeyword);
    }
  }

  let activePillarKey = $state("Create");
  const activePillar = $derived(PILLARS.find(p => p.key === activePillarKey) ?? PILLARS[0]);
  const ActiveIcon = $derived(activePillar.icon);

  let showcaseCreateTab = $state("title");

  let calcListings = $state(50);
  let calcMinutes = $state(30);
  const hoursSaved = $derived(Math.round((calcListings * calcMinutes) / 60));
  const seoBoost = $derived(Math.min(15 + Math.round(calcListings / 12), 45));
  const opportunityValue = $derived(calcListings * 4);

  // Commitments carousel — honest brand principles (no fabricated testimonials/users yet).
  let testimonialIndex = $state(0);
  const TESTIMONIALS = [
    {
      quote: "Estimates are labeled as estimates. The figures we pull straight from Etsy — your reviews, sales, and shop stats — are shown as real. You always know which is which.",
      title: "Honest by default",
      sub: "Estimated vs. real, clearly marked"
    },
    {
      quote: "We connect through Etsy's official API with read-only access by default. You approve every permission on Etsy's own page, and can change or revoke it anytime.",
      title: "You stay in control",
      sub: "Secure OAuth · permission-based"
    },
    {
      quote: "No guaranteed rankings and no vanity metrics — just clear, practical suggestions you decide whether to apply, for your own listings.",
      title: "No inflated promises",
      sub: "Practical guidance, your call"
    }
  ];

  function nextTestimonial() {
    testimonialIndex = (testimonialIndex + 1) % TESTIMONIALS.length;
  }
  function prevTestimonial() {
    testimonialIndex = (testimonialIndex - 1 + TESTIMONIALS.length) % TESTIMONIALS.length;
  }

  // Before/After Split Slider State
  let splitPercent = $state(50);

  // Etsy SERP Position Simulator State
  let showOptimizedRank = $state(false);
  let listingsList = $derived(
    showOptimizedRank
      ? [
          { id: 101, title: "Personalized Ceramic Mug • Custom Gift for Coffee Lover • Speckled Stoneware Mug", rank: 2, shop: "GlazeCrafts", price: "$24.00", sales: "1,240 sales/mo", isUser: true, score: 96, scoreColor: "var(--success)" },
          { id: 1, title: "Rustic Stoneware Mug - Minimalist Coffee Cup", rank: 1, shop: "ClayStation", price: "$28.00", sales: "830 sales/mo" },
          { id: 2, title: "Custom Ceramic Mug - Personalized Gift", rank: 3, shop: "EarthyDesigns", price: "$22.00", sales: "640 sales/mo" },
          { id: 3, title: "Coffee Mug Set of 2", rank: 4, shop: "DailyMugs", price: "$32.00", sales: "310 sales/mo" }
        ]
      : [
          { id: 1, title: "Rustic Stoneware Mug - Minimalist Coffee Cup", rank: 1, shop: "ClayStation", price: "$28.00", sales: "830 sales/mo" },
          { id: 3, title: "Coffee Mug Set of 2", rank: 2, shop: "DailyMugs", price: "$32.00", sales: "310 sales/mo" },
          { id: 2, title: "Custom Ceramic Mug - Personalized Gift", rank: 3, shop: "EarthyDesigns", price: "$22.00", sales: "640 sales/mo" },
          { id: 101, title: "Stoneware Mug", rank: 84, shop: "GlazeCrafts", price: "$24.00", sales: "0 sales/mo", isUser: true, score: 42, scoreColor: "var(--danger)" }
        ]
  );

  // Niche Opportunity Matrix State
  let selectedNicheKey = $state("earrings");
  const NICHES = {
    earrings: {
      name: "Statement Clay Earrings",
      x: 22,
      y: 84,
      quadrant: "Hidden Gem",
      dotClass: "niche-dot-green",
      volume: "18.5k searches/mo",
      competition: "1,200 listings",
      opportunityScore: 94,
      tips: [
        "Use 'arch drop earrings' in early title spaces.",
        "Highlight hypoallergenic posts in your tags list.",
        "Add a 15-second process video showcasing clay curing."
      ]
    },
    planners: {
      name: "Digital Life Planners",
      x: 88,
      y: 92,
      quadrant: "Oversaturated",
      dotClass: "niche-dot-orange",
      volume: "45.0k searches/mo",
      competition: "98,000 listings",
      opportunityScore: 52,
      tips: [
        "High initial traffic, but listing ad bids are very expensive.",
        "Target micro-niches (e.g., ADHA, student, nurse planners).",
        "Offer a free mini-planner preview download."
      ]
    },
    mugs: {
      name: "Personalized Stoneware Mugs",
      x: 35,
      y: 78,
      quadrant: "Hidden Gem",
      dotClass: "niche-dot-green",
      volume: "14.2k searches/mo",
      competition: "3,400 listings",
      opportunityScore: 88,
      tips: [
        "Include custom initials stamps and gift wrapping.",
        "Target tags: 'stoneware coffee cup', 'custom pottery gift'.",
        "Bundle as a 'set of 2 registry gift' for couples."
      ]
    },
    bookmarks: {
      name: "Pressed Flower Bookmarks",
      x: 15,
      y: 38,
      quadrant: "Low-Value Niche",
      dotClass: "niche-dot-gray",
      volume: "1.8k searches/mo",
      competition: "450 listings",
      opportunityScore: 65,
      tips: [
        "Low overall volume, but conversion rates are high.",
        "Market as bridesmaid bundle items or graduation cards.",
        "Optimize description text for bulk ordering."
      ]
    },
    bracelets: {
      name: "Custom Beaded Bracelets",
      x: 94,
      y: 52,
      quadrant: "Uphill Battle",
      dotClass: "niche-dot-red",
      volume: "8.6k searches/mo",
      competition: "72,000 listings",
      opportunityScore: 29,
      tips: [
        "Extremely saturated; avoid generic tags like 'beaded bracelet'.",
        "Compete on custom sizing options or premium gemstones.",
        "Incorporate recycled ocean plastic beads for eco-conscious tags."
      ]
    }
  };
  const activeNiche = $derived(NICHES[selectedNicheKey as keyof typeof NICHES] || NICHES.earrings);

  // FAQ Accordion State
  let faqSearch = $state("");
  let openFaqIndex = $state(-1);
  const FAQS = [
    {
      q: "How does VieRank sync with my Etsy shop?",
      a: "VieRank connects securely via official Etsy OAuth v3. Once linked, it reads your listings automatically so you can run audits and compose draft updates without any copy-pasting. We never see your password or payment details.",
      cat: "Integration"
    },
    {
      q: "Are the search volumes and sales estimates accurate?",
      a: "Since Etsy doesn't share search logs, we use Google Trends, autocomplete velocity, and category reviews to compute estimates. We badge every estimate explicitly. Real shop values (like your own conversion rate) are shown as exact.",
      cat: "Data"
    },
    {
      q: "Will this violate Etsy's Terms of Service?",
      a: "No. VieRank uses the official Etsy API (OAuth v3) for every shop change and follows Etsy's API Terms, including its caching and data-handling rules. VieRank uses the Etsy API but is not endorsed or certified by Etsy.",
      cat: "Safety"
    },
    {
      q: "Can I cancel my subscription anytime?",
      a: "Yes. You can upgrade, downgrade, or cancel directly from your settings. If you cancel, your subscription remains active until the end of the billing period and no further charges will apply.",
      cat: "Billing"
    },
    {
      q: "What makes VieRank better than other Etsy SEO tools?",
      a: "Unlike cluttered, spreadsheet-heavy tools, VieRank focuses on action: giving you copy-pasteable AI recommendations, a visual scoring checklist, and a clean interface. We also respect your intelligence by labeling estimated numbers.",
      cat: "Product"
    }
  ];
  const filteredFaqs = $derived(
    FAQS.filter(faq =>
      faq.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      faq.a.toLowerCase().includes(faqSearch.toLowerCase())
    )
  );

  function toggleFaq(index: number) {
    openFaqIndex = openFaqIndex === index ? -1 : index;
  }

  // Walkthrough Lightbox Modal State
  let showVideoModal = $state(false);

  // Live Etsy Keyword Trends Ticker Data
  const TICKER_KEYWORDS = [
    { kw: "clay earrings", diff: "+45% demand", positive: true },
    { kw: "personalized mug", diff: "+28% demand", positive: true },
    { kw: "crochet cardigan", diff: "+34% demand", positive: true },
    { kw: "wool scarf", diff: "-12% off-season", positive: false },
    { kw: "custom jewelry", diff: "+18% demand", positive: true },
    { kw: "pressed bookmark", diff: "+15% demand", positive: true },
    { kw: "bridesmaid gift", diff: "+22% demand", positive: true }
  ];

  let root: HTMLElement;
  let scrollY = $state(0);
  onMount(() => {
    root.classList.add("mounted");
    
    // Auto-slide Testimonials every 6 seconds
    const testimonialTimer = setInterval(() => {
      testimonialIndex = (testimonialIndex + 1) % TESTIMONIALS.length;
    }, 6000);
    
    // Parallax butterflies: rAF-throttled (one update per frame), and frozen entirely for
    // reduced-motion users (scrollY stays 0 → butterflies hold their base position).
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scrollTicking = false;
    const handleScroll = () => {
      if (prefersReduced || scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollY = window.scrollY;
        scrollTicking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    if (prefersReduced) {
      // No scroll-reveal animation for reduced-motion users — show all sections immediately
      // (otherwise `.reveal` stays opacity:0 forever, since `.in-view` is never added).
      root.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
      return () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }
    
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', handleScroll);
      clearInterval(testimonialTimer);
    };
  });
</script>


<div class="lp min-h-screen bg-white text-text-primary overflow-hidden" bind:this={root}>
  <!-- Navigation Header -->
  <MarketingNav {loggedIn} />

  <!-- Live Keyword Trends Ticker -->
  <div class="ticker-wrap select-none border-b border-border bg-white">
    <div class="ticker-track">
      {#each [...TICKER_KEYWORDS, ...TICKER_KEYWORDS] as item}
        <div class="ticker-item">
          <Search size={12} class="text-teal" />
          <span class="text-text-primary font-bold">"{item.kw}"</span>
          <span class={item.positive ? 'text-success font-semibold' : 'text-danger font-semibold'}>
            {item.diff}
          </span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Hero Section — Commitment with layered glow fields and a dark-glass live mockup -->
  <section class="relative overflow-hidden pt-16 pb-20" style="background: var(--teal-dark)">
    <!-- Grid overlay and dot backdrop patterns -->
    <div class="absolute inset-0 grid-overlay opacity-[0.4]" aria-hidden="true"></div>
    <div class="absolute inset-0 opacity-[0.04]" style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 30px 30px;" aria-hidden="true"></div>
    <div class="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-30 blur-[140px]" style="background: var(--orange)" aria-hidden="true"></div>
    <div class="absolute top-20 -left-40 w-[500px] h-[500px] rounded-full opacity-40 blur-[140px]" style="background: var(--teal-light)" aria-hidden="true"></div>
    <div class="lp-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-25 blur-[140px]" style="background: radial-gradient(circle, var(--teal-light), transparent)" aria-hidden="true"></div>

    <!-- Scroll-Parallax Background Butterflies -->
    <div class="absolute pointer-events-none select-none hidden md:block" style="left: 6%; top: 18%; transform: translateY({scrollY * 0.18}px); opacity: 0.25; transition: transform 0.1s ease-out; color: white;">
      <div class="bfly-wobble" style="--base-rot: 15deg; animation-duration: 6.5s;"><MascotLogo size={90} animate="always" /></div>
    </div>
    <div class="absolute pointer-events-none select-none hidden md:block" style="right: 8%; top: 40%; transform: translateY({scrollY * -0.12}px); opacity: 0.22; transition: transform 0.1s ease-out; color: white;">
      <div class="bfly-wobble" style="--base-rot: -25deg; animation-duration: 7.5s;"><MascotLogo size={80} animate="always" /></div>
    </div>
    <div class="absolute pointer-events-none select-none hidden md:block" style="left: 45%; top: 60%; transform: translateY({scrollY * 0.08}px); opacity: 0.22; transition: transform 0.1s ease-out; color: white;">
      <div class="bfly-wobble" style="--base-rot: 5deg; animation-duration: 5.5s;"><MascotLogo size={85} animate="always" /></div>
    </div>

    <!-- Orbit Flying Butterfly -->
    <div class="absolute pointer-events-none select-none hidden md:block orbit-butterfly-container">
      <div class="orbit-butterfly" style="color: var(--teal-light);">
        <MascotLogo size={42} animate="always" />
      </div>
    </div>


    <div class="relative max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(0,1fr)] gap-14 items-center">
      <!-- Copy Block -->
      <div>
        <span class="rise rise-1 badge-estimated !bg-white/10 !border-white/20 !text-white/95 mb-4 px-3 py-1 inline-flex items-center gap-1.5 rounded-full text-xs font-medium tracking-wide">
          <Sparkles size={11} class="text-orange" /> Built exclusively for Etsy sellers
        </span>
        <h1 class="rise rise-2 text-4xl md:text-[3.5rem] font-semibold leading-[1.05] tracking-tight text-white mb-4" style="text-wrap: balance">
          An honest hand with<br class="hidden sm:block" /> your Etsy listings.
        </h1>
        <p class="rise rise-3 text-lg text-white/85 max-w-xl mb-6 leading-relaxed" style="text-wrap: pretty">
          Write better titles, tags, and descriptions for <em>your own</em> listings — then see what to improve. No inflated numbers. Every estimate is labeled.
        </p>

        <!-- Signature Metamorphosis Card (Hidden on Mobile < 768px for scroll ergonomics, visible on md and up) -->
        <div class="rise rise-3 mb-6 hidden md:block">
          <CocoonToButterfly />
        </div>


        <div class="rise rise-4 flex flex-col sm:flex-row items-center gap-4">
          <a href="/auth/signup" class="btn btn-glow !bg-white !text-teal-dark hover:!bg-white/95 text-base !px-8 hover-lift font-semibold w-full sm:w-auto">
            Start free <ArrowRight size={17} />
          </a>
          <button
            type="button"
            onclick={() => showVideoModal = true}
            class="btn btn-ghost !text-white hover:!bg-white/10 text-base !px-8 border border-white/25 w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <Play size={15} fill="white" /> Watch Walkthrough
          </button>
        </div>
        <div class="rise rise-5 mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center gap-y-3 gap-x-5 text-white/80">
          <div class="flex items-center gap-1.5">
            <BadgeCheck size={14} class="text-orange" />
            <span class="text-xs font-bold">Every estimate honestly labeled</span>
          </div>
          <span class="text-white/30 text-xs hidden sm:block">•</span>
          <p class="text-xs font-medium leading-relaxed">
            Built for Etsy sellers · connects via Etsy's official API · free to start.
          </p>
        </div>
      </div>

      <!-- Live Mockup Card — Dark Glassmorphic Design -->
      <div class="rise rise-3 relative z-10">
        <!-- Golden blur blob behind the glass card to make it pop -->
        <div class="absolute inset-0 bg-gradient-to-tr from-orange/20 to-teal/10 blur-2xl rounded-2xl" aria-hidden="true"></div>
        <div class="demo dark-glass-card rounded-2xl p-6 max-w-md mx-auto lg:ml-auto text-white">
          <div class="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg flex items-center justify-center bg-white/10">
                <Sparkles size={14} class="text-teal-light" />
              </span>
              <span class="text-sm font-semibold tracking-tight">Interactive Playground</span>
            </div>
            <span class="badge-estimated !bg-white/10 !border-white/15 !text-orange inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
              <BadgeCheck size={11} /> Real-Time
            </span>
          </div>

          <!-- Search Input inside Demo -->
          <form onsubmit={handleDemoSubmit} class="mb-4">
            <div class="demo-input-container">
              <Search size={14} class="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                bind:value={demoKeyword}
                placeholder="Enter an Etsy product (e.g. clay earrings)..."
                class="demo-input-field"
                disabled={isDemoGenerating}
              />
            </div>
          </form>

          <!-- Quick Suggestion Chips -->
          <div class="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            <span class="text-[11px] text-white/50 font-medium whitespace-nowrap">Try:</span>
            {#each DEMO_KEYWORDS as kw}
              <button
                type="button"
                onclick={() => triggerDemo(kw)}
                class="demo-chip {demoKeyword === kw ? 'active' : ''}"
                disabled={isDemoGenerating}
              >
                {kw}
              </button>
            {/each}
          </div>

          <!-- Loading scan state -->
          {#if isDemoGenerating}
            <div class="py-12 flex flex-col items-center justify-center">
              <div class="flex items-center gap-2 mb-3">
                <div class="w-2 h-2 bg-teal-light rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-teal-light rounded-full animate-bounce" style="animation-delay: 0.15s"></div>
                <div class="w-2 h-2 bg-teal-light rounded-full animate-bounce" style="animation-delay: 0.3s"></div>
              </div>
              <p class="text-xs text-white/60 font-medium">Analyzing demand & matching tags...</p>
              <div class="w-48 bg-white/10 h-1 rounded-full overflow-hidden mt-4">
                <div class="bg-teal-light h-full transition-all duration-75" style="width: {demoProgress}%"></div>
              </div>
            </div>
          {:else}
            <!-- Tab switches inside Auditor card -->
            <div class="flex border-b border-white/10 mb-4 justify-start gap-4 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onclick={() => demoTab = "audit"}
                class="pb-2 text-xs font-semibold hover:text-white transition-all relative shrink-0 {demoTab === 'audit' ? 'text-white' : 'text-white/50'}"
              >
                Audit Score
                {#if demoTab === "audit"}
                  <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-light"></div>
                {/if}
              </button>
              <button
                type="button"
                onclick={() => demoTab = "suggestions"}
                class="pb-2 text-xs font-semibold hover:text-white transition-all relative shrink-0 {demoTab === 'suggestions' ? 'text-white' : 'text-white/50'}"
              >
                AI Suggestions
                {#if demoTab === "suggestions"}
                  <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-light"></div>
                {/if}
              </button>
              <button
                type="button"
                onclick={() => demoTab = "serp"}
                class="pb-2 text-xs font-semibold hover:text-white transition-all relative shrink-0 {demoTab === 'serp' ? 'text-white' : 'text-white/50'}"
              >
                Etsy Search Position
                {#if demoTab === "serp"}
                  <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-light"></div>
                {/if}
              </button>
            </div>

            <!-- Results Pane inside Demo -->
            {#if demoTab === "audit"}
              <div class="space-y-4 animate-fade-in">
                <div class="grid grid-cols-[auto_1fr] gap-5 items-center">
                  <!-- Circular SVG progress dial -->
                  <div class="flex flex-col items-center justify-center relative w-20 h-20 shrink-0">
                    <svg class="w-full h-full" viewBox="0 0 100 100">
                      <circle class="text-white/10" stroke-width="8" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50"/>
                      <circle class="text-teal-light dial-circle" stroke-width="8" stroke-dasharray="251.2" stroke-dashoffset={251.2 - (251.2 * currentScore) / 100} stroke-linecap="round" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50"/>
                    </svg>
                    <div class="absolute flex flex-col items-center justify-center">
                      <span class="text-xl font-bold font-mono tracking-tighter text-white">{currentScore}</span>
                      <span class="text-[8px] text-white/50 uppercase font-semibold">Score</span>
                    </div>
                  </div>

                  <!-- Opportunity sliders -->
                  <div class="flex-1 space-y-2">
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-white/60">Search Demand</span>
                      <span class="font-bold text-teal-light">{currentMetrics.demand}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-white/60">Competition</span>
                      <span class="font-bold text-orange">{currentMetrics.competition}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-white/60">Overall Opportunity</span>
                      <span class="font-bold text-teal-light">{currentMetrics.opportunity}</span>
                    </div>
                  </div>
                </div>

                <!-- Checklist details -->
                <div class="space-y-2 border-t border-white/10 pt-3.5 mt-3">
                  {#each currentChecklist as item}
                    <div class="flex items-start gap-2 text-[11px] leading-relaxed">
                      {#if item.ok}
                        <span class="text-success-light shrink-0 mt-0.5"><Check size={12} /></span>
                      {:else}
                        <span class="text-orange shrink-0 mt-0.5"><HelpCircle size={12} /></span>
                      {/if}
                      <div>
                        <span class="font-semibold text-white/95">{item.name}:</span>
                        <span class="text-white/60"> {item.desc}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else if demoTab === "suggestions"}
              <div class="space-y-4 animate-fade-in">
                <!-- Generated Titles -->
                <div>
                  <div class="text-[10px] text-white/50 font-semibold mb-2 tracking-wider uppercase">Scored Listing Titles</div>
                  <div class="entry-list space-y-2">
                    {#each currentDemoTitles as d, i (i)}
                      <div class="entry demo-row !py-2.5 !px-3 !bg-white/[0.02] hover:!bg-white/[0.04] !border-white/[0.05] rounded-xl flex items-center gap-3 transition-colors">
                        <div class="flex-1 min-w-0">
                          <p class="text-[12px] text-white/90 font-medium leading-snug">{d.t}</p>
                          <div class="flex items-center gap-3 mt-1.5">
                            <span class="entry-meta text-[11px] font-semibold" style="color: var(--success-light)">{d.s} · {d.n}</span>
                            <div class="score-bar flex-1 max-w-[80px] h-1 bg-white/10 rounded-full overflow-hidden">
                              <div class="score-bar-fill high bar-fill h-full rounded-full" style="background: var(--success-light); --w: {d.w}"></div>
                            </div>
                          </div>
                        </div>
                        <Copy size={13} class="text-white/30 shrink-0 cursor-pointer hover:text-white transition-colors" />
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Matching Tags -->
                <div>
                  <div class="text-[10px] text-white/50 font-semibold mb-2 tracking-wider uppercase">High-Relevance Tags</div>
                  <div class="flex flex-wrap gap-1.5">
                    {#each currentDemoTags as tag}
                      <span class="px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-white/80 font-medium">
                        {tag}
                      </span>
                    {/each}
                  </div>
                </div>
              </div>
            {:else if demoTab === "serp"}
              <div class="space-y-4 animate-fade-in">
                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-2.5 mb-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <Search size={12} class="text-teal-light shrink-0" />
                    <span class="text-[11px] font-medium text-white/90 truncate">Etsy Search:</span>
                    <span class="text-[11px] font-mono text-teal-light font-bold truncate">"{demoKeyword}"</span>
                  </div>
                  <button
                    type="button"
                    onclick={() => showOptimizedRank = !showOptimizedRank}
                    class="px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider transition-all flex items-center gap-1 shrink-0 {showOptimizedRank ? 'bg-teal text-white shadow-sm border border-teal' : 'bg-white/10 text-white/75 hover:bg-white/15 border border-transparent'}"
                  >
                    {#if showOptimizedRank}
                      <Sparkles size={10} /> SEO Active
                    {:else}
                      <Shuffle size={10} /> Optimize Listing
                    {/if}
                  </button>
                </div>

                <div class="space-y-2 relative max-h-[190px] overflow-y-auto pr-1">
                  {#each listingsList as item (item.id)}
                    <div
                      animate:flip={{ duration: 400 }}
                      class="flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 {item.isUser ? (showOptimizedRank ? 'bg-teal-dark/30 border-teal-light/40 shadow-[0_0_12px_rgba(10,150,99,0.2)]' : 'bg-danger-bg/5 border-danger-light/10 opacity-75') : 'bg-white/[0.02] border-white/[0.04]'}"
                    >
                      <div class="flex items-center gap-3 min-w-0">
                        <span class="w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 {item.isUser ? (showOptimizedRank ? 'bg-teal text-white' : 'bg-danger text-white') : 'bg-white/10 text-white/60'}">
                          #{item.rank}
                        </span>
                        <div class="min-w-0">
                          <p class="font-medium leading-snug text-white/95 truncate text-[11px] max-w-[200px]">
                            {item.isUser && showOptimizedRank ? `Personalized ${demoKeyword} • Custom Gift...` : (item.isUser ? demoKeyword : item.title)}
                          </p>
                          <p class="text-[9px] text-white/50">{item.shop} • {item.price}</p>
                        </div>
                      </div>
                      
                      <div class="flex items-center gap-2 shrink-0">
                        {#if item.isUser}
                          <span class="badge-estimated !bg-white/10 !border-white/20 text-[9px] px-2 py-0.5 rounded-md !font-mono font-bold text-white/90" style="background-color: {item.scoreColor}">
                            {showOptimizedRank ? '96' : '42'} Score
                          </span>
                        {:else}
                          <span class="text-[10px] text-white/45 font-mono tabular-nums">{item.sales}</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works Section with smooth transition background -->
  <div class="bg-[#f4f8f6] border-t border-b border-border/40 relative z-10">
    <section id="how" class="relative max-w-5xl mx-auto px-6 py-20 scroll-mt-20 reveal">
      <div class="lp glow-teal opacity-5" aria-hidden="true"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <!-- Steps description on the left -->
        <div>
          <p class="section-kicker mb-1">How it works</p>
          <h2 class="text-3xl font-semibold tracking-tight text-text-primary mb-2 leading-tight">Shop to optimized, in three steps</h2>
          <p class="lead mb-10 max-w-xl text-sm">Built around your shop — not a dashboard of someone else's data.</p>
          <div class="steps-connector relative">
            <span class="connector-track" aria-hidden="true"></span>
            <span class="connector-fill" aria-hidden="true"></span>
            <div class="entry-list stagger space-y-4">
            {#each STEPS as step (step.n)}
              {@const Icon = step.icon}
              <div class="entry relative z-10 !bg-white hover:!bg-white/95 border border-border-light rounded-xl !p-5 flex items-start gap-4 transition-all hover:shadow-sm">
                <span class="w-9 h-9 rounded-full bg-teal/10 flex items-center justify-center shrink-0">
                  <Icon size={16} class="text-teal" />
                </span>
                <div class="flex-1 min-w-0">
                  <h3 class="text-sm font-semibold text-text-primary mb-1">{step.title}</h3>
                  <p class="text-xs text-text-secondary leading-relaxed">{step.body}</p>
                </div>
              </div>
            {/each}
            </div>
          </div>
        </div>

        <!-- Illustration on the right -->
        <div class="relative group animate-float">
          <div class="absolute inset-0 bg-gradient-to-tr from-teal/10 to-orange/5 blur-2xl rounded-2xl" aria-hidden="true"></div>
          <div class="relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg p-2 transition-transform duration-300 group-hover:scale-[1.01]">
            <img
              src="/etsy_artisan_desk.png"
              alt="VieRank Etsy artisan pottery workshop and shop analytics integration illustration"
              class="w-full h-auto rounded-xl"
            />
          </div>
        </div>
      </div>
    </section>
  </div>


  <!-- Device Freedom & No Extension Advantage Section -->
  <section class="max-w-5xl mx-auto px-6 py-20 reveal relative border-t border-border">
    <div class="glow-teal opacity-5" aria-hidden="true"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
      <!-- Image on the left -->
      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-tr from-teal/10 to-orange/5 blur-2xl rounded-2xl" aria-hidden="true"></div>
        <div class="relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg p-2 hover-mockup">
          <img
            src="/etsy_seo_growth.png"
            alt="VieRank Premium Etsy Shop growth analytics dashboard layout illustration"
            class="w-full h-auto rounded-xl"
          />
        </div>
      </div>
      
      <!-- Content on the right -->
      <div class="space-y-6">
        <span class="inline-flex items-center gap-1.5 section-kicker !text-teal font-semibold">
          <Smartphone size={15} /> Device Freedom
        </span>
        <h2 class="text-3xl font-semibold tracking-tight text-text-primary leading-tight" style="text-wrap: balance">
          Optimize your shop anywhere.<br />No desktop limits.
        </h2>
        <p class="text-text-secondary leading-relaxed text-[15px]">
          Unlike traditional tools that require a desktop Chrome Extension, VieRank is 100% cloud-based and responsive. Whether you are editing titles on your phone in the studio, checking keyword competition on your iPad, or auditing shops on desktop — everything works seamlessly in Safari, iOS, and Android.
        </p>
        <div class="grid grid-cols-2 gap-4 pt-2">
          <div class="premium-glass p-4 rounded-xl border border-white">
            <span class="block text-[10px] text-text-muted uppercase font-bold mb-1">No Desktop Lock-in</span>
            <p class="text-xs text-text-secondary leading-relaxed">Optimize tags on your iPad or phone during creative breaks.</p>
          </div>
          <div class="premium-glass p-4 rounded-xl border border-white">
            <span class="block text-[10px] text-text-muted uppercase font-bold mb-1">Secure OAuth Access</span>
            <p class="text-xs text-text-secondary leading-relaxed">Connects securely via Etsy's official OAuth without editing browser settings.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Keyword Mapping / Niche Intelligence Section with smooth cream background -->
  <div class="bg-[#faf9f6] border-t border-b border-border/40 relative z-10">
    <section class="max-w-5xl mx-auto px-6 py-20 reveal relative">
      <div class="glow-teal opacity-5" aria-hidden="true"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
      <!-- Content on the left -->
      <div class="space-y-6 order-2 md:order-1">
        <span class="inline-flex items-center gap-1.5 section-kicker !text-teal font-semibold">
          <Target size={15} /> Niche Intelligence
        </span>
        <h2 class="text-3xl font-semibold tracking-tight text-text-primary leading-tight" style="text-wrap: balance">
          Map high-volume keywords.<br />Discover hidden demand.
        </h2>
        <p class="text-text-secondary leading-relaxed text-[15px]">
          Stop guessing what keywords buyers type. VieRank analyzes autocomplete trajectories and search velocities to map keywords by opportunity. Identify high-demand search phrases that your competitors miss, and filter out saturated terms with high difficulty.
        </p>
        <div class="grid grid-cols-2 gap-4 pt-2">
          <div class="premium-glass p-4 rounded-xl border border-white">
            <span class="block text-[10px] text-text-muted uppercase font-bold mb-1">Keyword Clustering</span>
            <p class="text-xs text-text-secondary leading-relaxed">Group related search phrases to target comprehensive customer intent.</p>
          </div>
          <div class="premium-glass p-4 rounded-xl border border-white">
            <span class="block text-[10px] text-text-muted uppercase font-bold mb-1">Competition Analysis</span>
            <p class="text-xs text-text-secondary leading-relaxed">Filter out overly saturated tags to target high-probability conversions.</p>
          </div>
        </div>
      </div>

      <!-- Image on the right -->
      <div class="relative group order-1 md:order-2">
        <div class="absolute inset-0 bg-gradient-to-tr from-teal/10 to-orange/5 blur-2xl rounded-2xl" aria-hidden="true"></div>
        <div class="relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg p-2 hover-mockup">
          <img
            src="/etsy_keyword_map.png"
            alt="VieRank keyword clustering and niche search mapping dashboard illustration"
            class="w-full h-auto rounded-xl"
          />
        </div>
      </div>
    </div>
  </section>
  </div>

  <!-- Interactive Showcase & Toolkit Section (WOW Factor!) -->
  <section class="relative bg-bg-page border-y border-border py-24">
    <!-- Subtle glow behind showcase -->
    <div class="absolute top-1/2 left-10 w-96 h-96 rounded-full bg-teal/5 blur-[100px]" aria-hidden="true"></div>
    <div class="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-orange/5 blur-[100px]" aria-hidden="true"></div>

    <div class="max-w-5xl mx-auto px-6 reveal">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <p class="section-kicker mb-2">Interactive Showcase</p>
        <h2 class="text-3xl md:text-4xl font-semibold tracking-tight mb-4">Everything your listings need</h2>
        <p class="lead text-base">Your own listings come first. Tap a pillar below to preview how our workspace tools bring clarity to your storefront.</p>
      </div>

      <!-- Tab selectors (Modern Pill Group) -->
      <div class="flex justify-center mb-10">
        <div class="inline-flex bg-[#edf4f0] border border-border/40 p-1 rounded-2xl shadow-inner">
          {#each PILLARS as p (p.key)}
            {@const PillarIcon = p.icon}
            <button
              type="button"
              onclick={() => activePillarKey = p.key}
              class="px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 {activePillarKey === p.key ? 'bg-[#006241] text-white shadow-md' : 'text-[#2d3a33] hover:bg-[#e1eae5]/80 hover:text-[#006241]'}"
            >
              <PillarIcon size={16} />
              {p.title}
            </button>
          {/each}
        </div>
      </div>

      <!-- Showcase Display -->
      <div class="grid grid-cols-1 lg:grid-cols-[1.1fr_minmax(0,1fr)] gap-12 items-start min-h-[380px]">
        <!-- Left details panel -->
        <div class="space-y-6">
          <div class="flex items-center gap-3">
            <span class="w-9 h-9 rounded-xl flex items-center justify-center bg-teal/10">
              <ActiveIcon size={18} class="text-teal" />
            </span>
            <h3 class="text-2xl font-bold tracking-tight text-text-primary">{activePillar.title} Tools</h3>
          </div>
          <div class="h-[50px] flex items-center"><p class="text-[15px] text-text-secondary leading-relaxed">{activePillar.blurb}</p></div>
          
          <ul class="space-y-3 pt-2 min-h-[310px]">
            {#each activePillar.tools as t (t.name)}
              {@const TIcon = t.icon}
              <li class="premium-glass rounded-xl hover:bg-white hover:shadow-md transition-all">
                <a href={t.href} class="flex items-center gap-3.5 p-4 text-sm text-text-primary hover:text-teal transition-colors group">
                  <TIcon size={16} class="text-text-muted group-hover:text-teal transition-colors" />
                  <span class="font-semibold">{t.name}</span>
                  <ArrowRight size={15} class="ml-auto text-text-muted opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                </a>
              </li>
            {/each}
          </ul>
        </div>

        <!-- Right interactive mockup panel (Grid Stack to prevent layout jumps during Svelte transition overlap) -->
        <div class="grid grid-cols-1 grid-rows-1 relative z-10 min-h-[400px]">
          <div class="absolute inset-0 bg-gradient-to-br from-teal/5 to-orange/5 blur-xl rounded-2xl col-start-1 row-start-1" aria-hidden="true"></div>
          
          {#if activePillarKey === "Create"}
            <!-- Create Mockup with sub-tabs -->
            <div transition:fade={{ duration: 180 }} class="showcase-card premium-glass rounded-2xl p-6 shadow-xl border border-white col-start-1 row-start-1 h-full">
              <div class="flex items-center justify-between mb-4 pb-2 border-b border-border">
                <span class="text-xs font-bold text-text-muted flex items-center gap-1.5"><Sparkles size={12} class="text-teal" /> AI Listing Composer</span>
                <span class="badge-estimated !bg-teal/10 !border-teal/20 !text-teal text-[10px] px-2.5 py-0.5 rounded-full font-bold">96 Score</span>
              </div>
              
              <!-- Sub-tabs inside card -->
              <div class="flex border-b border-border-light mb-4 justify-start gap-4">
                {#each ["title", "tags", "description"] as sub}
                  <button
                    type="button"
                    onclick={() => showcaseCreateTab = sub}
                    class="pb-2 text-[11px] font-semibold transition-all relative uppercase tracking-wider {showcaseCreateTab === sub ? 'text-teal font-bold' : 'text-text-secondary hover:text-text-primary'}"
                  >
                    {sub}
                    {#if showcaseCreateTab === sub}
                      <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-teal"></div>
                    {/if}
                  </button>
                {/each}
              </div>

              {#if showcaseCreateTab === "title"}
                <div class="space-y-2.5 animate-fade-in">
                  <div class="text-[10px] text-text-muted font-medium">Draft title (Target: 120-140 chars)</div>
                  <div class="p-3 bg-bg-page/50 border border-border-light rounded-xl font-medium text-xs text-text-primary leading-relaxed">
                    Dainty Gold Name Necklace • Personalized Bridesmaid Gift • Custom Minimalist Name Jewelry for Her
                  </div>
                  <div class="flex items-center justify-between text-[11px] text-text-muted">
                    <span class="text-success font-semibold">Length optimized</span>
                    <span class="font-mono">118/140 characters</span>
                  </div>
                </div>
              {:else if showcaseCreateTab === "tags"}
                <div class="space-y-2.5 animate-fade-in">
                  <div class="text-[10px] text-text-muted font-medium">High-volume keywords matched (13/13 utilized)</div>
                  <div class="flex flex-wrap gap-1.5">
                    {#each ["gold name necklace", "bridesmaid gift", "dainty gold", "name necklace", "custom jewelry", "personalized gift", "gifts for her", "minimalist necklace"] as tag}
                      <span class="px-2.5 py-1 rounded-lg text-[10px] bg-teal/5 border border-teal/10 text-teal-dark font-medium">
                        {tag}
                      </span>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="space-y-2.5 animate-fade-in">
                  <div class="text-[10px] text-text-muted font-medium">Rich description intro (First 160 characters highlighted)</div>
                  <div class="p-3 bg-bg-page/50 border border-border-light rounded-xl text-xs text-text-secondary leading-relaxed">
                    This elegant <strong class="text-teal font-semibold font-medium">gold name necklace</strong> makes the perfect custom <strong class="text-teal font-semibold font-medium">bridesmaid gift</strong>. Handcrafted with fine materials, this <strong class="text-teal font-semibold font-medium">dainty gold</strong> piece is designed to be cherished...
                  </div>
                </div>
              {/if}
            </div>

          {:else if activePillarKey === "Optimize"}
            <!-- Optimize Mockup with Before/After Split Slider -->
            <div transition:fade={{ duration: 180 }} class="showcase-card premium-glass rounded-2xl p-6 shadow-xl border border-white space-y-4 col-start-1 row-start-1 h-full">
              <div class="flex items-center justify-between pb-2 border-b border-border">
                <span class="text-xs font-bold text-text-muted flex items-center gap-1.5"><FileText size={12} class="text-teal" /> Interactive Listing Slider</span>
                <span class="badge-estimated !bg-success/10 !border-success/20 !text-success text-[10px] px-2.5 py-0.5 rounded-full font-bold">Slide to Compare</span>
              </div>

              <div class="split-slider-container relative rounded-xl h-[260px] overflow-hidden border border-border shadow-inner">
                <!-- Overlay transparent range input for handle dragging -->
                <input
                  type="range"
                  min="0"
                  max="100"
                  bind:value={splitPercent}
                  class="split-slider-input"
                  aria-label="Before/After comparison slider"
                />

                <!-- Draggable handle bar -->
                <div class="slider-handle" style="--split-percent: {splitPercent}%">
                  <div class="slider-handle-button">
                    <Shuffle size={14} />
                  </div>
                </div>

                <!-- Background: BEFORE listing (poor quality) -->
                <div class="slider-before bg-[#fdf5f4] p-5 flex flex-col justify-between h-full text-[11px] select-none">
                  <div>
                    <div class="flex items-center justify-between mb-3 pb-1.5 border-b border-danger/10">
                      <span class="font-bold text-danger flex items-center gap-1"><HelpCircle size={12} /> Original Listing</span>
                      <span class="bg-danger-bg text-danger text-[9px] px-2 py-0.5 rounded font-mono font-bold">42 Score</span>
                    </div>
                    <div class="space-y-3">
                      <div>
                        <div class="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1">Etsy Listing Title</div>
                        <div class="p-2.5 bg-white border border-danger/10 rounded-lg text-text-secondary line-through italic">
                          Stoneware Mug
                        </div>
                      </div>
                      <div>
                        <div class="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1">Listing Tags (1/13 used)</div>
                        <div class="flex flex-wrap gap-1">
                          <span class="px-2 py-0.5 rounded bg-danger/5 border border-danger/15 text-danger font-medium">mug</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="text-[9px] text-danger/80 font-medium flex items-center gap-1">
                    <Info size={10} /> Missing key tags and title details. Rank is hidden on Page 3.
                  </div>
                </div>

                <!-- Foreground: AFTER listing (optimized quality, clipped by width) -->
                <div class="slider-after" style="--split-percent: {splitPercent}%">
                  <div class="slider-after-content bg-[#e8f5ed] p-5 flex flex-col justify-between h-[260px] text-[11px] select-none">
                    <div>
                      <div class="flex items-center justify-between mb-3 pb-1.5 border-b border-success/10">
                        <span class="font-bold text-success flex items-center gap-1"><BadgeCheck size={12} /> VieRank Optimized</span>
                        <span class="bg-success-bg text-success text-[9px] px-2 py-0.5 rounded font-mono font-bold">96 Score</span>
                      </div>
                      <div class="space-y-3">
                        <div>
                          <div class="text-[9px] text-teal-dark font-bold uppercase tracking-wider mb-1">SEO Optimized Title</div>
                          <div class="p-2.5 bg-white border border-success/15 rounded-lg text-text-primary font-bold leading-normal">
                            Personalized Ceramic Mug • Custom Gift for Coffee Lover • Speckled Stoneware Mug
                          </div>
                        </div>
                        <div>
                          <div class="text-[9px] text-teal-dark font-bold uppercase tracking-wider mb-1">High-Volume Tags (13/13 optimized)</div>
                          <div class="flex flex-wrap gap-1">
                            {#each ["ceramic mug", "pottery coffee mug", "handmade coffee cup", "stoneware mug"] as tag}
                              <span class="px-2 py-0.5 rounded bg-success/10 border border-success/20 text-success font-medium text-[9px]">
                                {tag}
                              </span>
                            {/each}
                            <span class="px-2 py-0.5 rounded bg-success/5 border border-success/10 text-success/70 font-medium text-[9px]">+9 more</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="text-[9px] text-success font-medium flex items-center gap-1">
                      <BadgeCheck size={10} /> Maximum search index matched · improves Page 1 potential.
                    </div>
                  </div>
                </div>
              </div>

              <p class="text-[11px] text-center text-text-secondary">
                ← Drag the slider back and forth to visually compare the SEO overhaul →
              </p>
            </div>

          {:else}
            <!-- Research Mockup with Niche Quadrant Scatter Plot -->
            <div transition:fade={{ duration: 180 }} class="showcase-card premium-glass rounded-2xl p-5 shadow-xl border border-white space-y-4 col-start-1 row-start-1 h-full">
              <div class="flex items-center justify-between pb-1.5 border-b border-border">
                <span class="text-xs font-bold text-text-muted flex items-center gap-1.5"><Store size={12} class="text-teal" /> Niche Opportunity Matrix</span>
                <span class="badge-estimated !bg-orange/10 !border-orange/20 !text-orange-dark inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold">Click a Bubble</span>
              </div>

              <!-- 2D Scatter plot quadrant chart -->
              <div class="niche-matrix">
                <!-- Quadrants background labels -->
                <div class="niche-quadrant quadrant-tl">
                  <span class="niche-quadrant-title">Hidden Gems</span>
                </div>
                <div class="niche-quadrant quadrant-tr" style="left: 50%;">
                  <span class="niche-quadrant-title">Oversaturated</span>
                </div>
                <div class="niche-quadrant quadrant-bl" style="top: 50%;">
                  <span class="niche-quadrant-title">Low Value</span>
                </div>
                <div class="niche-quadrant quadrant-br" style="top: 50%; left: 50%;">
                  <span class="niche-quadrant-title">Uphill Battle</span>
                </div>

                <!-- Grid axes labels -->
                <div class="niche-matrix-axis-y">Demand</div>
                <div class="niche-matrix-axis-x">Competition</div>

                <!-- Interactive Bubbles -->
                <button
                  type="button"
                  onclick={() => selectedNicheKey = "earrings"}
                  class="niche-bubble {selectedNicheKey === 'earrings' ? 'active' : ''}"
                  style="left: 22%; top: 16%;"
                >
                  <span class="niche-dot niche-dot-green"></span>Clay Earrings
                </button>
                
                <button
                  type="button"
                  onclick={() => selectedNicheKey = "planners"}
                  class="niche-bubble {selectedNicheKey === 'planners' ? 'active' : ''}"
                  style="left: 88%; top: 8%;"
                >
                  <span class="niche-dot niche-dot-orange"></span>Planners
                </button>

                <button
                  type="button"
                  onclick={() => selectedNicheKey = "mugs"}
                  class="niche-bubble {selectedNicheKey === 'mugs' ? 'active' : ''}"
                  style="left: 35%; top: 22%;"
                >
                  <span class="niche-dot niche-dot-green"></span>Custom Mugs
                </button>

                <button
                  type="button"
                  onclick={() => selectedNicheKey = "bookmarks"}
                  class="niche-bubble {selectedNicheKey === 'bookmarks' ? 'active' : ''}"
                  style="left: 15%; top: 62%;"
                >
                  <span class="niche-dot niche-dot-gray"></span>Bookmarks
                </button>

                <button
                  type="button"
                  onclick={() => selectedNicheKey = "bracelets"}
                  class="niche-bubble {selectedNicheKey === 'bracelets' ? 'active' : ''}"
                  style="left: 94%; top: 48%;"
                >
                  <span class="niche-dot niche-dot-red"></span>Bracelets
                </button>
              </div>

              <!-- Selected Niche Scorecard Details -->
              <div class="p-3 bg-white/40 border border-border rounded-xl space-y-2.5 animate-fade-in text-xs">
                <div class="flex items-center justify-between pb-1 border-b border-border-light">
                  <h4 class="font-bold text-text-primary text-[13px]">{activeNiche.name}</h4>
                  <span class="badge-estimated !bg-teal/10 !border-teal/20 !text-teal text-[10px] px-2 py-0.5 rounded font-bold">
                    {activeNiche.opportunityScore} Opportunity
                  </span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-[11px] text-text-secondary">
                  <div>
                    <span class="block text-[10px] text-text-muted uppercase font-semibold">Volume (Est)</span>
                    <span class="font-bold text-text-primary">{activeNiche.volume}</span>
                  </div>
                  <div>
                    <span class="block text-[10px] text-text-muted uppercase font-semibold">Competition</span>
                    <span class="font-bold text-text-primary">{activeNiche.competition}</span>
                  </div>
                </div>

                <div class="space-y-1">
                  <div class="text-[9px] text-text-muted uppercase font-bold">SEO Strategy Checklist</div>
                  <ul class="space-y-1 text-[11px] text-text-secondary list-disc pl-4 leading-snug">
                    {#each activeNiche.tips as tip}
                      <li>{tip}</li>
                    {/each}
                  </ul>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- Built Honest / Ethical Data Section -->
  <section class="max-w-5xl mx-auto px-6 py-24 reveal relative">
    <div class="glow-gold opacity-5" aria-hidden="true"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
      <div>
        <span class="inline-flex items-center gap-1.5 section-kicker !text-teal font-semibold mb-3">
          <BadgeCheck size={16} /> Built honest
        </span>
        <h2 class="text-3xl md:text-[2.2rem] font-semibold leading-tight tracking-tight mb-5" style="text-wrap: balance">
          No magic numbers.<br />No tall promises.
        </h2>
        <p class="text-text-secondary leading-relaxed mb-7 text-[15px]">
          Most SEO tools dress guesses up as facts. We don't. Search volume and demand are <em>estimates</em>, and we say so — every time. The figures we pull straight from Etsy — your reviews, sales, shop stats — are shown as real. You always know which is which.
        </p>
        <ul class="flex flex-col gap-3.5">
          {#each [
            "Every estimate carries an honest badge",
            "Real Etsy data shown as real, never dressed up",
            "Works on your own shop — your data stays yours"
          ] as line}
            <li class="flex items-start gap-3 text-sm text-text-primary font-medium">
              <Check size={18} class="text-teal shrink-0 mt-0.5" />
              <span>{line}</span>
            </li>
          {/each}
        </ul>
      </div>
      
      <!-- Image on the right -->
      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-tr from-teal/10 to-orange/5 blur-2xl rounded-2xl" aria-hidden="true"></div>
        <div class="relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg p-2 transition-transform duration-300 group-hover:scale-[1.01]">
          <img
            src="/etsy_listing_audit.png"
            alt="VieRank Etsy listing SEO audit scoring dashboard illustration"
            class="w-full h-auto rounded-xl"
          />
        </div>
      </div>
    </div>
  </section>

  <!-- Interactive ROI & Opportunity Calculator Section -->
  <section class="max-w-5xl mx-auto px-6 py-24 reveal relative">
    <div class="glow-teal opacity-5" aria-hidden="true"></div>
    <div class="text-center max-w-2xl mx-auto mb-16">
      <p class="section-kicker mb-2">Value Calculator</p>
      <h2 class="text-3xl md:text-4xl font-semibold tracking-tight mb-4">Calculate your optimization impact</h2>
      <p class="lead text-base">Moving from manual edits or guessing to a dedicated workflow saves hours and highlights actual improvements.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1.1fr_minmax(0,1fr)] gap-14 items-center">
      <!-- Sliders Column -->
      <div class="space-y-8 bg-white p-8 rounded-2xl border border-border">
        <div>
          <div class="flex justify-between items-center text-sm font-semibold mb-3">
            <span class="text-text-primary">Your active listings</span>
            <span class="text-teal font-mono text-base font-bold">{calcListings} listings</span>
          </div>
          <input
            type="range"
            min="10"
            max="500"
            step="5"
            bind:value={calcListings}
            class="w-full accent-teal"
          />
          <div class="flex justify-between text-[11px] text-text-muted mt-2">
            <span>10 listings</span>
            <span>250 listings</span>
            <span>500+ listings</span>
          </div>
        </div>

        <div>
          <div class="flex justify-between items-center text-sm font-semibold mb-3">
            <span class="text-text-primary">Manual optimization time per listing</span>
            <span class="text-teal font-mono text-base font-bold">{calcMinutes} minutes</span>
          </div>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            bind:value={calcMinutes}
            class="w-full accent-teal"
          />
          <div class="flex justify-between text-[11px] text-text-muted mt-2">
            <span>5 mins (Quick edit)</span>
            <span>60 mins</span>
            <span>120 mins (Full overhaul)</span>
          </div>
        </div>
      </div>

      <!-- Output Metrics Cards -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Card 1 -->
        <div class="premium-glass p-6 rounded-2xl border border-white">
          <p class="text-[11px] text-text-muted font-bold uppercase tracking-wider mb-2">Time Saved</p>
          <div class="text-4xl font-extrabold font-mono tracking-tight flex items-baseline mb-1">
            <span class="bg-gradient-to-r from-[#006241] to-[#0a9663] bg-clip-text text-transparent">{hoursSaved}h</span>
            <span class="text-xs font-normal text-text-secondary ml-1">/mo</span>
          </div>
          <p class="text-[11px] text-text-secondary leading-relaxed">Replaced by automated checks & drafts</p>
        </div>

        <!-- Card 2 -->
        <div class="premium-glass p-6 rounded-2xl border border-white">
          <p class="text-[11px] text-text-muted font-bold uppercase tracking-wider mb-2">SEO Traffic Boost</p>
          <div class="text-4xl font-extrabold font-mono tracking-tight flex items-baseline mb-1">
            <span class="bg-gradient-to-r from-[#006241] to-[#0a9663] bg-clip-text text-transparent">+{seoBoost}%</span>
          </div>
          <p class="text-[11px] text-text-secondary leading-relaxed">Estimated increase in visibility metrics</p>
        </div>

        <!-- Card 3 -->
        <div class="premium-glass p-6 rounded-2xl border border-white">
          <p class="text-[11px] text-text-muted font-bold uppercase tracking-wider mb-2">Value Created</p>
          <div class="text-4xl font-extrabold font-mono tracking-tight flex items-baseline mb-1">
            <span class="bg-gradient-to-r from-[#b8860b] to-[#cba258] bg-clip-text text-transparent">${opportunityValue}</span>
            <span class="text-xs font-normal text-text-secondary ml-1">/mo</span>
          </div>
          <p class="text-[11px] text-text-secondary leading-relaxed">Estimated search opportunity values</p>
        </div>

        <!-- Card 4 -->
        <div class="premium-glass p-6 rounded-2xl border border-white flex flex-col justify-between">
          <div>
            <p class="text-[11px] text-text-muted font-bold uppercase tracking-wider mb-2">VieRank Cost</p>
            <div class="text-4xl font-extrabold font-mono tracking-tight flex items-baseline mb-1">
              <span class="bg-gradient-to-r from-[#006241] to-[#0a9663] bg-clip-text text-transparent">$9.99</span>
              <span class="text-xs font-normal text-text-secondary ml-1">/mo</span>
            </div>
          </div>
          <p class="text-[11px] text-text-secondary leading-relaxed pt-1">Return value: {Math.round(opportunityValue / 9.99)}x cost</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing Preview Section -->
  <section class="bg-bg-page border-y border-border py-24 relative">
    <div class="max-w-4xl mx-auto px-6 reveal">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <p class="section-kicker mb-2">Pricing</p>
        <h2 class="text-3xl md:text-4xl font-semibold tracking-tight mb-4">Pricing that grows with your shop</h2>
        <p class="lead text-base">Start free. Upgrade when the shop is ready, not before.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-left items-stretch">
        <!-- Plan 1 -->
        <div class="premium-glass p-7 rounded-2xl flex flex-col justify-between hover-lift border border-white">
          <div>
            <h3 class="font-bold text-lg text-text-primary mb-1">Free</h3>
            <div class="text-4xl font-semibold text-text-primary mb-2">$0</div>
            <p class="text-xs text-text-secondary leading-relaxed mb-6">To try it on your shop. Zero risk, 30 free credits included. No credit card required.</p>
          </div>
          <a href="/auth/signup" class="btn btn-secondary w-full justify-center text-sm py-2.5 font-semibold">Get started</a>
        </div>
        
        <!-- Plan 2 (Popular) -->
        <div class="premium-glass p-7 rounded-2xl flex flex-col justify-between hover-lift border-2 border-[#006241] relative shadow-xl md:scale-[1.04] md:-translate-y-2 z-10 bg-white/95">
          <span class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 text-white text-[10px] font-bold rounded-full uppercase tracking-wider bg-teal shadow-sm">Most popular</span>
          <div>
            <h3 class="font-bold text-lg text-text-primary mb-1">Business</h3>
            <div class="text-4xl font-semibold text-text-primary mb-2">$12.99<span class="text-xs font-normal text-text-secondary">/mo</span></div>
            <p class="text-xs text-text-secondary leading-relaxed mb-6">For growing shops. 3,000 monthly credits, 10 shop links, 50 tracked listings, and VieRank AI Assistant.</p>
          </div>
          <a href="/auth/signup" class="btn btn-primary btn-glow w-full justify-center text-sm py-2.5 font-bold">Get Business</a>
        </div>
        
        <!-- Plan 3 -->
        <div class="premium-glass p-7 rounded-2xl flex flex-col justify-between hover-lift border border-white">
          <div>
            <h3 class="font-bold text-lg text-text-primary mb-1">Enterprise</h3>
            <div class="text-4xl font-semibold text-text-primary mb-2">$49.99<span class="text-xs font-normal text-text-secondary">/mo</span></div>
            <p class="text-xs text-text-secondary leading-relaxed mb-6">For power sellers. 9,000 monthly credits, 25 shop links, 200 tracked listings, and VieRank AI Assistant.</p>
          </div>
          <a href="/auth/signup" class="btn btn-secondary w-full justify-center text-sm py-2.5 font-semibold">Get Enterprise</a>
        </div>
      </div>
      
      <div class="text-center mt-10">
        <a href="/pricing" class="copy-link inline-flex items-center gap-1.5 !text-teal font-semibold text-sm">
          Compare all plans and credits <ArrowRight size={14} />
        </a>
      </div>
    </div>
  </section>

  <!-- Competitor Comparison Section -->
  <section class="max-w-5xl mx-auto px-6 py-24 reveal relative border-t border-border">
    <div class="glow-teal opacity-5" aria-hidden="true"></div>
    <div class="text-center max-w-2xl mx-auto mb-16">
      <p class="section-kicker mb-2">Compare Tools</p>
      <h2 class="text-3xl font-semibold tracking-tight text-text-primary">How we compare with other Etsy SEO tools</h2>
      <p class="lead text-base mt-2">We believe in transparent features, honest pricing, and clear data indexing.</p>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-border shadow-sm bg-white">
      <table class="comparison-table w-full text-left border-collapse text-sm">
        <thead>
          <tr class="bg-bg-page border-b border-border text-text-secondary font-semibold text-xs">
            <th class="p-4 md:p-5">Features & Services</th>
            <th class="p-4 md:p-5 text-center text-teal-dark font-bold bg-teal/5">VieRank</th>
            <th class="p-4 md:p-5 text-center">Chrome Extensions</th>
            <th class="p-4 md:p-5 text-center">Legacy Platforms</th>
            <th class="p-4 md:p-5 text-center">Spreadsheet Tools</th>
            <th class="p-4 md:p-5 text-center">Static Tools</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light text-[13px]">
          <tr>
            <td class="p-4 md:p-5 font-semibold text-text-primary">Monthly Pricing</td>
            <td class="p-4 md:p-5 text-center font-bold text-teal bg-teal/5">Free – $7.99+</td>
            <td class="p-4 md:p-5 text-center text-text-secondary">$29.99</td>
            <td class="p-4 md:p-5 text-center text-text-secondary">$29.00</td>
            <td class="p-4 md:p-5 text-center text-text-secondary">$9.99 - $29.99</td>
            <td class="p-4 md:p-5 text-center text-text-secondary">$19.00</td>
          </tr>
          <tr>
            <td class="p-4 md:p-5 font-semibold text-text-primary">Honesty Labeling (Estimated vs Real)</td>
            <td class="p-4 md:p-5 text-center bg-teal/5"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
          </tr>
          <tr>
            <td class="p-4 md:p-5 font-semibold text-text-primary">
              Direct Shop Auto-Optimization (No copy-paste)
              <span class="block text-[11px] font-normal text-text-muted mt-0.5">Once Etsy approves write access</span>
            </td>
            <td class="p-4 md:p-5 text-center bg-teal/5"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
          </tr>
          <tr>
            <td class="p-4 md:p-5 font-semibold text-text-primary">AI Content Writer (Title, Tags, Desc)</td>
            <td class="p-4 md:p-5 text-center bg-teal/5"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
            <td class="p-4 md:p-5 text-center text-text-muted">—</td>
          </tr>
          <tr>
            <td class="p-4 md:p-5 font-semibold text-text-primary">Mobile Friendly (No browser extension needed)</td>
            <td class="p-4 md:p-5 text-center bg-teal/5"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center text-text-muted">Extension only</td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
          </tr>
          <tr>
            <td class="p-4 md:p-5 font-semibold text-text-primary">Keyword Search & Niche Analysis</td>
            <td class="p-4 md:p-5 text-center bg-teal/5"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
            <td class="p-4 md:p-5 text-center"><Check size={16} class="mx-auto text-success" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-center text-[11px] text-text-muted mt-4 max-w-2xl mx-auto">
      Comparison uses common third-party tool categories, not specific brands. Prices shown are as of Jul 2026, based on publicly listed plans and subject to change.
    </p>
  </section>

  <!-- Testimonials Section -->
  <section class="max-w-4xl mx-auto px-6 py-20 reveal relative z-10">
    <div class="glow-gold opacity-5" aria-hidden="true"></div>
    <div class="text-center max-w-2xl mx-auto mb-12">
      <p class="section-kicker mb-2">What we stand for</p>
      <h2 class="text-3xl font-semibold tracking-tight text-text-primary">Built on honesty, not hype</h2>
    </div>

    <!-- Testimonials slider container -->
    <div class="relative overflow-hidden premium-glass p-8 md:p-12 pb-16 md:pb-20 rounded-2xl border border-white max-w-3xl mx-auto">
      <div class="carousel-container min-h-[140px]">
        <div class="carousel-track" style="transform: translateX(-{testimonialIndex * (100 / TESTIMONIALS.length)}%); width: {TESTIMONIALS.length * 100}%;">
          {#each TESTIMONIALS as item}
            <div class="w-full shrink-0 px-2 flex flex-col justify-between" style="width: {100 / TESTIMONIALS.length}%;">
              <blockquote class="text-[16px] md:text-[18px] text-text-primary italic font-medium leading-relaxed mb-6">
                "{item.quote}"
              </blockquote>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-teal-dark flex items-center justify-center text-white shrink-0">
                  <BadgeCheck size={18} />
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-text-primary">{item.title}</h4>
                  <p class="text-[11px] text-text-secondary">{item.sub}</p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Navigation buttons -->
      <div class="absolute right-6 bottom-6 flex items-center gap-2">
        <button
          type="button"
          onclick={prevTestimonial}
          class="w-8 h-8 rounded-full border border-border bg-white flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-teal transition-all"
          aria-label="Previous testimonial"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onclick={nextTestimonial}
          class="w-8 h-8 rounded-full border border-border bg-white flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-teal transition-all"
          aria-label="Next testimonial"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  </section>

  <!-- FAQ Section -->
  <section class="max-w-3xl mx-auto px-6 py-24 reveal relative border-t border-border">
    <div class="text-center max-w-2xl mx-auto mb-14">
      <p class="section-kicker mb-2">Support</p>
      <h2 class="text-3xl font-semibold tracking-tight text-text-primary">Frequently Asked Questions</h2>
      <p class="lead text-base mt-2">Find quick answers to common queries about shop security, credits, and metrics accuracy.</p>
    </div>

    <!-- Search Input -->
    <div class="mb-8 max-w-md mx-auto">
      <div class="field-wrap">
        <Search size={16} class="field-affix" />
        <input
          type="text"
          bind:value={faqSearch}
          placeholder="Search questions or keywords..."
          class="field"
        />
      </div>
    </div>

    <!-- Accordions -->
    <div class="space-y-4">
      {#if filteredFaqs.length > 0}
        {#each filteredFaqs as faq, idx (faq.q)}
          <div class="premium-glass rounded-xl border border-border overflow-hidden transition-all">
            <button
              type="button"
              onclick={() => toggleFaq(idx)}
              class="w-full text-left p-5 font-semibold text-text-primary text-[15px] flex justify-between items-center hover:bg-bg-page/40 transition-colors"
            >
              <span>{faq.q}</span>
              <span class="text-text-muted transition-transform duration-200" style="transform: rotate({openFaqIndex === idx ? '180deg' : '0deg'})">
                <ChevronRight size={18} />
              </span>
            </button>
            
            {#if openFaqIndex === idx}
              <div transition:slide={{ duration: 240 }} class="px-5 pb-5 text-sm text-text-secondary leading-relaxed border-t border-border-light pt-3 bg-white/30">
                {faq.a}
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <div class="text-center py-10 text-text-muted">
          No matching questions found for "{faqSearch}"
        </div>
      {/if}
    </div>
  </section>

  <!-- Final Call to Action -->
  <section class="max-w-3xl mx-auto px-6 py-28 reveal text-center relative z-10">
    <h2 class="text-3xl md:text-[2.5rem] font-semibold leading-tight tracking-tight mb-4" style="text-wrap: balance">Start on your listings today</h2>
    <p class="lead mb-9 max-w-lg mx-auto">Connect your Etsy shop and get your first suggestions in a few minutes.</p>
    <a href="/auth/signup" class="btn btn-primary btn-glow text-base !px-10 !py-3 hover-lift font-bold">
      Start free <ArrowRight size={18} class="ml-1.5" />
    </a>
    <p class="text-sm text-text-muted mt-5">No credit card required. Cancel anytime.</p>
  </section>

  <!-- Footer -->
  <MarketingFooter />

  <!-- Walkthrough Lightbox Modal -->
  {#if showVideoModal}
    <div class="modal-backdrop animate-fade-in" onclick={() => showVideoModal = false} role="presentation">
      <div class="modal-content relative p-6 max-w-2xl w-full" onclick={(e) => e.stopPropagation()} role="presentation">
        <button
          type="button"
          onclick={() => showVideoModal = false}
          class="modal-close"
          aria-label="Close walkthrough"
        >
          <X size={18} />
        </button>
        <div class="text-center mb-4 pt-4">
          <h3 class="text-lg font-bold text-text-primary flex items-center justify-center gap-2">
            <Play size={16} class="text-teal" fill="var(--teal)" /> VieRank SEO Walkthrough
          </h3>
          <p class="text-xs text-text-secondary mt-1">See how easy it is to link your shop and optimize listings in 60 seconds.</p>
        </div>
        <!-- High-fidelity mockup representing a video screen -->
        <div class="rounded-xl overflow-hidden border border-border aspect-video bg-[#0c110f] relative flex flex-col justify-between p-6 text-white select-none">
          <div class="flex items-center justify-between pb-3 border-b border-white/10">
            <span class="text-[11px] font-mono text-teal-light font-bold">▶ LIVE DEMO RUNTIME</span>
            <span class="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/85">0:32 / 1:00</span>
          </div>
          <div class="flex-1 flex flex-col items-center justify-center space-y-4 my-8">
            <!-- Simulated mouse pointer hover -->
            <div class="relative scale-110">
              <span class="w-16 h-16 rounded-full bg-teal/20 absolute -top-4 -left-4 animate-ping"></span>
              <button class="btn btn-primary btn-glow !py-2.5 !px-6 text-xs flex items-center gap-1.5 shadow-lg relative z-10 cursor-none">
                <Sparkles size={13} /> Synchronize Etsy Shop
              </button>
            </div>
            <p class="text-xs text-white/70 italic font-mono">Simulating shop link & initial listing audit scan...</p>
          </div>
          <div class="flex items-center justify-between text-[11px] text-white/50 border-t border-white/10 pt-3">
            <span>Client OAuth Safe Pipeline</span>
            <span class="flex items-center gap-1.5 text-teal-light font-semibold"><Lock size={12} fill="var(--teal-light)" /> SSL Encrypted</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .orbit-butterfly-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .orbit-butterfly {
    position: absolute;
    offset-path: path("M -100 400 C 200 200, 500 550, 800 300 S 1100 450, 1300 350");
    animation: fly-orbit 18s linear infinite;
    transform-origin: center;
    opacity: 0;
  }
  @keyframes fly-orbit {
    0% { offset-distance: 0%; opacity: 0; }
    5% { opacity: 0.22; }
    90% { opacity: 0.22; }
    100% { offset-distance: 100%; opacity: 0; }
  }

  .animate-float {
    animation: float-anim 5.5s ease-in-out infinite;
  }
  @keyframes float-anim {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-7px); }
  }

  .hover-mockup {
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;
  }
  .hover-mockup:hover {
    transform: scale(1.02) translateY(-4px);
    box-shadow: 0 20px 40px rgba(0, 98, 65, 0.12);
  }
</style>




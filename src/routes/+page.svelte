<script lang="ts">
  import { Star, ArrowRight, Layers, ChartColumn, Target, Tag, Crown, FileText, UserCheck, TrendingUp, Calculator, Type, AlignLeft, Video, Search, Wand, MessageSquare } from "lucide-svelte";

  const STATS = [
    { value: "500K+", label: "Sellers trust HeroRank" },
    { value: "10M+", label: "Listings optimized" },
    { value: "98%", label: "Customer satisfaction" },
    { value: "127", label: "Countries served" },
  ];

  const TOOLS = [
    { name: "Shop Analyzer", desc: "See exactly what's lifting your shop.", href: "/tools/etsy/shop-analyzer", icon: ChartColumn },
    { name: "Etsy Trends", desc: "Track what's rising before it peaks.", href: "/tools/etsy/etsy-trends", icon: TrendingUp },
    { name: "Niche Finder", desc: "Spot underserved niches with real demand.", href: "/tools/etsy/niche-finder", icon: Target },
    { name: "Tag Generator", desc: "Uncover tags that boost visibility.", href: "/tools/etsy/tag-generator", icon: Tag },
    { name: "Best Sellers", desc: "Break down what the top shops do differently.", href: "/tools/etsy/best-sellers", icon: Crown },
    { name: "Listing Analyzer", desc: "Grade listings with a clear action plan.", href: "/tools/etsy/listing-analyzer", icon: FileText },
    { name: "Buyer Check", desc: "Know who you're selling to upfront.", href: "/tools/etsy/buyer-check", icon: UserCheck },
    { name: "Rank Check", desc: "Track where your listings show up.", href: "/tools/etsy/rank-check", icon: TrendingUp },
    { name: "Calculator", desc: "Know your margins before you list.", href: "/tools/etsy/profit-calculator", icon: Calculator },
    { name: "Title Generator", desc: "Write titles that win clicks fast.", href: "/tools/etsy/title-generator", icon: Type },
    { name: "Description Generator", desc: "Generate descriptions that sell.", href: "/tools/etsy/description-generator", icon: AlignLeft },
    { name: "Video Generator", desc: "Turn product photos into scroll-stopping videos.", href: "/tools/etsy/video-generator", icon: Video },
    { name: "Keyword Generator", desc: "Discover keywords that match buyers.", href: "/tools/keyword-generator", icon: Search },
    { name: "Listing Studio", desc: "Build complete listings from photos.", href: "/tools/etsy/listing-studio", icon: Wand },
    { name: "HeroRank AI", desc: "Your Etsy selling assistant.", href: "/tools/rankhero-ai", icon: MessageSquare },
  ];

  const TESTIMONIALS = [
    { name: "Ewa B.", role: "Handmade Jewelry", text: "HeroRank made SEO finally make sense. I finally knew what to work on, and the results followed." },
    { name: "Jake D.", role: "3D Prints", text: "The tag generator alone has been worth every penny." },
    { name: "Tina L.", role: "Digital Products", text: "In your toolkit you need to have a research tool, and HeroRank is wonderful." },
    { name: "Tom L.", role: "Print on Demand", text: "Finally, an SEO tool that doesn't overwhelm me. Simple, effective, and affordable. I actually look forward to optimizing my listings now." },
  ];
</script>

<div class="min-h-screen bg-white">
  <!-- Nav -->
  <nav class="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border/50">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
      <a href="/" class="flex items-center gap-2">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center">
          <Layers size={18} class="text-white" />
        </div>
        <span class="text-xl font-bold text-navy">HeroRank</span>
      </a>
      <div class="flex items-center gap-3">
        <a href="/auth/login" class="px-4 py-2 text-sm font-medium text-text-primary hover:text-teal transition-colors">Log in</a>
        <a href="/auth/signup" class="px-5 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all" style="background: var(--navy)">Start Free</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="pt-32 pb-20 px-6">
    <div class="max-w-4xl mx-auto text-center">
      <h1 class="text-5xl md:text-6xl font-bold text-navy leading-tight mb-6">
        Your Etsy work deserves<br />
        <span class="text-teal">to be discovered.</span>
      </h1>
      <p class="text-lg text-text-secondary max-w-2xl mx-auto mb-8">
        Our creator-friendly SEO hub helps your work stand out, so you can grow your shop with confidence.
      </p>
      <div class="flex items-center justify-center gap-4">
        <a href="/auth/signup" class="px-8 py-3 rounded-lg text-base font-semibold text-white hover:opacity-90 transition-all flex items-center gap-2" style="background: var(--navy)">
          Start Free <ArrowRight size={16} />
        </a>
        <a href="/tools/etsy/tag-generator" class="px-8 py-3 rounded-lg text-base font-semibold text-navy border-2 border-navy hover:bg-navy/5 transition-colors">
          Try Tools
        </a>
      </div>
    </div>
  </section>

  <!-- Stats -->
  <section class="pb-20 px-6">
    <div class="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
      {#each STATS as s (s.label)}
        <div class="text-center p-6 rounded-xl bg-bg-page border border-border">
          <div class="text-3xl font-bold text-navy mb-1">{s.value}</div>
          <div class="text-sm text-text-muted">{s.label}</div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Features -->
  <section class="pb-20 px-6 bg-bg-page">
    <div class="max-w-6xl mx-auto py-16">
      <h2 class="text-3xl font-bold text-navy text-center mb-2">Built to Work Together</h2>
      <p class="text-text-secondary text-center mb-12">More views. More buyers. More time to create.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each TOOLS as tool (tool.name)}
          {@const Icon = tool.icon}
          <a href={tool.href} class="bg-white rounded-xl p-5 border border-border hover:border-teal/30 hover:shadow-md transition-all group">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center group-hover:bg-teal/20 transition-colors">
                <Icon size={16} class="text-teal" />
              </div>
              <h3 class="text-sm font-bold text-text-primary">{tool.name}</h3>
            </div>
            <p class="text-xs text-text-secondary">{tool.desc}</p>
          </a>
        {/each}
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section class="py-20 px-6">
    <div class="max-w-5xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {#each TESTIMONIALS as t (t.name)}
          <div class="p-6 rounded-xl border border-border bg-white">
            <div class="flex gap-0.5 mb-3">
              {#each [1, 2, 3, 4, 5] as s (s)}
                <Star size={14} class="text-warning fill-warning" />
              {/each}
            </div>
            <p class="text-sm text-text-secondary mb-4 italic">&ldquo;{t.text}&rdquo;</p>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-sm font-bold text-teal">{t.name.charAt(0)}</div>
              <div>
                <div class="text-sm font-semibold text-text-primary">{t.name}</div>
                <div class="text-xs text-text-muted">{t.role}</div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Pricing Preview -->
  <section class="py-20 px-6 bg-bg-page">
    <div class="max-w-4xl mx-auto text-center">
      <h2 class="text-3xl font-bold text-navy mb-2">Priced to grow with your shop</h2>
      <p class="text-text-secondary mb-10">HeroRank makes SEO accessible for every Etsy seller, not just big shops or big budgets.</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-xl p-6 border border-border">
          <h3 class="text-lg font-bold text-text-primary mb-1">Free</h3>
          <div class="text-3xl font-bold text-navy mb-1">$0</div>
          <p class="text-xs text-text-muted mb-4">3 searches/day</p>
          <a href="/auth/signup" class="block w-full py-2 rounded-lg text-sm font-semibold text-navy border-2 border-navy hover:bg-navy/5 transition-colors text-center">Get started</a>
        </div>
        <div class="bg-white rounded-xl p-6 border-2 border-teal relative">
          <span class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-teal text-white text-xs font-semibold rounded-full">Most Popular</span>
          <h3 class="text-lg font-bold text-text-primary mb-1">Business</h3>
          <div class="text-3xl font-bold text-navy mb-1">$9.99<span class="text-sm font-normal text-text-muted">/mo</span></div>
          <p class="text-xs text-text-muted mb-4">All tools unlocked</p>
          <a href="/auth/signup" class="block w-full py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all text-center" style="background: var(--navy)">Get Business</a>
        </div>
        <div class="bg-white rounded-xl p-6 border border-border">
          <h3 class="text-lg font-bold text-text-primary mb-1">Enterprise</h3>
          <div class="text-3xl font-bold text-navy mb-1">$29.99<span class="text-sm font-normal text-text-muted">/mo</span></div>
          <p class="text-xs text-text-muted mb-4">Large scale</p>
          <a href="/auth/signup" class="block w-full py-2 rounded-lg text-sm font-semibold text-navy border-2 border-navy hover:bg-navy/5 transition-colors text-center">Get Enterprise</a>
        </div>
      </div>
      <a href="/pricing" class="inline-block mt-6 text-sm text-teal font-semibold hover:underline">Compare all plans →</a>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-20 px-6">
    <div class="max-w-3xl mx-auto text-center">
      <h2 class="text-3xl font-bold text-navy mb-4">Ready to stand out?</h2>
      <p class="text-text-secondary mb-8">Join 500,000+ Etsy sellers growing with HeroRank.</p>
      <a href="/auth/signup" class="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-base font-semibold text-white hover:opacity-90" style="background: var(--navy)">
        Start Free <ArrowRight size={16} />
      </a>
      <p class="text-xs text-text-muted mt-3">No credit card required</p>
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-border py-10 px-6">
    <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center"><Layers size={14} class="text-white" /></div>
        <span class="text-lg font-bold text-navy">HeroRank</span>
      </div>
      <div class="flex items-center gap-6 text-sm text-text-muted">
        <a href="#" class="hover:text-text-primary">About</a>
        <a href="#" class="hover:text-text-primary">Blog</a>
        <a href="#" class="hover:text-text-primary">Terms</a>
        <a href="#" class="hover:text-text-primary">Privacy</a>
        <a href="#" class="hover:text-text-primary">Contact</a>
      </div>
      <p class="text-xs text-text-muted">© 2026 HeroRank. All rights reserved.</p>
    </div>
  </footer>
</div>

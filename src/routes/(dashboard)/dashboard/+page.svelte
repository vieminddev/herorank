<script lang="ts">
  import {
    Crown,
    TrendingUp,
    Compass,
    Store,
    FileText,
    UserCheck,
    ChartColumn,
    Calculator,
    Tag,
    Type,
    AlignLeft,
    Wand,
    Video,
    MessageSquare,
    Search,
    ArrowRight,
  } from "lucide-svelte";

  const toolGroups = [
    {
      title: "Brainstorm",
      description: "Research trends and find winning niches",
      tools: [
        { name: "Best Sellers", href: "/tools/etsy/best-sellers", icon: Crown, desc: "Top-performing shops & listings" },
        { name: "Etsy Trends", href: "/tools/etsy/etsy-trends", icon: TrendingUp, desc: "Trending keywords & categories" },
        { name: "Niche Finder", href: "/tools/etsy/niche-finder", icon: Compass, desc: "Low-competition niches" },
      ],
    },
    {
      title: "Analyze",
      description: "Audit shops, listings, and buyers",
      tools: [
        { name: "Shop Analyzer", href: "/tools/etsy/shop-analyzer", icon: Store, desc: "Full shop performance audit" },
        { name: "Listing Analyzer", href: "/tools/etsy/listing-analyzer", icon: FileText, desc: "Score & optimize any listing" },
        { name: "Buyer Check", href: "/tools/etsy/buyer-check", icon: UserCheck, desc: "Check buyer reputation" },
        { name: "Rank Check", href: "/tools/etsy/rank-check", icon: ChartColumn, desc: "Track keyword rankings" },
        { name: "Calculator", href: "/tools/etsy/profit-calculator", icon: Calculator, desc: "Calculate Etsy profit margins" },
      ],
    },
    {
      title: "Compose",
      description: "Generate optimized content with AI",
      tools: [
        { name: "Tag Generator", href: "/tools/etsy/tag-generator", icon: Tag, desc: "Data-driven tag suggestions" },
        { name: "Title Generator", href: "/tools/etsy/title-generator", icon: Type, desc: "SEO-optimized titles" },
        { name: "Description Generator", href: "/tools/etsy/description-generator", icon: AlignLeft, desc: "Compelling product descriptions" },
        { name: "Listing Studio", href: "/tools/etsy/listing-studio", icon: Wand, desc: "Complete listing from photos" },
        { name: "Video Generator", href: "/tools/etsy/video-generator", icon: Video, desc: "Product showcase videos" },
      ],
    },
    {
      title: "Other Tools",
      description: "Advanced research & AI assistant",
      tools: [
        { name: "Keyword Generator", href: "/tools/keyword-generator", icon: Search, desc: "Related keyword research" },
        { name: "HeroRank AI", href: "/tools/rankhero-ai", icon: MessageSquare, desc: "AI-powered Etsy advisor" },
      ],
    },
  ];
</script>

<div class="max-w-6xl mx-auto animate-fade-in">
  <!-- Welcome -->
  <div class="mb-8">
    <h1 class="tool-heading-prefix">Welcome to</h1>
    <h2 class="tool-heading-title">HeroRank.</h2>
    <p
      class="text-base mt-3 max-w-xl"
      style="color: var(--text-secondary)"
    >
      Your complete Etsy SEO toolkit. Analyze shops, generate tags, optimize
      listings, and grow your sales with data-driven insights.
    </p>
  </div>

  <!-- Quick Stats -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
    <div class="card px-5 py-4">
      <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
        Plan
      </div>
      <div class="text-xl font-bold text-text-primary">Business</div>
      <div class="text-xs text-text-muted mt-1">100/day per tool</div>
    </div>
    <div class="card px-5 py-4">
      <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
        Linked Shops
      </div>
      <div class="text-xl font-bold text-text-primary">0 / 10</div>
      <div class="text-xs text-text-muted mt-1">
        <a href="#" class="text-teal hover:underline">
          Link a shop →
        </a>
      </div>
    </div>
    <div class="card px-5 py-4">
      <div class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
        Today&apos;s Usage
      </div>
      <div class="text-xl font-bold text-text-primary">0 / 100</div>
      <div class="text-xs text-text-muted mt-1">Resets at midnight</div>
    </div>
  </div>

  <!-- Tool Groups -->
  <div class="space-y-10 stagger-children">
    {#each toolGroups as group (group.title)}
      <div>
        <div class="flex items-center gap-3 mb-4">
          <h3 class="text-lg font-bold text-text-primary">
            {group.title}
          </h3>
          <span class="text-sm text-text-muted">
            {group.description}
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each group.tools as tool (tool.href)}
            {@const Icon = tool.icon}
            <a
              href={tool.href}
              class="card px-4 py-4 flex items-start gap-3 group hover:border-teal/30 transition-all"
            >
              <div
                class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                style="background: var(--bg-page); color: var(--teal)"
              >
                <Icon size={18} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-semibold text-text-primary group-hover:text-teal transition-colors">
                    {tool.name}
                  </span>
                  <ArrowRight
                    size={12}
                    class="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
                <p class="text-xs text-text-muted mt-0.5 line-clamp-1">
                  {tool.desc}
                </p>
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

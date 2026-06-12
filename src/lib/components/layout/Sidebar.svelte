<script lang="ts">
  import { page } from "$app/state";
  import {
    House,
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
  } from "lucide-svelte";
  import type { ComponentType } from "svelte";

  interface NavItem {
    label: string;
    href: string;
    icon: ComponentType;
  }

  interface NavGroup {
    title: string;
    items: NavItem[];
  }

  const navigation: NavGroup[] = [
    {
      title: "",
      items: [{ label: "Dashboard", href: "/dashboard", icon: House }],
    },
    {
      title: "BRAINSTORM",
      items: [
        { label: "Best Sellers", href: "/tools/etsy/best-sellers", icon: Crown },
        { label: "Etsy Trends", href: "/tools/etsy/etsy-trends", icon: TrendingUp },
        { label: "Niche Finder", href: "/tools/etsy/niche-finder", icon: Compass },
      ],
    },
    {
      title: "ANALYZE",
      items: [
        { label: "Shop Analyzer", href: "/tools/etsy/shop-analyzer", icon: Store },
        { label: "Listing Analyzer", href: "/tools/etsy/listing-analyzer", icon: FileText },
        { label: "Buyer Check", href: "/tools/etsy/buyer-check", icon: UserCheck },
        { label: "Rank Check", href: "/tools/etsy/rank-check", icon: ChartColumn },
        { label: "Calculator", href: "/tools/etsy/profit-calculator", icon: Calculator },
      ],
    },
    {
      title: "COMPOSE",
      items: [
        { label: "Tag Generator", href: "/tools/etsy/tag-generator", icon: Tag },
        { label: "Title Generator", href: "/tools/etsy/title-generator", icon: Type },
        { label: "Description Generator", href: "/tools/etsy/description-generator", icon: AlignLeft },
        { label: "Listing Studio", href: "/tools/etsy/listing-studio", icon: Wand },
        { label: "Video Generator", href: "/tools/etsy/video-generator", icon: Video },
      ],
    },
    {
      title: "OTHER TOOLS",
      items: [
        { label: "Keyword Generator", href: "/tools/keyword-generator", icon: Search },
        { label: "RankHero AI", href: "/tools/rankhero-ai", icon: MessageSquare },
      ],
    },
  ];

  const pathname = $derived(page.url.pathname);
</script>

<aside
  class="fixed left-0 top-0 bottom-0 bg-white border-r border-border overflow-y-auto z-30"
  style="width: var(--sidebar-width)"
>
  <!-- Logo -->
  <div class="flex items-center gap-2.5 px-5 h-14 border-b border-border-light">
    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-orange to-orange-dark flex items-center justify-center">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </div>
    <span class="text-lg font-bold" style="color: var(--navy)">
      HeroRank
    </span>
  </div>

  <!-- Navigation -->
  <nav class="py-2 pb-8">
    {#each navigation as group (group.title || "main")}
      <div>
        {#if group.title}
          <div class="sidebar-group-label">{group.title}</div>
        {/if}
        {#each group.items as item (item.href)}
          {@const Icon = item.icon}
          <a
            href={item.href}
            class={`sidebar-link ${pathname === item.href ? "active" : ""}`}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </a>
        {/each}
      </div>
    {/each}
  </nav>
</aside>

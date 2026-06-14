<script lang="ts">
  import { page } from "$app/stores";
  import {
    LayoutDashboard, Plug, Type, Tag, AlignLeft, Search, Sparkles,
    FileText, TrendingUp, Store, Target, Crown, LineChart, ShieldCheck,
    Calculator, Wand, Video, Sprout
  } from "lucide-svelte";

  let { isOpen = false, onClose }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  // IA repositioned around the seller's OWN shop (My Shop / Create / Optimize first),
  // with competitor work demoted to a lighter "Research" group. Route hrefs are unchanged;
  // only labels + grouping are repositioned (Etsy-commercial-safe language).
  const GROUPS = [
    {
      heading: "My Shop",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Connect Shop", href: "/settings/connections", icon: Plug },
      ],
    },
    {
      heading: "Create",
      items: [
        { label: "Title Generator", href: "/tools/etsy/title-generator", icon: Type },
        { label: "Tag Generator", href: "/tools/etsy/tag-generator", icon: Tag },
        { label: "Description Writer", href: "/tools/etsy/description-generator", icon: AlignLeft },
        { label: "Keyword Finder", href: "/tools/keyword-generator", icon: Search },
        { label: "VieRank Assistant", href: "/tools/rankhero-ai", icon: Sparkles },
      ],
    },
    {
      heading: "Optimize",
      items: [
        { label: "Listing Optimizer", href: "/tools/etsy/listing-analyzer", icon: FileText },
        { label: "Search Position", href: "/tools/etsy/rank-check", icon: TrendingUp },
        { label: "Profit Calculator", href: "/tools/etsy/profit-calculator", icon: Calculator },
      ],
    },
    {
      heading: "Research",
      items: [
        { label: "Shop Research", href: "/tools/etsy/shop-analyzer", icon: Store },
        { label: "Niche Finder", href: "/tools/etsy/niche-finder", icon: Target },
        { label: "Best Sellers", href: "/tools/etsy/best-sellers", icon: Crown },
        { label: "Etsy Trends", href: "/tools/etsy/etsy-trends", icon: LineChart },
        { label: "Reputation Check", href: "/tools/etsy/buyer-check", icon: ShieldCheck },
      ],
    },
    {
      heading: "More",
      items: [
        { label: "Listing Studio", href: "/tools/etsy/listing-studio", icon: Wand },
        { label: "Video Maker", href: "/tools/etsy/video-generator", icon: Video },
      ],
    },
  ];
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 bg-black/40 z-30 md:hidden animate-fade-in"
    onclick={onClose}
    role="presentation"
  ></div>
{/if}

<aside
  class="fixed top-0 left-0 h-screen bg-white border-r border-border overflow-y-auto z-40 pb-8 w-[260px] transition-transform duration-300 ease-out md:translate-x-0 {isOpen ? 'translate-x-0' : '-translate-x-full'}"
>
  <div class="px-2 pt-4">
    <a href="/" onclick={onClose} class="flex items-center gap-2.5 mb-4 px-3 py-1">
      <span class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--teal)">
        <Sprout size={17} class="text-white" />
      </span>
      <span class="text-lg font-semibold tracking-tight text-text-primary">VieRank</span>
    </a>

    <nav>
      {#each GROUPS as group}
        <p class="sidebar-group-label">{group.heading}</p>
        {#each group.items as item}
          {@const Icon = item.icon}
          {@const active = $page.url.pathname === item.href}
          <a href={item.href} onclick={onClose} class="sidebar-link {active ? 'active' : ''}" aria-current={active ? 'page' : undefined}>
            <Icon size={18} />
            <span>{item.label}</span>
          </a>
        {/each}
      {/each}
    </nav>
  </div>
</aside>

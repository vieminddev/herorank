<script lang="ts">
  import { page } from "$app/stores";
  import {
    LayoutDashboard, Bell, History, Store, ClipboardCheck, MessageSquareHeart,
    Plug, Type, Tag, AlignLeft, WandSparkles, Search, Layers, ListChecks,
    Image, Sparkles, FileText, PencilLine, Bot, TrendingUp, Activity,
    FlaskConical, Columns3, Calculator, Megaphone, Eye, Target, Crown,
    ChartLine, Tags, CalendarDays, ShieldCheck, Wand, Video, Sprout,
    ChevronDown
  } from "lucide-svelte";

  let { isOpen = false, onClose }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  // IA repositioned around the seller's OWN shop (My Shop / Create / Optimize first),
  // with competitor work demoted to a lighter "Research" group. Groups are collapsible;
  // "My Shop" and any group containing the active route start expanded.
  const GROUPS = [
    {
      heading: "My Shop",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Alerts", href: "/notifications", icon: Bell },
        { label: "History", href: "/history", icon: History },
        { label: "My Shop", href: "/tools/etsy/my-shop", icon: Store },
        { label: "Shop Audit", href: "/tools/etsy/shop-audit", icon: ClipboardCheck },
        { label: "Review Requests", href: "/tools/etsy/review-requests", icon: MessageSquareHeart },
        { label: "Connect Shop", href: "/settings/connections", icon: Plug },
      ],
    },
    {
      heading: "Create",
      items: [
        { label: "Title Generator", href: "/tools/etsy/title-generator", icon: Type },
        { label: "Tag Generator", href: "/tools/etsy/tag-generator", icon: Tag },
        { label: "Description Writer", href: "/tools/etsy/description-generator", icon: AlignLeft },
        { label: "Listing Builder", href: "/tools/etsy/listing-builder", icon: WandSparkles },
        { label: "Keyword Finder", href: "/tools/keyword-generator", icon: Search },
        { label: "Bulk Keywords", href: "/tools/keyword-bulk", icon: Layers },
        { label: "Keyword Lists", href: "/tools/keyword-lists", icon: ListChecks },
        { label: "AI Image Studio", href: "/tools/etsy/image-studio", icon: Image },
        { label: "VieRank Assistant", href: "/tools/rankhero-ai", icon: Sparkles },
      ],
    },
    {
      heading: "Optimize",
      items: [
        { label: "Listing Optimizer", href: "/tools/etsy/listing-analyzer", icon: FileText },
        { label: "Listing Editor", href: "/tools/etsy/listing-editor", icon: PencilLine },
        { label: "AI Shopping Optimizer", href: "/tools/etsy/chatgpt-optimizer", icon: Bot },
        { label: "Search Position", href: "/tools/etsy/rank-check", icon: TrendingUp },
        { label: "Rank Tracker", href: "/tools/etsy/rank-tracker", icon: Activity },
        { label: "Title Experiment", href: "/tools/etsy/title-experiment", icon: FlaskConical },
        { label: "Compare Listings", href: "/tools/etsy/compare", icon: Columns3 },
        { label: "Profit Calculator", href: "/tools/etsy/profit-calculator", icon: Calculator },
        { label: "Ads ROI Calculator", href: "/tools/etsy/ads-calculator", icon: Megaphone },
      ],
    },
    {
      heading: "Research",
      items: [
        { label: "Shop Research", href: "/tools/etsy/shop-analyzer", icon: Store },
        { label: "Watchlist", href: "/tools/etsy/watchlist", icon: Eye },
        { label: "Niche Finder", href: "/tools/etsy/niche-finder", icon: Target },
        { label: "Best Sellers", href: "/tools/etsy/best-sellers", icon: Crown },
        { label: "Etsy Trends", href: "/tools/etsy/etsy-trends", icon: ChartLine },
        { label: "Tag Gap", href: "/tools/etsy/tag-gap", icon: Tags },
        { label: "Seasonal Calendar", href: "/tools/etsy/seasonal-calendar", icon: CalendarDays },
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

  const currentPath = $derived($page.url.pathname);
  const groupHasActive = (g: (typeof GROUPS)[number]) => g.items.some((i) => i.href === currentPath);

  let open = $state(
    Object.fromEntries(
      GROUPS.map((g) => [
        g.heading,
        g.heading === "My Shop" || g.items.some((i) => i.href === $page.url.pathname),
      ])
    ) as Record<string, boolean>
  );

  function toggleGroup(heading: string) {
    open[heading] = !open[heading];
  }
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
  class="fixed top-0 left-0 h-screen bg-white border-r border-border overflow-y-auto z-40 pb-8 w-[264px] transition-transform duration-300 ease-out md:translate-x-0 {isOpen ? 'translate-x-0' : '-translate-x-full'}"
  aria-label="Primary"
>
  <div class="px-2 pt-4">
    <a
      href="/"
      onclick={onClose}
      class="flex items-center gap-2.5 mb-3 px-3 py-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
    >
      <span class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--teal)">
        <Sprout size={17} class="text-white" />
      </span>
      <span class="text-lg font-semibold tracking-tight text-text-primary">VieRank</span>
    </a>

    <nav>
      {#each GROUPS as group}
        {@const isOpenGroup = open[group.heading]}
        {@const hasActive = groupHasActive(group)}
        <button
          type="button"
          class="nav-group-toggle"
          aria-expanded={isOpenGroup}
          onclick={() => toggleGroup(group.heading)}
        >
          <span class="flex-1 text-left">{group.heading}</span>
          {#if !isOpenGroup && hasActive}
            <span class="nav-group-dot" aria-hidden="true"></span>
          {/if}
          <span class="nav-group-count">{group.items.length}</span>
          <ChevronDown size={13} class="nav-group-chevron {isOpenGroup ? 'is-open' : ''}" />
        </button>
        <div class="nav-group-items {isOpenGroup ? 'is-open' : ''}">
          <div inert={!isOpenGroup} aria-hidden={!isOpenGroup}>
            {#each group.items as item}
              {@const Icon = item.icon}
              {@const active = currentPath === item.href}
              <a
                href={item.href}
                onclick={onClose}
                class="sidebar-link {active ? 'active' : ''}"
                aria-current={active ? 'page' : undefined}
                tabindex={isOpenGroup ? 0 : -1}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </nav>
  </div>
</aside>

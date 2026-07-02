<script lang="ts">
  import { page } from "$app/stores";
  import HeaderRaw from "$lib/components/layout/Header.svelte";
  import type { Component, Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import { NAV } from "$lib/config/nav";
  import { ChevronLeft, ChevronRight, X } from "lucide-svelte";
  import { toasts } from "$lib/toastStore";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";

  // Header Props configuration
  type HeaderProps = {
    user: LayoutData["user"];
    credits: LayoutData["credits"];
    subscription: LayoutData["subscription"];
    onToggleSidebar?: () => void;
  };
  const Header = HeaderRaw as unknown as Component<HeaderProps>;

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Navigation structure for the two-tier layout — derived from the shared nav config
  // so the sidebar and the per-tool breadcrumb never drift apart.
  const CATEGORIES = NAV.map((c) => ({ key: c.key, label: c.heading, icon: c.icon }));
  const GROUPS: Record<string, { heading: string; items: Array<{ label: string; href: string; icon: any }> }> =
    Object.fromEntries(NAV.map((c) => [c.key, { heading: c.heading, items: c.items }]));

  const currentPath = $derived($page.url.pathname);

  // Active Category state
  let sidebarCollapsed = $state(false);
  let activeMobileCategory = $state<string | null>(null);
  let selectedCategoryKey = $state("myshop");

  // Automatically switch desktop active Category based on path
  $effect(() => {
    for (const cat of CATEGORIES) {
      if (GROUPS[cat.key].items.some(item => item.href === currentPath)) {
        selectedCategoryKey = cat.key;
        break;
      }
    }
  });

  // Close mobile sheets on path change
  $effect(() => {
    if (currentPath) {
      activeMobileCategory = null;
    }
  });
</script>

<div class="min-h-screen flex flex-col">
  <!-- Desktop Sidebars (Hidden on Mobile < 768px) -->
  <div class="sidebar-container hidden md:flex" aria-label="Desktop Sidebar Layout">
    <!-- Tier 1: Category Icon Strip (64px) -->
    <aside class="sidebar-tier-1">
      <a href="/dashboard" class="sidebar-logo-container group" title="VieRank Home">
        <MascotLogo size={32} animate="hover" />
      </a>


      {#each CATEGORIES as cat}
        {@const Icon = cat.icon}
        {@const isActive = selectedCategoryKey === cat.key}
        <button
          type="button"
          class="tier1-btn {isActive ? 'active' : ''}"
          onclick={() => {
            selectedCategoryKey = cat.key;
            sidebarCollapsed = false; // Auto expand when category is clicked
          }}
          aria-label={cat.label}
        >
          <Icon size={20} />
          <span class="tier1-tooltip">{cat.label}</span>
        </button>
      {/each}
    </aside>

    <!-- Tier 2: Category List Drawer (200px - Collapsible) -->
    <aside class="sidebar-tier-2 {sidebarCollapsed ? 'collapsed' : ''}">
      <h2 class="tier2-header">
        {GROUPS[selectedCategoryKey].heading}
      </h2>

      <nav class="tier2-nav">
        {#each GROUPS[selectedCategoryKey].items as item}
          {@const Icon = item.icon}
          {@const active = currentPath === item.href}
          <a
            href={item.href}
            class="tier2-link {active ? 'active' : ''}"
            aria-current={active ? "page" : undefined}
          >
            <Icon size={16} class="opacity-85" />
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>

      <!-- Sidebar footer with collapse action -->
      <div class="sidebar-footer">
        <button
          type="button"
          class="collapse-btn"
          onclick={() => sidebarCollapsed = true}
          aria-label="Collapse Navigation"
        >
          <ChevronLeft size={14} />
          <span>Collapse</span>
        </button>
      </div>
    </aside>
  </div>

  <!-- Re-expand floating button when collapsed (desktop only) -->
  {#if sidebarCollapsed}
    <button
      type="button"
      class="expand-floating-btn hidden lg:flex"
      onclick={() => sidebarCollapsed = false}
      title="Expand sidebar"
      aria-label="Expand sidebar"
    >
      <ChevronRight size={16} />
    </button>
  {/if}

  <!-- Main Work Wrapper -->
  <div
    class="flex-1 flex flex-col min-h-screen w-full min-w-0 overflow-x-clip workspace-wrapper pl-0 pb-20 md:pl-[64px] md:pb-0 {sidebarCollapsed ? 'lg:pl-[64px]' : 'lg:pl-[264px]'}"
  >
    <!-- Header -->
    <Header
      user={data.user}
      credits={data.credits}
      subscription={data.subscription}
      onToggleSidebar={() => {}}
    />

    <!-- Main Content -->
    <main class="flex-1 p-4 sm:p-6 min-w-0">{@render children()}</main>

    <!-- Footer -->
    <footer class="px-4 sm:px-6 py-5 mt-auto border-t border-border/40">
      <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted">
        <p>The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.</p>
        <p>© {new Date().getFullYear()} VieRank</p>
      </div>
    </footer>
  </div>

  <!-- Mobile Bottom Tab Bar (Visible only on Mobile < 768px) -->
  <nav class="mobile-bottom-bar md:hidden" aria-label="Mobile Navigation">
    {#each CATEGORIES as cat}
      {@const Icon = cat.icon}
      {@const isActive = activeMobileCategory === cat.key || (activeMobileCategory === null && selectedCategoryKey === cat.key)}
      <button
        type="button"
        class="mobile-tab-btn {isActive ? 'active' : ''}"
        onclick={() => activeMobileCategory = cat.key}
      >
        <Icon size={18} />
        <span>{cat.label}</span>
      </button>
    {/each}
  </nav>
</div>

<!-- Mobile Drawer Sheet (Visible when a mobile tab is clicked) -->
{#if activeMobileCategory}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="mobile-sheet-backdrop md:hidden"
    onclick={() => activeMobileCategory = null}
    role="presentation"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mobile-sheet"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="{GROUPS[activeMobileCategory].heading} Tools"
    >
      <div class="mobile-sheet-handle"></div>
      <div class="mobile-sheet-header">
        <span class="mobile-sheet-title">{GROUPS[activeMobileCategory].heading} Tools</span>
        <button
          type="button"
          class="mobile-sheet-close"
          onclick={() => activeMobileCategory = null}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div class="mobile-sheet-content">
        {#each GROUPS[activeMobileCategory].items as item}
          {@const Icon = item.icon}
          {@const active = currentPath === item.href}
          <a
            href={item.href}
            class="mobile-tool-link {active ? 'active' : ''}"
            onclick={() => activeMobileCategory = null}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </a>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if $toasts.length > 0}
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none" role="presentation">
    {#each $toasts as toast (toast.id)}
      <div
        class="toast-animation pointer-events-auto p-4 rounded-xl shadow-lg border flex items-center justify-between gap-3 text-sm font-medium
               {toast.type === 'success' ? 'bg-success-bg border-success text-success' : 'bg-danger-bg border-danger text-danger'}"
        role="alert"
      >
        <span>{toast.message}</span>
      </div>
    {/each}
  </div>
{/if}

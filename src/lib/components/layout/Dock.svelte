<script lang="ts">
  import { page } from "$app/stores";
  import { LayoutDashboard, ClipboardCheck, Type, Activity, Plug, Grid, X } from "lucide-svelte";
  import { NAV } from "$lib/config/nav";

  // Single source of truth — the "More Tools" menu renders the shared NAV (config/nav.ts).
  const GROUPS = NAV;

  // Core dock links (shortcuts)
  const DOCK_LINKS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Shop Audit", href: "/tools/shop-audit", icon: ClipboardCheck },
    { label: "Title Gen", href: "/tools/title-generator", icon: Type },
    { label: "Rank Tracker", href: "/tools/rank-tracker", icon: Activity },
    { label: "Connections", href: "/settings/connections", icon: Plug },
  ];

  const currentPath = $derived($page.url.pathname);
  let showMoreMenu = $state(false);

  // Close menus on path transition
  $effect(() => {
    if (currentPath) {
      showMoreMenu = false;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      showMoreMenu = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Dock container — centered floating bar; never wider than the viewport. -->
<div class="glass-dock-wrapper">
  <!-- Desktop & Mobile Dock -->
  <nav class="glass-dock" aria-label="Quick Access">
    {#each DOCK_LINKS as link}
      {@const Icon = link.icon}
      {@const active = currentPath === link.href}
      <a
        href={link.href}
        class="dock-item {active ? 'active' : ''}"
        aria-label={link.label}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={20} />
        <span class="dock-tooltip">{link.label}</span>
      </a>
    {/each}

    <div class="dock-divider" aria-hidden="true"></div>

    <!-- "More Tools" Trigger Button -->
    <button
      type="button"
      class="dock-item {showMoreMenu ? 'active' : ''}"
      onclick={() => showMoreMenu = !showMoreMenu}
      aria-label="More Tools"
      aria-haspopup="dialog"
      aria-expanded={showMoreMenu}
    >
      <Grid size={20} />
      <span class="dock-tooltip">More Tools</span>
    </button>
  </nav>

  <!-- Desktop Floating Popup Menu (Hidden on Mobile) -->
  {#if showMoreMenu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-40 hidden md:block"
      onclick={() => showMoreMenu = false}
    ></div>
    
    <div
      class="absolute bottom-18 left-1/2 -translate-x-1/2 bg-white border border-border p-5 rounded-2xl shadow-xl w-[580px] max-h-[500px] overflow-y-auto z-50 hidden md:grid grid-cols-2 gap-x-6 gap-y-5 animate-fade-in"
      role="dialog"
      aria-label="All Tools Menu"
    >
      {#each GROUPS as group}
        <div class="space-y-2">
          <h3 class="text-[11px] font-bold text-text-muted uppercase tracking-wider border-b border-border/40 pb-1">
            {group.heading}
          </h3>
          <div class="grid gap-1">
            {#each group.items as item}
              {@const Icon = item.icon}
              {@const active = currentPath === item.href}
              <a
                href={item.href}
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-teal hover:bg-bg-page transition-colors {active ? 'bg-bg-page text-teal font-semibold' : ''}"
              >
                <Icon size={14} class="opacity-80" />
                <span>{item.label}</span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Mobile Drawer Bottom Sheet (Hidden on Desktop) -->
{#if showMoreMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="bottom-sheet-backdrop md:hidden"
    onclick={() => showMoreMenu = false}
    role="presentation"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bottom-sheet"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="All Tools"
    >
      <div class="bottom-sheet-handle"></div>
      <div class="flex items-center justify-between px-5 pb-3 border-b border-border/40">
        <h2 class="text-sm font-bold text-text-primary">All Tools & Services</h2>
        <button
          type="button"
          class="p-1 rounded-full bg-bg-page text-text-secondary hover:text-text-primary"
          onclick={() => showMoreMenu = false}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div class="bottom-sheet-content space-y-6 pt-4">
        {#each GROUPS as group}
          <div class="space-y-2.5">
            <h3 class="text-xs font-bold text-text-muted uppercase tracking-wider">
              {group.heading}
            </h3>
            <div class="grid grid-cols-2 gap-2">
              {#each group.items as item}
                {@const Icon = item.icon}
                {@const active = currentPath === item.href}
                <a
                  href={item.href}
                  class="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-text-secondary border border-border/45 hover:text-teal hover:border-teal/20 transition-all {active ? 'bg-teal/5 text-teal border-teal/15' : 'bg-bg-page/40'}"
                >
                  <Icon size={14} class="opacity-80" />
                  <span class="truncate">{item.label}</span>
                </a>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Floating quick-access dock. Self-contained so it is responsive wherever mounted.
     Centered, clamped to the viewport so it never causes horizontal scroll, and
     lifted above the OS safe-area on touch devices. */
  .glass-dock-wrapper {
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 50;
    max-width: calc(100vw - 24px);
  }

  .glass-dock {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 6px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .glass-dock::-webkit-scrollbar { display: none; }

  /* 44px minimum tap target on every dock control. */
  .dock-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .dock-item:hover { color: var(--teal); background: var(--bg-page); }
  .dock-item.active { color: var(--teal); background: var(--bg-tint); }

  .dock-divider {
    width: 1px;
    height: 24px;
    background: var(--border);
    margin: 0 2px;
    flex: 0 0 auto;
  }

  .dock-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    padding: 4px 8px;
    background: var(--text-primary);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    border-radius: var(--radius-md);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-fast), transform var(--transition-fast);
  }
  /* Tooltips only on devices with a real hover pointer — avoids stuck tooltips on touch. */
  @media (hover: hover) {
    .dock-item:hover .dock-tooltip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* Mobile "All Tools" bottom sheet. */
  .bottom-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: flex-end;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
  }
  .bottom-sheet {
    width: 100%;
    max-height: 80vh;
    background: #fff;
    border-top-left-radius: var(--radius-xl);
    border-top-right-radius: var(--radius-xl);
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateY(100%);
    animation: dock-sheet-up 0.3s cubic-bezier(0.32, 0.94, 0.6, 1) forwards;
  }
  @keyframes dock-sheet-up { to { transform: translateY(0); } }
  .bottom-sheet-handle {
    width: 36px;
    height: 4px;
    background: var(--border);
    border-radius: var(--radius-full);
    margin: 12px auto;
    flex-shrink: 0;
  }
  .bottom-sheet-content {
    overflow-y: auto;
    padding: 0 20px calc(24px + env(safe-area-inset-bottom));
  }
</style>

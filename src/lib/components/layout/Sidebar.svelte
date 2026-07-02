<script lang="ts">
  import { page } from "$app/stores";
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";
  import { ChevronDown } from "lucide-svelte";
  import { NAV } from "$lib/config/nav";

  let { isOpen = false, onClose }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  // Single source of truth — render the shared NAV (config/nav.ts). Groups are collapsible;
  // "My Shop" and any group containing the active route start expanded.
  const GROUPS = NAV;

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
  class="fixed top-0 left-0 h-screen bg-white border-r border-border overflow-y-auto z-40 pb-8 w-[264px] max-w-[85vw] md:max-w-none transition-transform duration-300 ease-out md:translate-x-0 {isOpen ? 'translate-x-0' : '-translate-x-full'}"
  aria-label="Primary"
>
  <div class="px-2 pt-4">
    <a
      href="/"
      onclick={onClose}
      class="flex items-center gap-2.5 mb-3 px-3 py-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal group"
    >
      <MascotLogo size={32} animate="hover" />
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

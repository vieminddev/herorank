<script lang="ts">
  import Sidebar from "$lib/components/layout/Sidebar.svelte";
  import HeaderRaw from "$lib/components/layout/Header.svelte";
  import type { Component, Snippet } from "svelte";
  import type { LayoutData } from "./$types";

  // `data` comes from +layout.server.ts (Engineer A): { user, subscription, credits }.
  // Forwarded to Header (Engineer C reads `user` + `credits` props on Header.svelte).
  // Header is owned by Engineer C; until C declares its `$props()`, we type the props
  // boundary here so this layout type-checks. Keep this shape in sync with 02_contract_A.md.
  type HeaderProps = {
    user: LayoutData["user"];
    credits: LayoutData["credits"];
    subscription: LayoutData["subscription"];
    onToggleSidebar?: () => void;
  };
  const Header = HeaderRaw as unknown as Component<HeaderProps>;

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  let sidebarOpen = $state(false);
</script>

<div class="min-h-screen flex">
  <Sidebar isOpen={sidebarOpen} onClose={() => sidebarOpen = false} />
  <div
    class="flex-1 flex flex-col min-h-screen md:ml-[260px] w-full min-w-0"
  >
    <!-- Engineer C: Header consumes `user` + `credits` (see 02_contract_A.md). -->
    <Header
      user={data.user}
      credits={data.credits}
      subscription={data.subscription}
      onToggleSidebar={() => sidebarOpen = !sidebarOpen}
    />
    <main class="flex-1 p-6">{@render children()}</main>

    <!-- Minimal app footer — Etsy disclaimer (compliance) only, no marketing chrome -->
    <footer class="px-6 py-5 mt-auto">
      <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted">
        <p>The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.</p>
        <p>© {new Date().getFullYear()} VieRank</p>
      </div>
    </footer>
  </div>
</div>

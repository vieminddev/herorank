<script lang="ts">
  /**
   * The standard dashboard page header: breadcrumb (Workspace / group) + icon + title +
   * description, with an optional right-aligned action slot. Used by ToolPageLayout and by
   * the standalone utility pages (History, Alerts, Connections, Extension) so every page in
   * a nav group carries the same breadcrumb and header chrome.
   */
  import type { Snippet, Component, ComponentType, SvelteComponent } from "svelte";
  import { page } from "$app/stores";
  import { groupHeadingForPath } from "$lib/config/nav";

  type IconComponent = Component<any> | ComponentType<SvelteComponent<any>>;

  let { title, description, icon, action, dense = false }: {
    title: string;
    description?: string;
    icon?: IconComponent;
    /** Optional right-aligned action (e.g. a "Mark all read" button). */
    action?: Snippet;
    /** Tighten vertical spacing — used when the page below wants more room (e.g. the chat panel). */
    dense?: boolean;
  } = $props();

  const Icon = $derived(icon);
  const group = $derived(groupHeadingForPath($page.url.pathname));
</script>

<header class={dense ? "pt-1 pb-2" : "pt-2 pb-6"}>
  <p class="text-xs text-text-secondary flex items-center gap-1.5 {dense ? 'mb-2' : 'mb-4'}">
    <a href="/dashboard" class="hover:text-teal font-semibold transition-colors">Workspace</a>
    <span class="text-text-muted">/</span>
    <span class="text-text-muted font-medium">{group}</span>
  </p>

  <div class="flex items-start gap-4">
    {#if Icon}
      <span class="w-12 h-12 rounded-xl bg-teal/5 text-teal flex items-center justify-center shrink-0 border border-teal/10 shadow-sm">
        <Icon size={22} />
      </span>
    {/if}
    <div class="flex-1 min-w-0 flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight text-text-primary leading-tight">{title}</h1>
        {#if description}
          <p class="lead !text-[13px] !leading-relaxed mt-1 text-text-secondary max-w-3xl">{description}</p>
        {/if}
      </div>
      {#if action}
        <div class="shrink-0 pt-1">{@render action()}</div>
      {/if}
    </div>
  </div>
</header>

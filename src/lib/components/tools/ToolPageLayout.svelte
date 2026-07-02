<script lang="ts">
  import type { Snippet, Component, ComponentType, SvelteComponent } from "svelte";
  import PageHeader from "$lib/components/layout/PageHeader.svelte";
  import { PanelLeftClose, PanelLeft } from "lucide-svelte";
  import { page } from "$app/stores";

  // Accept both Svelte 5 `Component` and lucide-svelte's legacy `ComponentType`.
  type IconComponent = Component<any> | ComponentType<SvelteComponent<any>>;

  let { 
    title, 
    description, 
    icon, 
    credits, 
    creditsUnit = "run",
    controlWidthClass = "lg:grid-cols-[320px_minmax(0,1fr)]",
    contentWidthClass = "max-w-3xl",
    tightHeader = false,
    controls,
    children
  }: {
    title: string;
    description: string;
    icon?: IconComponent;
    credits?: number;
    /** What one charge covers, e.g. "run" (default) or "image" → label reads "Cost per {unit}". */
    creditsUnit?: string;
    /** Dynamic column width definition. */
    controlWidthClass?: string;
    /** Single-pane content width cap (default narrow for readability; pass "max-w-none" to fill). */
    contentWidthClass?: string;
    /** Tighten the page header + gap above the content (more room for tall content like chat). */
    tightHeader?: boolean;
    /** Left control panel (input + options). When present → two-pane workspace.
        When omitted → single column (chat, coming-soon). */
    controls?: Snippet;
    children: Snippet;
  } = $props();

  const twoPane = $derived(!!controls);
  let collapsed = $state(false);

  // Upfront affordability: if the user can't cover this tool's cost, say so BEFORE they fill the
  // form and click (vs. a 402 after the act). Balance comes from the dashboard layout load.
  const balance = $derived(($page.data?.credits?.balance ?? null) as number | null);
  const insufficient = $derived(credits !== undefined && credits > 0 && balance !== null && balance < credits);
</script>

<div class="max-w-5xl mx-auto">
  <PageHeader {title} {description} {icon} dense={tightHeader} />

  {#if twoPane}
    <!-- Two-pane workshop: controls first (stacked on mobile) | work surface. -->
    <div class="grid grid-cols-1 {collapsed ? 'lg:grid-cols-1' : controlWidthClass} gap-5 lg:gap-8 items-start mt-4 lg:mt-6">
      {#if !collapsed}
        <aside class="min-w-0 lg:sticky lg:top-6 drawer-slide-transition">
          <div class="card p-4 sm:p-5 bg-white border border-border rounded-xl shadow-sm flex flex-col min-w-0">
            {@render controls!()}
            {#if credits !== undefined}
              <div class="mt-4 pt-4 border-t border-border-light">
                <div class="flex justify-between items-center">
                  <span class="text-[11px] font-semibold text-text-secondary">Cost per {creditsUnit}</span>
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-bg-page border border-border text-text-primary text-[10px] font-bold rounded-full">
                    {credits} credit{credits !== 1 ? 's' : ''}
                  </span>
                </div>
                {#if insufficient}
                  <p class="text-[11px] text-danger mt-2 leading-snug">
                    You have {balance} credit{balance !== 1 ? 's' : ''} — not enough to run this.
                    <a href="/pricing" class="copy-link !text-teal font-semibold whitespace-nowrap">Top up →</a>
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        </aside>
      {/if}
      <div class="min-w-0">
        <!-- Collapsible Toggle Trigger -->
        <div class="mb-4 flex items-center justify-between">
          <button
            type="button"
            onclick={() => collapsed = !collapsed}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-border text-[11px] font-semibold text-text-secondary hover:text-teal hover:border-teal/40 shadow-sm transition-all focus:outline-none"
            aria-label={collapsed ? "Show controls sidebar" : "Hide controls sidebar"}
          >
            {#if collapsed}
              <PanelLeft size={12} class="text-teal" />
              <span>Show settings</span>
            {:else}
              <PanelLeftClose size={12} />
              <span>Hide settings</span>
            {/if}
          </button>
        </div>

        {@render children()}
      </div>
    </div>
  {:else}
    <div class="{contentWidthClass} {tightHeader ? 'mt-1' : 'mt-6'}">
      {@render children()}
    </div>
  {/if}
</div>

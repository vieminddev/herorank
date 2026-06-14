<script lang="ts">
  import type { Snippet, Component, ComponentType, SvelteComponent } from "svelte";
  import { page } from "$app/stores";

  // Accept both Svelte 5 `Component` and lucide-svelte's legacy `ComponentType`.
  type IconComponent = Component<any> | ComponentType<SvelteComponent<any>>;

  let { title, prefix, description, icon, credits, controls, children }: {
    title: string;
    /** Optional small eyebrow above the title. */
    prefix?: string;
    description: string;
    icon?: IconComponent;
    credits?: number;
    /** Left control panel (input + options). When present → two-pane workspace.
        When omitted → single column (chat, coming-soon). */
    controls?: Snippet;
    children: Snippet;
  } = $props();

  const Icon = $derived(icon);
  const twoPane = $derived(!!controls);

  // Breadcrumb group derived from the route — no per-page prop needed.
  const group = $derived.by(() => {
    const p = $page.url.pathname;
    if (/listing-analyzer|rank-check|profit-calculator/.test(p)) return "Optimize";
    if (/shop-analyzer|niche-finder|best-sellers|etsy-trends|buyer-check/.test(p)) return "Research";
    return "Create";
  });
</script>

<div class="max-w-5xl mx-auto">
  <!-- Workshop header — type-led, restrained -->
  <header class="pt-2 pb-7">
    <p class="text-[0.8125rem] text-text-muted mb-3">
      <a href="/dashboard" class="hover:text-text-primary transition-colors">My Shop</a>
      <span class="mx-1.5 text-border">/</span>{group}
    </p>
    {#if prefix}<p class="section-kicker mb-1">{prefix}</p>{/if}
    <div class="flex items-center gap-2.5">
      {#if Icon}<Icon size={22} class="text-teal shrink-0" />{/if}
      <h1 class="text-[1.75rem] font-semibold tracking-tight text-text-primary leading-tight">{title}</h1>
    </div>
    <p class="lead mt-2 max-w-2xl">{description}</p>
  </header>
  <hr class="rule mb-8" />

  {#if twoPane}
    <!-- Two-pane workshop: controls (sticky) | work surface -->
    <div class="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-10 items-start">
      <aside class="lg:sticky lg:top-6">
        {@render controls!()}
        {#if credits !== undefined}
          <p class="text-[0.8125rem] text-text-muted mt-5 pt-4 border-t border-border-light">
            Uses {credits} credit{credits !== 1 ? 's' : ''} per run
          </p>
        {/if}
      </aside>
      <div class="min-w-0">
        {@render children()}
      </div>
    </div>
  {:else}
    <div class="max-w-3xl">
      {@render children()}
    </div>
  {/if}
</div>

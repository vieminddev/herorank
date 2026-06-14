<script lang="ts">
  import type { Component, ComponentType, SvelteComponent } from "svelte";

  // Accept both Svelte 5 `Component` and the legacy `ComponentType` shape that
  // lucide-svelte still exports, so icon imports from lucide type-check cleanly.
  type IconComponent = Component<any> | ComponentType<SvelteComponent<any>>;

  let { title, label, value, subtitle, icon, trend }: {
    /** Primary caption. `label` is an alias used by tool pages; either works. */
    title?: string;
    label?: string;
    value: string | number;
    subtitle?: string;
    icon?: IconComponent;
    trend?: { direction: "up" | "down" | "stable"; label: string };
  } = $props();

  const Icon = $derived(icon);
  const caption = $derived(title ?? label ?? "");
</script>

<div class="bg-white rounded-xl border border-border shadow-card p-5 transition-shadow duration-300 hover:shadow-md">
  <div class="flex items-start justify-between mb-3">
    <p class="text-sm text-text-secondary">{caption}</p>
    {#if Icon}
      <div class="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center flex-shrink-0">
        <Icon size={18} class="text-teal" />
      </div>
    {/if}
  </div>

  <p class="text-2xl font-semibold text-text-primary">{value}</p>

  <div class="flex items-center gap-2 mt-1">
    {#if trend}
      <span class="text-xs font-medium
        {trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-danger' : 'text-text-muted'}">
        {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
        {trend.label}
      </span>
    {/if}
    {#if subtitle}
      <span class="text-xs text-text-muted">{subtitle}</span>
    {/if}
  </div>
</div>

<script lang="ts">
  interface StatCardProps {
    label: string;
    value: string | number;
    subtitle?: string;
    class?: string;
  }

  let { label, value, subtitle, class: className = "" }: StatCardProps = $props();
</script>

<div class={`card px-5 py-4 ${className}`}>
  <div
    class="text-xs font-semibold uppercase tracking-wider mb-2"
    style="color: var(--text-muted)"
  >
    {label}
  </div>
  <div class="text-2xl font-bold" style="color: var(--text-primary)">
    {value}
  </div>
  {#if subtitle}
    <div class="text-xs mt-1" style="color: var(--text-muted)">
      {subtitle}
    </div>
  {/if}
</div>

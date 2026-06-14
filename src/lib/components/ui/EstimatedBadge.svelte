<script lang="ts">
  // The honesty marker beside every estimated number (DESIGN.md §5):
  // off-white pill, ink-green text, quiet by design.
  let { label = "Estimated", tooltip }: {
    label?: string;
    tooltip?: string;
  } = $props();

  const title = $derived(tooltip ?? "This value is estimated and may not be exact");
</script>

<span class="badge-estimated" {title}>
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
  {label}
</span>

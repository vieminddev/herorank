<script lang="ts">
  // The honesty counterpart of EstimatedBadge: a SOLID green pill marking a REAL, measured
  // number (e.g. transaction_sold_count, Δ sales velocity) — NEVER an estimate. Filled so it
  // reads as "verified/live", visually distinct from the quiet off-white Est. pill.
  let {
    label = "Live",
    tooltip,
  }: {
    label?: string;
    tooltip?: string;
  } = $props();

  const title = $derived(tooltip ?? "Real, measured data from Etsy — not an estimate");
</script>

<span class="badge-real" {title}>
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
  {label}
</span>

<script lang="ts">
  import { FlaskConical } from "lucide-svelte";
  // Honest indicator shown when a tool is serving SAMPLE/mock fixtures (no live Etsy key configured)
  // instead of real shop data — so nothing silently looks real (pairs with the brand's honesty rule).
  let { tooltip }: { tooltip?: string } = $props();
  const title = $derived(
    tooltip ?? "Showing sample data — connect your Etsy shop or configure the API for live numbers."
  );
</script>

<span
  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
  style="background: var(--warning-bg); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 25%, transparent);"
  {title}
>
  <FlaskConical size={11} aria-hidden="true" />
  Sample data
</span>

<script lang="ts">
  // Shimmer placeholder shown during async waits (replaces lone spinners). Respects
  // prefers-reduced-motion via the global `.skeleton` rule in app.css.
  let { lines = 1, height, width, rounded = "md", class: cls = "" }: {
    /** Number of stacked lines (for text placeholders). */
    lines?: number;
    /** CSS height for a single block (e.g. "2rem", "120px"). Overrides the line style. */
    height?: string;
    width?: string;
    rounded?: "sm" | "md" | "lg" | "xl" | "full";
    class?: string;
  } = $props();

  const radius: Record<string, string> = {
    sm: "rounded", md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", full: "rounded-full",
  };
</script>

{#if height}
  <div class="skeleton {radius[rounded]} {cls}" style="height: {height};{width ? ` width: ${width};` : ''}" aria-hidden="true"></div>
{:else}
  <div class="flex flex-col gap-2 {cls}" aria-hidden="true">
    {#each Array(lines) as _, i (i)}
      <div class="skeleton skeleton-text" style={i === lines - 1 && lines > 1 ? "width: 70%;" : (width ? `width: ${width};` : "")}></div>
    {/each}
  </div>
{/if}

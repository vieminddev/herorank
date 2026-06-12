<script lang="ts">
  import type { Snippet } from "svelte";

  interface ToolPageLayoutProps {
    prefix?: string;
    title: string;
    description: string;
    children: Snippet;
  }

  let { prefix = "Etsy", title, description, children }: ToolPageLayoutProps =
    $props();
</script>

<div class="max-w-6xl mx-auto animate-fade-in">
  <!-- Hero Section -->
  <div class="relative mb-8">
    <!-- Decorative background icon (faded) -->
    <div class="absolute right-0 top-0 opacity-[0.06] pointer-events-none select-none">
      <svg
        width="160"
        height="160"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="0.5"
        class="text-navy"
      >
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="4" r="1.5" />
        <circle cx="12" cy="20" r="1.5" />
        <circle cx="4" cy="12" r="1.5" />
        <circle cx="20" cy="12" r="1.5" />
        <line x1="12" y1="7" x2="12" y2="9" />
        <line x1="12" y1="15" x2="12" y2="17" />
        <line x1="7" y1="12" x2="9" y2="12" />
        <line x1="15" y1="12" x2="17" y2="12" />
      </svg>
    </div>

    <h1 class="tool-heading-prefix">{prefix}</h1>
    <h2 class="tool-heading-title">{title}.</h2>
    <p class="text-base mt-3 max-w-xl" style="color: var(--text-secondary)">
      {description}
    </p>
  </div>

  <!-- Content -->
  {@render children()}
</div>

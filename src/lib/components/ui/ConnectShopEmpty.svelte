<script lang="ts">
  /**
   * Shared empty state for own-shop tools when no Etsy shop is connected.
   * One look + one CTA style everywhere (My Shop / Shop Audit / Review Requests),
   * so the connect prompt never differs page to page.
   */
  import { ArrowRight } from "lucide-svelte";
  import MascotLogo from "./MascotLogo.svelte";

  let {
    title = "Connect your Etsy shop",
    hint = "",
    cta = "Connect shop",
    href = "/settings/connections",
  }: {
    title?: string;
    hint?: string;
    cta?: string;
    href?: string;
  } = $props();
</script>

<div class="max-w-md mx-auto text-center py-12 animate-fade-in">
  <div class="mascot-halo mx-auto mb-4" aria-hidden="true">
    <MascotLogo size={52} animate="always" />
  </div>
  <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-2">{title}</h2>
  {#if hint}<p class="lead text-sm mb-6">{hint}</p>{/if}
  <a href={href} class="btn btn-primary">
    {cta} <ArrowRight size={15} />
  </a>
</div>

<style>
  .mascot-halo {
    width: 76px;
    height: 76px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full, 9999px);
    background: radial-gradient(circle, color-mix(in srgb, var(--teal) 12%, transparent) 0%, transparent 70%);
    animation: mascot-float 3.4s ease-in-out infinite;
  }
  @keyframes mascot-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-7px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mascot-halo { animation: none; }
  }
</style>

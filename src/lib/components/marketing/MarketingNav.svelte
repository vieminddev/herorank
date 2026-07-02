<script lang="ts">
  /**
   * Single-source marketing top nav. Used by every public marketing surface (landing, docs,
   * privacy, terms, pricing, methodology) so the header never drifts between pages again.
   *
   * Props:
   *   loggedIn — swap the auth CTA for a "Go to dashboard" button.
   *   current  — highlight the matching nav link ("docs" | "pricing").
   */
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";
  import { ArrowRight } from "lucide-svelte";

  let { loggedIn = false, current = "" }: { loggedIn?: boolean; current?: string } = $props();

  const linkBase = "px-3 py-2 text-sm transition-colors";
  const inactive = "font-medium text-text-secondary hover:text-teal";
  const active = "font-semibold text-teal";
</script>

<nav class="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-border">
  <div class="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
    <a href="/" class="flex items-center gap-2.5 group">
      <MascotLogo size={36} animate="hover" />
      <span class="text-xl font-semibold tracking-tight">VieRank</span>
    </a>

    <div class="flex items-center gap-2">
      <a href="/docs" class="{linkBase} {current === 'docs' ? active : inactive}">Docs</a>
      <a href="/pricing" class="{linkBase} {current === 'pricing' ? active : inactive}">Pricing</a>
      {#if loggedIn}
        <a href="/dashboard" class="btn btn-primary btn-glow !py-2 !px-5 text-sm inline-flex items-center gap-1.5">
          Go to dashboard <ArrowRight size={15} />
        </a>
      {:else}
        <a href="/auth/login" class="{linkBase} {inactive}">Log in</a>
        <a href="/auth/signup" class="btn btn-primary btn-glow !py-2 !px-5 text-sm">Start free</a>
      {/if}
    </div>
  </div>
</nav>

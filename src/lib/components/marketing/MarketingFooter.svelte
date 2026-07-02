<script lang="ts">
  /**
   * Single-source marketing footer. Shared across every public marketing surface so the footer
   * links + Etsy trademark notice stay identical everywhere.
   */
  import MascotLogo from "$lib/components/ui/MascotLogo.svelte";
</script>

<footer class="border-t border-border py-12 px-6 bg-white relative z-20">
  <div class="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
    <div class="flex items-center gap-2.5 group">
      <MascotLogo size={32} animate="hover" />
      <span class="text-lg font-semibold tracking-tight">VieRank</span>
    </div>

    <div class="flex items-center gap-6 text-sm text-text-muted font-medium">
      <a href="/docs" class="hover:text-text-primary transition-colors">Docs</a>
      <a href="/pricing" class="hover:text-text-primary transition-colors">Pricing</a>
      <a href="/privacy" class="hover:text-text-primary transition-colors">Privacy</a>
      <a href="/terms" class="hover:text-text-primary transition-colors">Terms</a>
    </div>

    <p class="text-xs text-text-muted font-medium max-w-sm md:text-right">
      © 2026 VieRank. The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.
    </p>
  </div>
</footer>

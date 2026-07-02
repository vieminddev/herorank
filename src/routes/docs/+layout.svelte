<script lang="ts">
  /**
   * Public documentation chrome (no auth) — mirrors the Privacy/Terms marketing shell so Etsy API
   * reviewers and prospective users can read the guides without an account. Linked from the
   * landing footer next to Privacy/Terms.
   */
  import MarketingNav from "$lib/components/marketing/MarketingNav.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";
  let { children } = $props();
</script>

<div class="lp min-h-screen bg-[#f7f9f8] text-text-primary overflow-hidden flex flex-col">
  <MarketingNav current="docs" />

  <main class="flex-1">
    {@render children()}
  </main>

  <MarketingFooter />
</div>

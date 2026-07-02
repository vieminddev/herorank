<script lang="ts">
  // VieRank mascot loader — a fluttering, bobbing butterfly for "generating" waits.
  import MascotLogo from './MascotLogo.svelte';
  
  let { size = 48, label = "" }: { size?: number; label?: string } = $props();
</script>

<div class="bfl" role="status" aria-label={label || "Loading"}>
  <span class="bfl-bob" style="width:{size}px;height:{size}px">
    <MascotLogo size={size} animate="always" />
  </span>
  {#if label}<p class="text-xs text-text-secondary font-medium">{label}</p>{/if}
</div>


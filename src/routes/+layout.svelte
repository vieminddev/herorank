<script lang="ts">
  import "../app.css";
  import MascotCheer from "$lib/components/ui/MascotCheer.svelte";

  let { children } = $props();
</script>

{@render children()}

<MascotCheer />

<script lang="ts">
  // 9-position grid picker (TL..BR) used for logo + caption placement.
  import type { Pos9 } from "$lib/video/scene";

  let { value = $bindable() }: { value: Pos9 } = $props();

  const cells: Pos9[] = ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br"];
</script>

<div class="grid grid-cols-3 gap-1 w-[84px]" role="radiogroup" aria-label="Position">
  {#each cells as cell (cell)}
    <button
      type="button"
      role="radio"
      aria-checked={value === cell}
      aria-label={cell}
      class="aspect-square rounded border transition-colors {value === cell
        ? 'bg-teal border-teal'
        : 'bg-bg-page border-border hover:border-text-muted'}"
      onclick={() => (value = cell)}
    ></button>
  {/each}
</div>

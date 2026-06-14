<script lang="ts">
  let { score, max = 100, label, color }: {
    score: number;
    max?: number;
    label?: string;
    /** Optional override. When omitted, the fill color tracks the score band (high/medium/low). */
    color?: "teal" | "orange" | "red" | "green" | "blue";
  } = $props();

  const percentage = $derived(Math.min(100, Math.max(0, (score / max) * 100)));

  const colorMap: Record<string, string> = {
    teal: "bg-teal",
    orange: "bg-orange",
    red: "bg-danger",
    green: "bg-success",
    blue: "bg-blue-500",
  };

  // Score-band class per DESIGN.md (status color always paired with the numeric label).
  const band = $derived(
    percentage >= 70 ? "high" : percentage >= 40 ? "medium" : "low"
  );
  const fillClass = $derived(color ? (colorMap[color] ?? colorMap.teal) : "");
</script>

<div class="w-full">
  {#if label}
    <div class="flex justify-between items-center mb-1">
      <span class="text-xs text-text-secondary">{label}</span>
      <span class="text-xs font-semibold text-text-primary">{score}/{max}</span>
    </div>
  {/if}
  <div class="score-bar">
    <div
      class="score-bar-fill {color ? fillClass : band}"
      style="width: {percentage}%"
    ></div>
  </div>
</div>

<script lang="ts">
  interface ScoreBarProps {
    label: string;
    score: number;
    maxScore?: number;
    showScore?: boolean;
  }

  let { label, score, maxScore = 100, showScore = true }: ScoreBarProps = $props();

  const colorMap = {
    high: "var(--score-high)",
    medium: "var(--score-medium)",
    low: "var(--score-low)",
  };

  const percentage = $derived(Math.min((score / maxScore) * 100, 100));
  const level = $derived(
    percentage >= 70 ? "high" : percentage >= 40 ? "medium" : "low"
  );
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-center justify-between">
    <span class="text-sm font-semibold text-text-primary">{label}</span>
    {#if showScore}
      <span class="text-sm font-bold" style={`color: ${colorMap[level]}`}>
        {score}/{maxScore}
      </span>
    {/if}
  </div>
  <div class="score-bar">
    <div
      class="score-bar-fill"
      style={`width: ${percentage}%; background: ${colorMap[level]}`}
    ></div>
  </div>
</div>

<script lang="ts">
  type BadgeLevel = "high" | "medium" | "low" | "nodata";

  interface BadgeProps {
    level: BadgeLevel;
    label?: string;
  }

  const defaultLabels: Record<BadgeLevel, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
    nodata: "No Data",
  };

  let { level, label }: BadgeProps = $props();
</script>

<span class={`badge badge-${level}`}>
  {label || defaultLabels[level]}
</span>

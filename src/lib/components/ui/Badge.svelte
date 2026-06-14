<script lang="ts">
  // Score/level badge — status color fill at low opacity + matching text, always with a
  // text label (DESIGN.md §5: color is never the only carrier of meaning).
  // Convention (see app.css .badge-*): high competition/volume reads as danger,
  // low reads as success, medium as warning, nodata as muted.
  let { level, label, text, variant }: {
    level?: "low" | "medium" | "high" | "nodata";
    /** Display text. Defaults to a capitalized `level`. */
    label?: string;
    /** Legacy alias for `label`. */
    text?: string;
    /** Legacy variant API (kept for back-compat). */
    variant?: "default" | "success" | "warning" | "error" | "info";
  } = $props();

  const variantToLevel: Record<string, "low" | "medium" | "high" | "nodata"> = {
    success: "low",
    warning: "medium",
    error: "high",
    info: "nodata",
    default: "nodata",
  };

  const resolvedLevel = $derived(level ?? (variant ? variantToLevel[variant] : "nodata"));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const display = $derived(label ?? text ?? cap(resolvedLevel));
</script>

<span class="badge badge-{resolvedLevel}">{display}</span>

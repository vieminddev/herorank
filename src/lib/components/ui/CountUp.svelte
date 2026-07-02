<script lang="ts">
  import { onMount } from "svelte";

  // Animated number count-up for metric reveals. Respects prefers-reduced-motion (jumps to final).
  let { value, duration = 700, decimals = 0, prefix = "", suffix = "", locale = true }: {
    value: number;
    duration?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    /** Use locale thousands separators. */
    locale?: boolean;
  } = $props();

  let display = $state(0);

  const fmt = (n: number) =>
    locale
      ? n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : n.toFixed(decimals);

  onMount(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) { display = value; return; }
    const from = 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      display = from + (value - from) * eased;
      if (t < 1) raf = requestAnimationFrame(tick);
      else display = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<span>{prefix}{fmt(display)}{suffix}</span>

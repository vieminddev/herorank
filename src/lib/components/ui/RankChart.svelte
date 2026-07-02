<script lang="ts">
  /**
   * RankChart — a reusable rank-over-time chart (line, or sparkline).
   *
   * Replaces the three hand-rolled bar charts that hardcoded `maxRank = 40`. The axis is
   * computed from the ACTUAL data range, so a listing sitting at #80 isn't silently clipped
   * to the floor — ranks worse than the window are still drawn honestly.
   *
   * Rank semantics: with `goodLow` (the default), rank 1 is the best, so the axis is INVERTED
   * — better ranks sit higher on the chart. Points with a null rank ("outside top 100") break
   * the line and are NOT plotted, so the trend never lies about a gap.
   *
   * Lightweight SVG: a `viewBox` + `width: 100%` keeps it crisp and legible down to 375px.
   */
  type Point = { date: number | string; rank: number | null };
  type Marker = { date: number | string; label: string };

  let {
    points,
    markers = [],
    goodLow = true,
    sparkline = false,
    height,
    ariaLabel,
  }: {
    points: Point[];
    /** Vertical annotation lines (e.g. title-change dates). */
    markers?: Marker[];
    /** rank 1 is best → invert the axis so better ranks sit higher. Default true. */
    goodLow?: boolean;
    /** Compact mode: no axis labels/grid, thin line — for in-row trend cells. */
    sparkline?: boolean;
    /** Plot-area height in px. Defaults to 160 (full) / 32 (sparkline). */
    height?: number;
    ariaLabel?: string;
  } = $props();

  // viewBox coordinate space (CSS scales it to 100% width). Picked so 1 unit ≈ 1px at full size.
  const VB_W = 600;
  const padL = $derived(sparkline ? 2 : 34);
  const padR = $derived(sparkline ? 2 : 12);
  const padT = $derived(sparkline ? 3 : 14);
  const padB = $derived(sparkline ? 3 : 26);
  const plotH = $derived(height ?? (sparkline ? 32 : 160));
  const VB_H = $derived(plotH + padT + padB);

  const toTime = (d: number | string): number => {
    if (typeof d === "number") return d < 1e12 ? d * 1000 : d; // epoch sec → ms
    const t = Date.parse(d);
    return Number.isNaN(t) ? 0 : t;
  };

  // Normalize, drop null ranks (gaps), order oldest → newest by date.
  const series = $derived(
    points
      .map((p, i) => ({ t: toTime(p.date), rank: p.rank, i }))
      .filter((p): p is { t: number; rank: number; i: number } => p.rank != null && p.rank > 0)
      .sort((a, b) => a.t - b.t || a.i - b.i),
  );

  // Axis bounds from ACTUAL data (never a hardcoded 40). One spot of headroom each side so the
  // best/worst points don't sit flush against the frame; a single point gets a symmetric window.
  const ranks = $derived(series.map((p) => p.rank));
  const dataMin = $derived(ranks.length ? Math.min(...ranks) : 1);
  const dataMax = $derived(ranks.length ? Math.max(...ranks) : 1);
  const axisBest = $derived(Math.max(1, dataMin - 1)); // best rank shown (smallest number)
  const axisWorst = $derived(dataMax === dataMin ? dataMax + 1 : dataMax + 1);

  // Time bounds.
  const times = $derived(series.map((p) => p.t));
  const tMin = $derived(times.length ? Math.min(...times) : 0);
  const tMax = $derived(times.length ? Math.max(...times) : 0);

  const xOf = (t: number): number => {
    const w = VB_W - padL - padR;
    if (tMax === tMin) return padL + w / 2;
    return padL + ((t - tMin) / (tMax - tMin)) * w;
  };
  // goodLow: best (small rank) → top of plot. Higher rank → lower on chart.
  const yOf = (rank: number): number => {
    const span = axisWorst - axisBest || 1;
    const frac = (rank - axisBest) / span; // 0 at best, 1 at worst
    const f = goodLow ? frac : 1 - frac;
    return padT + f * plotH;
  };

  const linePath = $derived(
    series.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)} ${yOf(p.rank).toFixed(1)}`).join(" "),
  );
  // Area under the line (down to the baseline) for a soft brand-green fill.
  const areaPath = $derived(
    series.length
      ? `${linePath} L${xOf(series[series.length - 1].t).toFixed(1)} ${(padT + plotH).toFixed(1)} L${xOf(series[0].t).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : "",
  );

  const fmtDate = (t: number): string =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Marker lines, only those within the time window (and only when we have a real window).
  const markerLines = $derived(
    sparkline || tMax === tMin
      ? []
      : markers
          .map((m) => ({ t: toTime(m.date), label: m.label }))
          .filter((m) => m.t >= tMin && m.t <= tMax)
          .map((m) => ({ ...m, x: xOf(m.t) })),
  );

  // y-axis ticks (best + worst) for the full chart.
  const yTicks = $derived(sparkline ? [] : [axisBest, axisWorst]);

  const uid = `rc-${Math.random().toString(36).slice(2, 8)}`;
  const label = $derived(
    ariaLabel ??
      (series.length
        ? `Rank over time: from #${series[0].rank} to #${series[series.length - 1].rank}`
        : "Rank over time chart"),
  );
</script>

{#if series.length === 0}
  {#if !sparkline}
    <div class="resting">
      <p class="text-sm text-text-secondary">No rank data to chart yet.</p>
    </div>
  {/if}
{:else}
  <svg
    viewBox="0 0 {VB_W} {VB_H}"
    width="100%"
    height={sparkline ? plotH + padT + padB : undefined}
    preserveAspectRatio="none"
    role="img"
    aria-label={label}
    class="block {sparkline ? '' : 'select-none'}"
    style={sparkline ? `max-height:${plotH + padT + padB}px` : ""}
  >
    <title>{label}</title>
    <defs>
      <linearGradient id="{uid}-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--teal)" stop-opacity={sparkline ? "0.18" : "0.22"} />
        <stop offset="100%" stop-color="var(--teal)" stop-opacity="0" />
      </linearGradient>
    </defs>

    {#if !sparkline}
      <!-- y gridlines + labels (best at top, worst at bottom) -->
      {#each yTicks as r, i (r + "-" + i)}
        <line x1={padL} y1={yOf(r)} x2={VB_W - padR} y2={yOf(r)} stroke="var(--border-light)" stroke-width="1" vector-effect="non-scaling-stroke" />
        <text x={padL - 6} y={yOf(r) + 3} text-anchor="end" font-size="11" fill="var(--text-muted)">#{r}</text>
      {/each}

      <!-- marker lines (gold) with labels -->
      {#each markerLines as m, i (i)}
        <line x1={m.x} y1={padT} x2={m.x} y2={padT + plotH} stroke="var(--orange)" stroke-width="1.5" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
        <circle cx={m.x} cy={padT} r="3" fill="var(--orange)" />
      {/each}
    {/if}

    <!-- area + line (brand green) -->
    {#if !sparkline}
      <path d={areaPath} fill="url(#{uid}-fill)" />
    {/if}
    <path
      d={linePath}
      fill="none"
      stroke="var(--teal)"
      stroke-width={sparkline ? "2" : "2.5"}
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />

    {#if !sparkline}
      <!-- data points + rank labels -->
      {#each series as p, i (i)}
        <circle cx={xOf(p.t)} cy={yOf(p.rank)} r="3" fill="var(--teal)" stroke="white" stroke-width="1.5" />
      {/each}
      <!-- x-axis end dates -->
      <text x={padL} y={VB_H - 8} text-anchor="start" font-size="11" fill="var(--text-muted)">{fmtDate(tMin)}</text>
      {#if tMax !== tMin}
        <text x={VB_W - padR} y={VB_H - 8} text-anchor="end" font-size="11" fill="var(--text-muted)">{fmtDate(tMax)}</text>
      {/if}
    {/if}
  </svg>

  {#if !sparkline && markerLines.length > 0}
    <!-- marker legend (labels can't reliably fit inline at ≤375px) -->
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {#each markerLines as m, i (i)}
        <li class="flex items-center gap-1.5 text-xs text-text-secondary">
          <span class="inline-block w-2.5 h-0.5" style="background: var(--orange)"></span>
          <span class="font-medium text-text-primary">{m.label}</span>
          <span class="text-text-muted tabular-nums">{fmtDate(m.t)}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

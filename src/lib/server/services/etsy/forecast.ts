/**
 * Predictive trend forecasting (the competitive differentiator) — a PURE function, no deps.
 *
 * Given a keyword's recorded demand time-series, fit a simple ordinary-least-squares line over
 * weeks and project one week ahead. This is a FORECAST/estimate, never a guarantee: the caller
 * surfaces it with an honest label and a confidence that scales with how much history exists.
 *
 * Honesty rules baked in here:
 *   - <3 points → 'building': not enough history to forecast (projectedIndex = null).
 *   - residual variance high relative to the trend → 'volatile' (the line doesn't explain the
 *     data, so we don't pretend a direction is reliable).
 *   - confidence is derived purely from `basedOn` (point count): 3-4 low / 5-8 medium / 9+ high.
 */
import type { TrendForecast } from './types';

/** Min points before we'll fit a line at all. */
const MIN_POINTS = 3;
/** |slope| below this (index-points/week) is "steady" — within weekly noise. */
const STEADY_SLOPE = 0.75;
/**
 * Residual std-dev (points) above which we call the series 'volatile' instead of trusting the
 * direction. Tuned so a clean ramp stays rising/cooling but a saw-tooth flips to volatile.
 */
const VOLATILE_RESID = 12;

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function confidenceFor(basedOn: number): TrendForecast['confidence'] {
  if (basedOn >= 9) return 'high';
  if (basedOn >= 5) return 'medium';
  return 'low';
}

/**
 * Forecast next-week demand from a chronological series. Points need not be perfectly spaced;
 * x is normalized to weeks from the first capture so real cadence (~weekly cron) is respected.
 */
export function forecastTrend(
  points: { capturedAt: number; demandScore: number }[]
): TrendForecast {
  const series = [...points].sort((a, b) => a.capturedAt - b.capturedAt);
  const n = series.length;

  // Not enough history to draw a line — be honest, don't fabricate a direction.
  if (n < MIN_POINTS) {
    return {
      signal: 'building',
      projectedIndex: null,
      slopePerWeek: 0,
      confidence: 'low',
      basedOn: n,
    };
  }

  const WEEK = 7 * 86_400; // seconds
  const t0 = series[0].capturedAt;
  const xs = series.map((p) => (p.capturedAt - t0) / WEEK); // weeks from first capture
  const ys = series.map((p) => p.demandScore);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    sxx += dx * dx;
    sxy += dx * (ys[i] - meanY);
  }

  // Degenerate x (all captures at the same instant) → no slope; treat as steady at the mean.
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;

  // Residual std-dev: how far the points scatter off the fitted line.
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const fit = intercept + slope * xs[i];
    const r = ys[i] - fit;
    ssr += r * r;
  }
  const residStd = Math.sqrt(ssr / n);

  // Project one week past the most-recent capture.
  const nextX = xs[n - 1] + 1;
  const projectedIndex = Math.round(clamp01to100(intercept + slope * nextX));

  let signal: TrendForecast['signal'];
  if (residStd > VOLATILE_RESID) {
    signal = 'volatile';
  } else if (slope > STEADY_SLOPE) {
    signal = 'rising';
  } else if (slope < -STEADY_SLOPE) {
    signal = 'cooling';
  } else {
    signal = 'steady';
  }

  return {
    signal,
    projectedIndex,
    slopePerWeek: Math.round(slope * 100) / 100,
    confidence: confidenceFor(n),
    basedOn: n,
  };
}

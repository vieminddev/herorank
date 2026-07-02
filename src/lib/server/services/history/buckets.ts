/**
 * Bucket math for `metric_series` (PURE — no I/O, fully unit-testable).
 *
 * A "bucket" is the integer index that makes a timestamp idempotent at a given cadence: re-writing
 * the same (entity, metric, granularity, bucket) UPSERTs one row instead of appending duplicates.
 *   - day   → floor(epochSec / 86400)            (UTC day number since epoch)
 *   - week  → floor(epochSec / 604800)           (UTC week number since epoch; matches legacy week_bucket)
 *   - month → year*12 + (month-1)                (calendar month index — months aren't fixed-length)
 *
 * `bucketStart` returns the canonical epoch-seconds timestamp for a bucket (used as the chart x-axis
 * `ts`), so two writers landing in the same bucket agree on the same representative time.
 */
export type Granularity = 'day' | 'week' | 'month';

const DAY = 86_400;
const WEEK = 7 * DAY;

/** The bucket index for an epoch-seconds timestamp at the given granularity. */
export function bucketFor(epochSec: number, granularity: Granularity): number {
  if (granularity === 'day') return Math.floor(epochSec / DAY);
  if (granularity === 'week') return Math.floor(epochSec / WEEK);
  // month: decompose UTC date → year*12 + monthIndex
  const d = new Date(epochSec * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** The canonical epoch-seconds timestamp at the START of a bucket (UTC). */
export function bucketStart(bucket: number, granularity: Granularity): number {
  if (granularity === 'day') return bucket * DAY;
  if (granularity === 'week') return bucket * WEEK;
  // month: bucket = year*12 + monthIndex
  const year = Math.floor(bucket / 12);
  const month = bucket % 12;
  return Math.floor(Date.UTC(year, month, 1) / 1000);
}

/** Number of days a bucket spans (28–31 for months) — used to normalise per-period rates. */
export function bucketDays(bucket: number, granularity: Granularity): number {
  if (granularity === 'day') return 1;
  if (granularity === 'week') return 7;
  const start = bucketStart(bucket, granularity);
  const next = bucketStart(bucket + 1, granularity);
  return Math.round((next - start) / DAY);
}

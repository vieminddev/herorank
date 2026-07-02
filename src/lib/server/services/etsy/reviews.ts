/**
 * Review helpers (Engineer F) — small pure utilities shared by the shop-analyzer route (quick) and
 * the deep shop-analysis job, so both surface reviews identically.
 */
import type { EtsyReview } from './types';

/**
 * Collapse Etsy's per-transaction review duplication.
 *
 * Etsy returns reviews PER TRANSACTION, so a single written review left on a multi-item order is
 * replicated once per item — surfacing as N identical entries (same timestamp + rating + text) and
 * inflating both the recent-reviews list and the rating distribution (the symptom: eight identical
 * "Beautiful magnets…" rows on the same day).
 *
 * The dedupe key for a WRITTEN review is `rating | trimmed text` — it intentionally EXCLUDES both
 * `listing_id` (so one review spanning different items in an order collapses) AND
 * `created_timestamp` (Etsy stamps each replicated transaction-review with its OWN second, so a
 * timestamp-based key would let the duplicates slip through — the bug we hit). Two distinct buyers
 * posting byte-identical non-trivial text is vanishingly unlikely, so this won't drop real reviews.
 *
 * RATING-ONLY reviews (no text) are NOT collapsed — many buyers legitimately leave the same star
 * with no comment, and we can't tell them apart, so every one is kept (keyed by position).
 *
 * Order is preserved (first occurrence wins).
 */
export function dedupeReviews(reviews: EtsyReview[]): EtsyReview[] {
  const seen = new Set<string>();
  const out: EtsyReview[] = [];
  let blankCount = 0;
  for (const r of reviews) {
    const text = (r.review ?? '').trim();
    const key = text ? `${r.rating}|${text}` : `blank:${blankCount++}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

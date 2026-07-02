-- Idempotency for the weekly research cron (data-strategy report follow-up).
--
-- Problem: keywords_cache / shop_pulse were append-only with no per-week uniqueness, so a
-- double-triggered or retried weekly cron inserted DUPLICATE same-week snapshots — which skews the
-- forecast OLS regression (multiple points share one x) and the sales-velocity delta.
--
-- Fix: a `week_bucket` = floor(captured_at / 604800) (weeks since epoch) + a UNIQUE index per
-- (entity, week_bucket). The cron now UPSERTs via ON CONFLICT(entity, week_bucket) → exactly one
-- snapshot per entity per ISO-week; a re-run refreshes that week's row instead of duplicating.
--
-- Legacy rows (and the append-only insert() primitive used by ad-hoc callers/tests) leave
-- week_bucket NULL; SQLite treats NULLs as DISTINCT in a UNIQUE index, so they never conflict.
ALTER TABLE keywords_cache ADD COLUMN week_bucket INTEGER; -- floor(captured_at / 604800)
ALTER TABLE shop_pulse     ADD COLUMN week_bucket INTEGER;

CREATE UNIQUE INDEX idx_keywords_cache_week ON keywords_cache(keyword, week_bucket);
CREATE UNIQUE INDEX idx_shop_pulse_week     ON shop_pulse(shop_id, week_bucket);

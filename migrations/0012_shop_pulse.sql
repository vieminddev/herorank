-- Cron data-strategy report (2026-06-22): Nhịp B (shop sales velocity) + Nhịp A expansion.
--
-- Nhịp B — shop_pulse: weekly snapshot of a shop's PUBLIC counters. The crown jewel is
-- `sold_count` (= transaction_sold_count, REAL lifetime sales, public on GET /shops/{id}); its
-- week-over-week delta is REAL sales velocity — no estimation. Also lets us calibrate the
-- review-rate from PUBLIC shops (review_count / sold_count) without needing OAuth-connected shops.
CREATE TABLE shop_pulse (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id         INTEGER NOT NULL,
  category_id     INTEGER,                       -- seed category this shop was discovered under
  sold_count      INTEGER,                       -- transaction_sold_count (lifetime, REAL)
  review_count    INTEGER,                       -- lifetime reviews
  active_listings INTEGER,                       -- listing_active_count
  num_favorers    INTEGER,
  review_average  REAL,                          -- 0-5
  captured_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_shop_pulse ON shop_pulse(shop_id, captured_at);
CREATE INDEX idx_shop_pulse_cat ON shop_pulse(category_id, captured_at);

-- Nhịp A expansion — richer per-keyword weekly snapshot columns on keywords_cache (all nullable,
-- backward compatible; older rows predate them). Prices in cents (Etsy money amount).
ALTER TABLE keywords_cache ADD COLUMN price_median       INTEGER;  -- median listing price (cents)
ALTER TABLE keywords_cache ADD COLUMN price_p25          INTEGER;  -- 25th percentile price (cents)
ALTER TABLE keywords_cache ADD COLUMN price_p75          INTEGER;  -- 75th percentile price (cents)
ALTER TABLE keywords_cache ADD COLUMN median_views       INTEGER;  -- median lifetime views of sample
ALTER TABLE keywords_cache ADD COLUMN has_variations_pct INTEGER;  -- % of sample with variations (0-100)
ALTER TABLE keywords_cache ADD COLUMN new_listings_7d    INTEGER;  -- sampled new listings in last 7 days

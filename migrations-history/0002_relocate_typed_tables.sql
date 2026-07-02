-- vierank-history :: 0002_relocate_typed_tables
--
-- Relocate the three TYPED time-series tables out of the OLTP `herorank` DB into this analytics DB,
-- so ALL history lives in vierank-history (per-DB 10GB isolation) while keeping their well-typed,
-- fixed-shape schema (they are NOT a fit for the long-format metric_series — they carry categorical
-- `competition`, multi-field weekly snapshots, and cross-keyword reads). The store interfaces are
-- unchanged; only the DB handle they're built with moves to HISTORY_DB. DDL reproduced exactly from
-- the live OLTP schema (incl. the columns added by OLTP migrations 0011/0012) so reads/writes match.

CREATE TABLE IF NOT EXISTS keywords_cache (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword            TEXT NOT NULL,
  category_id        INTEGER,
  demand_score       INTEGER NOT NULL,
  result_count       INTEGER NOT NULL,
  competition        TEXT NOT NULL,
  captured_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  agg_views          INTEGER,
  price_median       INTEGER,
  price_p25          INTEGER,
  price_p75          INTEGER,
  median_views       INTEGER,
  has_variations_pct INTEGER,
  new_listings_7d    INTEGER,
  week_bucket        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_keywords_cache_kw ON keywords_cache(keyword, captured_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_cache_week ON keywords_cache(keyword, week_bucket);

CREATE TABLE IF NOT EXISTS shop_pulse (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id         INTEGER NOT NULL,
  category_id     INTEGER,
  sold_count      INTEGER,
  review_count    INTEGER,
  active_listings INTEGER,
  num_favorers    INTEGER,
  review_average  REAL,
  captured_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  week_bucket     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shop_pulse ON shop_pulse(shop_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_shop_pulse_cat ON shop_pulse(category_id, captured_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_pulse_week ON shop_pulse(shop_id, week_bucket);

CREATE TABLE IF NOT EXISTS rank_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL,
  keyword      TEXT NOT NULL,
  position     INTEGER,
  captured_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_rank_hist ON rank_history(listing_id, keyword, captured_at);

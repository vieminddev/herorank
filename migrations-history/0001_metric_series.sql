-- vierank-history :: 0001_metric_series
--
-- The ONE table that holds every historical market signal as a long-format time-series. Adding a
-- new customer-facing history feature later means writing a new `metric` value (or a new
-- `entity_type` / `granularity`) — NEVER a schema migration. That is the whole point of this shape:
-- the data model is closed, the metric vocabulary is open.
--
-- Columns:
--   entity_type  what the series is about: 'keyword' | 'shop' | 'listing' | 'category'
--   entity_id    the keyword string / shop id / listing id (TEXT so any id space fits)
--   metric       the signal: 'demand' | 'price_median' | 'sold_count' | 'sold_per_week'
--                'reviews' | 'views' | 'rank' | 'new_listings' | 'active_listings' | ...
--   granularity  'day' | 'week' | 'month' — one table serves all cadences
--   bucket       integer bucket index for (granularity): day=floor(ts/86400), week=floor(ts/604800),
--                month=year*12+(month-1). The idempotency key — one row per bucket.
--   ts           representative epoch-seconds timestamp for the bucket (for charting/x-axis)
--   value        the numeric value
--   source       provenance: 'cron' | 'review-backfill' | 'oauth-tx' | 'listing-fetch' | 'rank-track'
--                lets backfilled (proxy) points be told apart from live ones and re-backfilled safely
--   meta         optional JSON for extra context (e.g. category_id, confidence) — never queried in SQL
--
-- WITHOUT ROWID: the table is clustered by the composite PK, so the dominant read — a single entity's
-- series for one metric ordered by bucket — is a contiguous index range scan with no secondary lookup.
CREATE TABLE IF NOT EXISTS metric_series (
  entity_type TEXT    NOT NULL,
  entity_id   TEXT    NOT NULL,
  metric      TEXT    NOT NULL,
  granularity TEXT    NOT NULL,
  bucket      INTEGER NOT NULL,
  ts          INTEGER NOT NULL DEFAULT (unixepoch()),
  value       REAL    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'cron',
  meta        TEXT,
  PRIMARY KEY (entity_type, entity_id, metric, granularity, bucket)
) WITHOUT ROWID;

-- Cross-entity reads (leaderboards: "every shop's latest sold_per_week") + retention pruning by age
-- (DELETE WHERE granularity=? AND bucket < cutoff). Leads with metric so a single metric scans tight.
CREATE INDEX IF NOT EXISTS idx_metric_series_metric
  ON metric_series (entity_type, metric, granularity, bucket);

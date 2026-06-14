-- Phase 3: Etsy data layer (Engineer F) — quota counter + keyword time-series + saved analyses.
-- Verified against 0002_herorank.sql: none of these tables exist yet (subscriptions,
-- credits_ledger, processed_stripe_events only). References use Better Auth "user" (quoted).

-- Daily Etsy API usage counter (spec §1.5). One row per UTC day; atomic upsert in usageCounter.
CREATE TABLE etsy_api_usage (
  day    TEXT PRIMARY KEY,              -- 'YYYY-MM-DD' UTC
  count  INTEGER NOT NULL DEFAULT 0
);

-- Keyword estimate history — time series for trendDelta (spec §3.4). KV holds the CURRENT
-- payload; this holds point-in-time snapshots so trends/delta can compare cache periods.
CREATE TABLE keywords_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword       TEXT NOT NULL,          -- normalized
  category_id   INTEGER,                -- taxonomy node, nullable
  demand_score  INTEGER NOT NULL,       -- 0-100 estimate (§3.1)
  result_count  INTEGER NOT NULL,       -- competing listings (proxy competition)
  competition   TEXT NOT NULL,          -- 'low'|'medium'|'high'
  captured_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_keywords_cache_kw ON keywords_cache(keyword, captured_at);

-- Saved tool analyses (spec §2.4) — Phase 3 introduces optional persistence so rank-check can
-- show a REAL history chart instead of mock. Per-user, per-tool. Other tools may write later.
CREATE TABLE analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,            -- 'rank-check' | 'listing-analyzer' | ...
  subject     TEXT NOT NULL,            -- listing_id | shop_id | keyword (composite ok)
  payload     TEXT NOT NULL,            -- JSON snapshot
  metric      INTEGER,                  -- e.g. rank position, for cheap charting
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_analyses_user_tool ON analyses(user_id, tool, subject, created_at);

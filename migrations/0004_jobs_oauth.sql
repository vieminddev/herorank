-- Phase 4: jobs (cron rank-tracking + deep-analysis queue) + OAuth connected shops.
-- Single migration file (Engineer F owns); the OAuth/calibration DDL text below is supplied
-- by Engineer H per Contract A coordination (one file, one author) — H only READS these tables.
-- Strictly ordered after 0003_etsy.sql: deep-shop-analysis REUSES the `analyses` table from
-- 0003 (status flows queued→running→done/failed/deferred) — no new table for the queue (A4).
-- References use Better Auth's "user" table (quoted: it is a SQLite keyword).

-- ---------------------------------------------------------------------------
-- 1. Periodic rank tracking (Engineer F) — §1.4
-- ---------------------------------------------------------------------------

-- A user's tracked (listing, keyword) pairs. Plan-gated count (free 0 / side 10 / business 50 /
-- enterprise 200), NOT credit-charged (BR-P4-TRACK-02). The 30-min cron sweeps rows whose
-- last_checked_at is older than 24h (idempotent per listing/day, BR-P4-CRON-01).
CREATE TABLE tracked_listings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  listing_id      INTEGER NOT NULL,
  keyword         TEXT NOT NULL,                 -- normalized (lowercase, collapsed whitespace)
  last_rank       INTEGER,                       -- nullable: null = "not in top 100"
  last_checked_at INTEGER,                       -- epoch seconds; null = never checked
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, listing_id, keyword)           -- one track per (user, listing, keyword)
);
-- The cron's "due for refresh" scan orders by last_checked_at ASC (nulls first).
CREATE INDEX idx_tracked_due ON tracked_listings(last_checked_at);
CREATE INDEX idx_tracked_user ON tracked_listings(user_id);

-- GLOBAL rank history keyed by (listing_id, keyword) — NOT user_id (PM decision: rank for a
-- listing+keyword is shared, same principle as Phase 3's global cache BR-P3-05). Two users
-- tracking the same listing share history; the cron writes ONE row per sweep. The FE chart for
-- a tracked listing reads here; one-off rank-checks still write per-user `analyses` (0003).
CREATE TABLE rank_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL,
  keyword      TEXT NOT NULL,                     -- normalized
  position     INTEGER,                           -- nullable: null = outside top 100
  captured_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_rank_hist ON rank_history(listing_id, keyword, captured_at);

-- ---------------------------------------------------------------------------
-- 2. OAuth connected shops (Engineer H specifies; F owns the file) — §3.2
-- ---------------------------------------------------------------------------

-- Short-lived CSRF + PKCE state, written at /start, deleted at /callback, pruned by age.
CREATE TABLE oauth_states (
  state         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())   -- TTL-pruned (~10 min) in callback
);
CREATE INDEX idx_oauth_states_created ON oauth_states(created_at);

-- One connected Etsy shop per user (v1, PK user_id). Tokens encrypted at rest (AES-GCM via
-- OAUTH_TOKEN_KEY, BR-P4-OAUTH-03) — NEVER stored or logged in plaintext.
CREATE TABLE connected_shops (
  user_id            TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  etsy_shop_id       INTEGER NOT NULL,
  shop_name          TEXT,
  access_token_enc   TEXT NOT NULL,     -- ciphertext (§3.3)
  refresh_token_enc  TEXT NOT NULL,     -- ciphertext
  token_expires_at   INTEGER NOT NULL,  -- epoch seconds
  scopes             TEXT NOT NULL,     -- space-joined granted scopes
  connected_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  last_calibrated_at INTEGER
);

-- Calibration output: aggregate real review-rate per top-level category from connected shops'
-- OWN transactions. The estimation engine READS this (via an injected reviewRateProvider, G's
-- surgical edit) — it does NOT hardcode constants (BR-P4-CAL-01). Only AGGREGATE rates are
-- persisted; no per-shop raw sales (BR-P4-OAUTH-04).
CREATE TABLE calibration_factors (
  category_id     INTEGER PRIMARY KEY,   -- top-level taxonomy node id
  review_rate     REAL NOT NULL,         -- measured Σreviews / Σtransactions for this category
  sample_size     INTEGER NOT NULL,      -- # transactions backing this (confidence; MIN_SAMPLE gate)
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

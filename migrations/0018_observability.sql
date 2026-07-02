-- Observability: persisted cron-run audit trail + production error log (queryable in D1).
-- Lets you `SELECT * FROM error_log ORDER BY at DESC` / `SELECT * FROM cron_runs ...` directly
-- via wrangler — no external service needed. Both are best-effort sinks (never block a request).

CREATE TABLE IF NOT EXISTS cron_runs (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  job    TEXT    NOT NULL,            -- 'rank-track' | 'trends' | 'best-sellers' | 'retention'
  ok     INTEGER NOT NULL,           -- 1 = success, 0 = failure
  detail TEXT,                        -- short summary or error message
  ran_at INTEGER NOT NULL            -- epoch seconds
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_ran ON cron_runs (job, ran_at DESC);

CREATE TABLE IF NOT EXISTS error_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       INTEGER NOT NULL,         -- epoch seconds
  where_at TEXT    NOT NULL,         -- route path / handler tag
  method   TEXT,                      -- HTTP method (when from a request)
  status   INTEGER,                   -- HTTP status (5xx)
  message  TEXT,                      -- error message (no PII)
  detail   TEXT,                      -- optional extra (stack head, error code)
  user_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_log_at ON error_log (at DESC);

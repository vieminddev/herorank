-- HeroRank custom tables (Phase 1). Better Auth core tables come from 0001_better_auth.sql.
-- References use Better Auth's "user" table (quoted: it is a SQLite keyword).

CREATE TABLE subscriptions (
  user_id                TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL DEFAULT 'free',    -- free|side|business|enterprise
  status                 TEXT NOT NULL DEFAULT 'active',  -- active|past_due|canceled
  period                 TEXT,                            -- monthly|yearly|NULL (free)
  stripe_customer_id     TEXT UNIQUE,                     -- BR-011: 1-1 with user
  stripe_subscription_id TEXT,
  current_period_end     INTEGER,                         -- epoch seconds
  credits_balance        INTEGER NOT NULL DEFAULT 0,      -- cache; ledger is source of truth (BR-007)
  created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE credits_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,             -- + grant, - spend (BR-006)
  reason        TEXT NOT NULL,                -- 'grant:plan' | 'grant:signup' | 'spend:tool'
  ref           TEXT,                         -- tool name | stripe_event_id
  balance_after INTEGER NOT NULL,             -- snapshot for audit
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ledger_user ON credits_ledger(user_id, created_at);

-- Idempotency for Stripe webhooks (BR-010).
CREATE TABLE processed_stripe_events (
  event_id   TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

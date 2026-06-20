-- Notifications (in-app feed) + watchlist (watched Etsy shops).
-- References use Better Auth's "user" table (quoted: it is a SQLite keyword).

-- ---------------------------------------------------------------------------
-- 1. Notifications — per-user in-app notification feed.
-- ---------------------------------------------------------------------------

-- One row per notification. `read_at` null = unread (the unread count and mark-read flows key
-- off `read_at IS NULL`). `body`/`ref` are optional payload. created_at/read_at = epoch seconds.
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,                                  -- nullable payload
  ref        TEXT,                                  -- nullable reference (e.g. linked entity)
  read_at    INTEGER,                               -- epoch seconds; null = unread
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- The feed lists newest-first per user; unread count filters user_id + read_at IS NULL.
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Watchlist — a user's watched Etsy shops.
-- ---------------------------------------------------------------------------

-- One row per (user, shop_name). Insert is idempotent via ON CONFLICT(user_id, shop_name).
-- `note` is optional. created_at = epoch seconds.
CREATE TABLE watched_shops (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  shop_name  TEXT NOT NULL,
  note       TEXT,                                  -- nullable user note
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, shop_name)                        -- one watch per (user, shop)
);
CREATE INDEX idx_watched_shops_user ON watched_shops(user_id, created_at);

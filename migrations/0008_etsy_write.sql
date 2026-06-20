-- Phase: Etsy write tools + browser extension + post-purchase review outreach.
-- New tables for the `/my-shop` and `/ext` routers (Engineer F). References use Better Auth's
-- "user" table (quoted: it is a SQLite keyword). All timestamps are epoch SECONDS.

-- ---------------------------------------------------------------------------
-- 1. Extension tokens — opaque bearer token for the browser extension (`/ext`).
-- ---------------------------------------------------------------------------

-- One token per user (PK user_id). The `/ext/token` endpoints issue/rotate a `vrk_<hex>`
-- token; `/ext/listing/:id` + `/ext/keyword` authenticate via `userFromBearer` (Bearer header,
-- NOT a session cookie). Rotation upserts on user_id; the unique index on `token` lets the
-- bearer lookup hit the column directly.
CREATE TABLE extension_tokens (
  user_id    TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX idx_extension_tokens_token ON extension_tokens(token);

-- ---------------------------------------------------------------------------
-- 2. Review outreach — per (user, receipt) post-purchase review-request status.
-- ---------------------------------------------------------------------------

-- Tracks whether the seller has contacted / skipped a buyer for a review on a given receipt.
-- Upsert keyed by (user_id, receipt_id); status is 'contacted' | 'skipped'.
CREATE TABLE review_outreach (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  receipt_id INTEGER NOT NULL,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, receipt_id)
);

-- ---------------------------------------------------------------------------
-- 3. Listing backups — pre-edit snapshots for the write/restore flow.
-- ---------------------------------------------------------------------------

-- Before a `/my-shop/listing/:id/update` writes to Etsy, the prior title/description/tags are
-- snapshotted here as JSON so `/my-shop/listing/:id/restore` can roll back. Multiple backups
-- per (user, listing); the listing detail endpoint lists the 10 most recent newest-first.
CREATE TABLE listing_backups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  listing_id    INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_listing_backups_user_listing ON listing_backups(user_id, listing_id, created_at);

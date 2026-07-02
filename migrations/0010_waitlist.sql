-- Feature waitlist — honest interest capture for deferred tools (e.g. Video Maker /
-- video-generator, which has no render backend yet). The tool page POSTs an email here;
-- this is the missing backend the FE has always called (`/api/waitlist/video-generator`).
-- References use Better Auth's "user" table (quoted: "user" is a SQLite keyword).

-- One row per (tool, email). Re-joining the same waitlist is idempotent via
-- ON CONFLICT(tool, email) DO NOTHING. `user_id` is the signed-in user (nullable so a row
-- survives account deletion). created_at = epoch seconds.
CREATE TABLE waitlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tool       TEXT NOT NULL,
  email      TEXT NOT NULL,
  user_id    TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The idempotency key: one (tool, email) pair. The route's ON CONFLICT relies on this.
CREATE UNIQUE INDEX idx_waitlist_tool_email ON waitlist(tool, email);

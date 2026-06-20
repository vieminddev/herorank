-- Phase 5/6: title-experiment markers (Engineer F) for the `/api/tools/experiments` endpoints.
-- A seller logs when they changed a listing's title (an A/B "experiment") so the FE can chart
-- rank movement against the change date. NOT credit-charged. References Better Auth's "user"
-- table (quoted: it is a SQLite keyword). All timestamps are epoch SECONDS.

-- One row per logged title change. `keyword` is stored normalized (lowercase, collapsed
-- whitespace) so the GET lookup matches the POST insert. `note` is optional. The detail query
-- filters by (user_id, listing_id, keyword) and orders by changed_at ASC.
CREATE TABLE title_experiments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  listing_id  INTEGER NOT NULL,
  keyword     TEXT NOT NULL,                       -- normalized
  label       TEXT NOT NULL,                       -- short human label for the change
  note        TEXT,                                -- optional free-text note
  changed_at  INTEGER NOT NULL DEFAULT (unixepoch()) -- epoch seconds; client may supply
);
CREATE INDEX idx_title_experiments_lookup
  ON title_experiments(user_id, listing_id, keyword, changed_at);

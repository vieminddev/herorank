-- Collections / saved keyword lists. A user owns many named lists; each list holds many keyword
-- items (deduped per list). Not credit-charged — these are subscription-feature CRUD tables.
-- References use Better Auth's "user" table (quoted: it is a SQLite keyword). Timestamps are
-- epoch seconds (the app writes Math.floor(Date.now()/1000); DEFAULT mirrors that via unixepoch()).

-- A user's named keyword lists. item_count is derived (COUNT over keyword_list_items), not stored.
CREATE TABLE keyword_lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_keyword_lists_user ON keyword_lists(user_id, created_at);

-- Keywords saved into a list. Upserts dedup on (list_id, keyword) via ON CONFLICT … DO NOTHING,
-- so that pair MUST be UNIQUE. demand_score / result_count / competition are nullable snapshots.
CREATE TABLE keyword_list_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id      INTEGER NOT NULL REFERENCES keyword_lists(id) ON DELETE CASCADE,
  keyword      TEXT NOT NULL,
  demand_score INTEGER,                       -- nullable
  result_count INTEGER,                       -- nullable
  competition  TEXT,                          -- 'low' | 'medium' | 'high' | NULL
  added_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(list_id, keyword)                    -- one row per (list, keyword) — backs ON CONFLICT
);
CREATE INDEX idx_keyword_list_items_list ON keyword_list_items(list_id, added_at);

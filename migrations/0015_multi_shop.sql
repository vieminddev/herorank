-- Multi-shop: let a user connect MORE THAN ONE Etsy shop.
--
-- v1 had `connected_shops.user_id` as the PRIMARY KEY (1 shop/user). SQLite can't alter a PK in
-- place, so recreate the table with a composite key (user_id, etsy_shop_id) + an `is_primary` flag
-- (the default shop a tool uses when none is selected). Existing single shops migrate as primary.
CREATE TABLE connected_shops_new (
  user_id            TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  etsy_shop_id       INTEGER NOT NULL,
  shop_name          TEXT,
  access_token_enc   TEXT    NOT NULL,
  refresh_token_enc  TEXT    NOT NULL,
  token_expires_at   INTEGER NOT NULL,
  scopes             TEXT    NOT NULL,
  connected_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  last_calibrated_at INTEGER,
  is_primary         INTEGER NOT NULL DEFAULT 0,  -- 1 = the user's default shop
  PRIMARY KEY (user_id, etsy_shop_id)
);

-- Carry over existing connections; each prior single shop becomes that user's primary.
INSERT INTO connected_shops_new
  (user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at,
   scopes, connected_at, last_calibrated_at, is_primary)
SELECT user_id, etsy_shop_id, shop_name, access_token_enc, refresh_token_enc, token_expires_at,
       scopes, connected_at, last_calibrated_at, 1
FROM connected_shops;

DROP TABLE connected_shops;
ALTER TABLE connected_shops_new RENAME TO connected_shops;

CREATE INDEX idx_connected_shops_user ON connected_shops(user_id);
-- At most one primary shop per user (partial unique index; many non-primary rows allowed).
CREATE UNIQUE INDEX idx_connected_shops_primary ON connected_shops(user_id) WHERE is_primary = 1;

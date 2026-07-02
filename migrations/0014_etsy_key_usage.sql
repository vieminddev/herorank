-- Per-key daily usage counter for the Etsy API key POOL (multi-key rotation).
--
-- The single global `etsy_api_usage(day, count)` can't tell which app key is exhausted. With a key
-- pool (N Etsy apps, each 5000 RPD), we track usage PER KEY so the pool can skip a key that hit its
-- daily cap and rotate to the next — multiplying effective throughput to ~N×RPD.
--
-- key_id = the keystring prefix (first 8 chars), stable + non-sensitive (the shared secret is never
-- stored here). One row per (UTC day, key).
CREATE TABLE etsy_key_usage (
  day    TEXT    NOT NULL,
  key_id TEXT    NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key_id)
);

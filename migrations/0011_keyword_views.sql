-- Phase 4: Real-traffic demand signal. The Etsy listing object now exposes a REAL lifetime
-- `views` count, a far stronger demand signal than num_favorers (often 0). Persist the
-- aggregate views sampled per weekly snapshot so future analysis/forecasting can use real
-- traffic velocity (views-over-time), not just the faves/velocity blend.
--
-- Backward compatible: nullable column, existing rows stay NULL. No other table touched.
ALTER TABLE keywords_cache ADD COLUMN agg_views INTEGER;

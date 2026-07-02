-- herorank (OLTP) :: 0019_drop_relocated_history
--
-- The three typed time-series tables were relocated to the vierank-history DB
-- (migrations-history/0002) and all code now reads/writes them there via HISTORY_DB. Drop the now-
-- orphaned OLTP copies so the OLTP DB holds only transactional/user-scoped data. Data was copied to
-- vierank-history before this runs; APPLY ONLY AFTER deploying the code that points the stores at
-- HISTORY_DB (else the still-live old build would lose its tables).
DROP TABLE IF EXISTS keywords_cache;
DROP TABLE IF EXISTS shop_pulse;
DROP TABLE IF EXISTS rank_history;

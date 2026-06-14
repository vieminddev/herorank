-- Phase 5 hardening — F-01 (P0): make credit SPEND idempotent on `ref`.
--
-- Problem: `credits_ledger` had no UNIQUE constraint on `ref`, and `creditsRepo.spend()`
-- only ran a conditional debit (no ref dedup — only `grant()` checked `hasLedgerRef`). A
-- re-run of an already-charged job (DLQ replay / manual requeue after a status reset) could
-- therefore write a SECOND debit for the same logical operation → double-charge.
--
-- Fix (DB half): a PARTIAL UNIQUE index on (user_id, ref) for NON-NULL refs only. The unique
-- key turns a repeated debit for the same ref into a no-op at the storage layer; the app half
-- (creditsRepo.spend ON CONFLICT + ref-existence check) reads this to return idempotent success
-- instead of a second charge.
--
-- Why PARTIAL (WHERE ref IS NOT NULL):
--   * Signup grants are written with ref = NULL (auth hook calls grantPlanCredits(user,'free')
--     with no ref) → NULL rows must NOT collide. SQLite treats each NULL as distinct anyway,
--     but the explicit partial index makes the intent unambiguous and keeps the index smaller.
--   * Any legacy / seed rows that have ref = NULL are likewise exempt.
--
-- Why this is safe to apply on existing (dev) data:
--   * Grant refs are already unique by construction: `invoice:{invoice.id}` is one row per
--     billing cycle (and grant() ALREADY dedups via hasLedgerRef, so no duplicate invoice ref
--     can exist). Signup grants use ref = NULL (excluded by the partial predicate).
--   * Spend refs were previously the CONSTANT tool name (e.g. 'echo', 'shop-analysis-deep'),
--     so a user who called the same tool twice WOULD have duplicate (user_id, ref) rows in any
--     pre-existing data. The companion code change moves spend refs to per-REQUEST / per-JOB
--     unique values (`spend:{tool}:{requestId}`, `job:{jobId}`), so NEW rows never collide —
--     but OLD rows with the constant ref could make THIS index creation fail.
--
-- Pre-flight cleanup for old constant-ref spend rows (idempotency model change): rewrite any
-- duplicate legacy spend refs to NULL so they are excluded from the partial unique index. This
-- only touches NEGATIVE-delta (spend) rows whose ref is one of the known tool constants, and
-- only the DUPLICATES (keeps the first occurrence's ref intact, nulls the rest). Grant rows
-- (positive delta, invoice:* / NULL) are never touched. We are pre-prod (dev D1), so this is a
-- one-time normalization; on a fresh D1 it is a no-op (no rows match).
UPDATE credits_ledger
   SET ref = NULL
 WHERE delta < 0
   AND ref IS NOT NULL
   AND ref NOT LIKE 'spend:%:%'   -- new format spend:{tool}:{requestId} is already unique
   AND ref NOT LIKE 'job:%'       -- new format job:{jobId} is already unique
   AND id NOT IN (
     -- keep the earliest row per (user_id, ref); null out the rest
     SELECT MIN(id) FROM credits_ledger
      WHERE delta < 0 AND ref IS NOT NULL
        AND ref NOT LIKE 'spend:%:%' AND ref NOT LIKE 'job:%'
      GROUP BY user_id, ref
   );

-- The idempotency key: one (user_id, ref) per non-null ref. Spend's ON CONFLICT(user_id, ref)
-- and grant's hasLedgerRef both rely on this.
CREATE UNIQUE INDEX idx_ledger_ref_unique
  ON credits_ledger(user_id, ref)
  WHERE ref IS NOT NULL;

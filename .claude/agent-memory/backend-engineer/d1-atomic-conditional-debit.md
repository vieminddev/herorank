---
name: d1-atomic-conditional-debit
description: Race-safe AND idempotent atomic debit on Cloudflare D1 without transactions — guarded INSERT…SELECT + derived-cache UPDATE in one db.batch(), partial unique index on (acct,ref) for spend dedup.
metadata:
  type: feedback
---

[UNIVERSAL] To do a race-safe "spend N if balance >= N, else fail" on Cloudflare D1 (which has no interactive transactions, only `db.batch()` atomic-all-or-nothing):

Put TWO statements in one `db.batch([...])`, both carrying the SAME guard `WHERE balance >= :cost`:
1. `INSERT INTO ledger (...) SELECT ..., balance - :cost FROM acct WHERE id=:id AND balance >= :cost` — self-guarded, writes the audit row iff eligible; `balance_after` derived in SQL (no read-then-write).
2. `UPDATE acct SET balance = balance - :cost WHERE id=:id AND balance >= :cost`.

Decide success from the **INSERT's** `result.meta.changes === 1` (the INSERT is the authoritative gate; INSERT runs first so it sees the pre-debit balance). `changes()===0` → insufficient → 402, nothing written.

**Idempotency on SPEND (not just grants):** to make a re-run (DLQ replay, retried request) a no-op instead of a double-charge:
1. Add a PARTIAL unique index `CREATE UNIQUE INDEX ... ON ledger(acct_id, ref) WHERE ref IS NOT NULL` — partial because grant/signup rows often have `ref = NULL` and must coexist.
2. Add `AND NOT EXISTS (SELECT 1 FROM ledger WHERE acct_id=:id AND ref=:ref)` to the INSERT guard (and use a per-OPERATION ref that is stable across retries: `job:{id}`, `spend:{tool}:{requestId}` — NEVER a constant shared by distinct operations, or you'll wrongly collapse legitimate second spends).
3. Make the cache UPDATE **derive** the balance, not blind-subtract: `SET balance = (SELECT COALESCE(SUM(delta),0) FROM ledger WHERE acct_id=:id)`. A blind `balance - cost` keyed to "the row I just inserted" has a cache-drift hole if a later grant restores the old balance; re-deriving from the ledger SUM is idempotent and can't drift.
4. Catch the UNIQUE violation as the hard backstop (concurrent same-ref): D1 surfaces it as an Error whose message contains `UNIQUE constraint failed` (match with a regex on `err.message` + `err.cause`); for a non-null ref, map it to idempotent success (the other tx did the one debit).
After the batch: INSERT `changes()===0` is ambiguous → recompute and check `hasLedgerRef(ref)`; ref present = already charged (idempotent ok), absent = insufficient (402).

**Why:** A plain read-then-`UPDATE` lets two concurrent requests overspend; the conditional INSERT makes the debit atomic. Without ref-dedup, only GRANTS were idempotent — a re-run of a SPEND double-charged (HeroRank F-01, P0). The unique index + NOT EXISTS + derived cache close it at the storage layer, independent of any lifecycle guard.

**How to apply:** Any credits/wallet/quota debit on D1 (or SQLite-over-HTTP without transactions). Balance source-of-truth = `SUM(ledger.delta)`; cached column is advisory. Idempotent GRANTS: gate on existing ledger row with same `ref` (e.g. stripe event.id). Idempotent SPENDS: the 4 steps above.

Gotcha (svelte-check/tsc): a code COMMENT containing the literal text `@ts-expect-error` is parsed as a directive and reported "Unused" — never put that phrase in prose comments.

# Engineer G — Phase 4 — calibration provider injection — report

> 2026-06-13. Branch `migrate-sveltekit`. Task #20. `npm run check` = **0 errors** (16 pre-existing
> a11y warnings in FE pages, none mine). `npx vitest run` = **160 pass / 0 fail** (142 prior +
> 4 new salesEstimate calibration tests; estimation.test.ts now 45). Backward compatible — no
> existing test changed.

## Scope
Inject H's `ReviewRateProvider` (calibration override seam, BR-P4-CAL-01) into `salesEstimate`
WITHOUT breaking the Phase-3 pure-fn behaviour or any caller that passes no provider.

## Files changed (G-owned only)

| File | Change |
|---|---|
| `src/lib/server/services/estimation/index.ts` | `salesEstimate` gains an **optional 2nd param** `reviewRateProvider?: ReviewRateProvider`. Imports the type FROM H's `calibration/reviewRateProvider` (not redefined). Rate resolution now: calibrated (provider, non-null) → config.byCategory[cat] → config.default. |
| `tests/estimation.test.ts` | +4 tests in the `salesEstimate` block (provider override, null→config fallback, no-provider==Phase3, null-category→config). Imports `type ReviewRateProvider`. |

NOT touched: H's `calibration/*` & `oauth/*` (type-import only), F's `estimationContract.ts`,
F's jobs, any route, `config.ts` (no literal change needed — provider is a runtime override, the
config stays the floor exactly as the data-table design intends).

## Logic implemented
```ts
function salesEstimate(input, reviewRateProvider?) {
  const calibratedRate = reviewRateProvider?.(input.categoryId) ?? null;
  const rate =
    calibratedRate != null && calibratedRate > 0
      ? calibratedRate                                            // measured (sample_size >= MIN_SAMPLE)
      : input.categoryId != null && byCategory[categoryId] != null
        ? byCategory[categoryId]                                  // Phase-3 config per-category
        : reviewRate.default;                                     // Phase-3 config floor
  // monthlySales = round((reviews90/3) / rate)  — unchanged
}
```
- Provider returns `null` for sparse/unknown/null categories (H's confidence gate) → we fall to
  config. Matches H contract §2 exactly: `provider(cat) ?? config.byCategory[cat] ?? config.default`.
- Extra `> 0` guard mirrors the existing `rate > 0` divide-guard; a measured rate of 0 (shouldn't
  happen — H filters `reviewRate > 0`) would never be used as a divisor.

## Why no edit to F's `estimationContract.ts` (signature stays valid)
The `Estimation` interface declares `salesEstimate(input): SalesEstimateResult`. Adding a 2nd
**optional** param keeps the implementation assignable to that type (TS allows a fn with extra
optional params where fewer are expected). `export const estimation: Estimation = { salesEstimate, … }`
still type-checks — confirmed by `npm run check` = 0 errors. F's file needs **no change**.

## ➡️ ACTION for QA — wire the provider into the routes (one line each, F-owned files)
G does DI only; the per-request provider build belongs in the call sites, which are F's
`etsy-tools.ts` (and the cron/job context). Per H contract §2 the wiring is:
```ts
import { loadReviewRateProvider } from '$lib/server/services/calibration/reviewRateProvider';
// per request, where salesEstimate is called server-side (shop-analyzer / listing-analyzer paths):
const provider = await loadReviewRateProvider(getDb(c));   // or env.DB in a job
const sales = estimation.salesEstimate(input, provider);
```
Until that line is added, `salesEstimate(input)` keeps the exact Phase-3 result (no provider =
config path), so nothing is broken in the meantime — this is purely an accuracy upgrade to switch on.
Routes/etsy-tools.ts are F-owned: G did NOT touch them.

## Self-Review findings
- **Type imported, not redefined**: `ReviewRateProvider` comes from H's `calibration/reviewRateProvider`. OK.
- **Backward compatible**: no-provider call path is byte-identical to Phase 3 (test pins it); all 41 prior estimation tests + 142 suite tests unchanged and green. OK.
- **Contract match**: resolution order = H §2 (`provider ?? byCategory ?? default`); optional param keeps `Estimation` interface satisfied (check 0 errors). OK.
- **File ownership**: only G-owned `estimation/index.ts` + `tests/estimation.test.ts` edited. H/F files type-imported or untouched; routes left for QA (flagged above). OK.
- **Purity preserved**: provider is injected (DI), `salesEstimate` still does no I/O and no module-level import of D1/calibrationJob — estimation stays a pure fn of (input, provider). OK.
- **Edge cases**: provider null → config; null/unknown category → provider returns null → config default; measured rate 0 guarded. Covered by tests. OK.
- **check/tests**: `npm run check` 0 errors; `npx vitest run` 160 pass / 0 fail. OK.

**Skills read:** no `.claude/skills/SKILL-ROUTING.md` in repo (checked, absent — same as Phase 3).
Used contract H §2 + F's `estimationContract.ts` + my Phase-3 report as the authority.

**Concerns/risks:**
1. Provider wiring into routes/jobs is F-owned (`etsy-tools.ts` + cron) — flagged for QA as a 1-line
   change per call site. Non-blocking: no provider = safe Phase-3 fallback.
2. `MIN_SAMPLE`/confidence gate lives entirely in H's provider; G trusts the `null` signal and never
   re-checks sample size (correct separation of concerns).

**Task #20:** implementation + tests complete, check/tests green. No `TaskUpdate` tool is available
in this environment — status recorded here for PM/QA to mark #20 completed.

## Memory
no new patterns — the override seam, MIN_SAMPLE gate, and DI signature are all documented in H's
contract (`02_contract_H.md` §2) and the code; nothing project-specific or cross-project worth
persisting beyond what's already in the workspace contracts.

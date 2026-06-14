# Engineer G — Phase 3 Estimation engine — report

> 2026-06-12. Branch `migrate-sveltekit`. Task #12. `npm run check` = **0 errors** (19 pre-existing
> a11y warnings in E2's FE pages, none mine). `npx vitest run` = **121 pass** (80 existing
> untouched + **41 new** in `tests/estimation.test.ts`). Pure functions, deterministic, no I/O.

## Delivered (all NEW)

| File | Purpose |
|---|---|
| `src/lib/server/services/estimation/index.ts` | 6 pure fns implementing the `Estimation` interface from `etsy/estimationContract.ts` EXACTLY (params + return types). Named exports `demandScore/salesEstimate/competitionLevel/trendDelta/rankEstimate/listingAudit` + aggregate `estimation` (typed `: Estimation`) + `default`. No fetch, no Etsy client, no Date.now/random. |
| `src/lib/server/services/estimation/config.ts` | `ESTIMATION_CONFIG` — the single calibration surface (BR-P3-EST-01). Every magic number lives here with a comment. Mutable on purpose (Phase 4 override). |
| `tests/estimation.test.ts` | 41 vitest unit tests, one describe block per fn. Imports coefficients from `config.ts` (not literals) so calibration can't silently drift from tests. |

## Formulas actually implemented (bám spec §3)

**demandScore** — weighted blend of three log-scaled API signals (PM Q3: NO Google Trends):
```
norm(x, SCALE) = clamp(100 * log10(1+x) / log10(1+SCALE), 0, 100)   // long-tail compression
raw   = 0.55*norm(aggregateReviewVelocity, 500)     // velocity = best REAL signal
      + 0.25*norm(favoritesSignal, 50000)
      + 0.20*norm(resultCount, 50000)
score = clamp(round(raw), 0, 100)
label = score >= 67 ? 'high' : score >= 34 ? 'medium' : 'low'
```
Negative / NaN signals floor to 0. Monotonic in each signal (proven by test).

**salesEstimate** — review-velocity ÷ category review-rate:
```
reviewsPerMonth = max(0, reviewsLast90d) / 3
rate            = REVIEW_RATE.byCategory[categoryId] ?? REVIEW_RATE.default(0.15)
monthlySales    = round(reviewsPerMonth / rate)
monthlyRevenue  = formatMoney(monthlySales * max(0, avgPrice))   // '$540' / '$1.2K' / '$3.4M'
rangeLow/High   = round(monthlySales * {0.6, 1.7})               // Q4 confidence band
estimated       = true
```
0 reviews → 0 sales, `$0`, range 0/0. null categoryId == unknown == default rate.

**competitionLevel** — pure bucket (spec §3.3): `<1000 low · <20000 medium · ≥20000 high`. NaN→low.

**trendDelta** — pct change between two demandScore snapshots:
```
prior null/NaN → { change:'—', direction:'stable' }   // cold start (honest)
pct        = (current - prior) / max(prior, 1) * 100   // div-by-zero guard
direction  = pct > 3 ? 'up' : pct < -3 ? 'down' : 'stable'
change     = (pct>=0?'+':'') + round(pct) + '%'
```
Boundary strict (`>` / `<`): exactly +3% reads stable. flat → '+0%'/stable.

**rankEstimate** — `indexOf(target)` → 1-based position, `null` if not in window (incl. empty window).

**listingAudit** — deterministic rule-based (NO LLM), 5 sections each `{score 0-100, feedback:{clarity[],seo[]}}`:
- **title**: length windows (min 20 / ideal 70-140 / Etsy cap 140) + delimiter check.
- **tags**: 13-tag target (penalty ∝ unused slots) + per-tag 20-char cap.
- **images**: ≥5 ideal, score floor scales 40→100 toward ideal; 0 imgs → 0.
- **video**: binary — has video → 100, else 0 + warning.
- **description**: thin (<160) / ideal (≥500) + front-loaded first-line check.

Empty/missing fields never throw (bare listing → all sections score 0 with error/warning feedback).

## Coefficients (all in `config.ts`, commented)

| Key | Value | Source |
|---|---|---|
| `demandWeights` | velocity 0.55 / faves 0.25 / resultCount 0.20 (sum=1.0) | spec §3.1 |
| `normScales` | velocity 500 / faves 50000 / resultCount 50000 | tuned to Etsy magnitudes |
| `demandLabel` | high 67 / medium 34 | spec §3.1 |
| `reviewRate.default` | 0.15 | BA-recommended fallback |
| `reviewRate.byCategory` | jewelry .18 / home .16 / digital .08 / art .17 / clothing .15 / party .14 / stickers .12 / craft .13 | spec §3.2 (~10-30% industry). **Keys are placeholder taxonomy ids — Phase 4 corrects ids + rates.** |
| `salesBand` | low 0.6 / high 1.7 | Q4 band |
| `competition` | lowMax 1000 / mediumMax 20000 | spec §3.3 |
| `trend` | up 3 / down -3 | spec §3.4 |
| `audit` | title 20/70-140/cap140 · tags 13/20ch · images ideal5/min1 · desc min160/ideal500 | spec §4.1.1 (eRank/Marmalead heuristics) |

## How Phase 4 overrides config

`ESTIMATION_CONFIG` is a **mutable** export read at CALL time (not import time, not frozen). Phase 4 mutates it once at startup before the first tool request — no formula edits:
```ts
import { ESTIMATION_CONFIG } from '$lib/server/services/estimation/config';
Object.assign(ESTIMATION_CONFIG.demandWeights, { velocity: 0.6, faves: 0.2, resultCount: 0.2 });
ESTIMATION_CONFIG.reviewRate.byCategory[REAL_JEWELRY_NODE_ID] = 0.22;
```
File header documents this. Tests import the same object, so a recalibration is reflected in test expectations automatically (boundary tests still pin the documented spec literals 67/34/1000/20000/3 explicitly as a guard).

## Seam wiring (getEstimation) — NOT flipped by G (deliberate)

`etsy/estimationContract.ts` is **F's DO-NOT-EDIT file**. Per contract §1 ("If G prefers, F flips
the import on G's signal") and F's report (item: "F then flips `getEstimation()` ... one line"),
I did **NOT** edit it. The one-line flip F applies in `getEstimation()`:
```ts
const mod = await import('../estimation');
cached = {
  demandScore: mod.demandScore, salesEstimate: mod.salesEstimate,
  competitionLevel: mod.competitionLevel, trendDelta: mod.trendDelta,
  rankEstimate: mod.rankEstimate, listingAudit: mod.listingAudit,
};
return cached;
```
(or simply `cached = mod.estimation;` — the aggregate `estimation: Estimation` export exists exactly
for this.) Verified: all 6 named exports + `estimation` + `default` exist and the module is typed
`: Estimation`, so the flip type-checks. **Until F flips it, routes use F's honest-neutral
placeholder; route integration tests inject the real surface via `__setEstimation()`.**

➡️ **ACTION for F (or QA, per contract): flip `getEstimation()` to `import('../estimation')`.**
G left it untouched to respect file ownership.

## Self-Review findings
- **Contract match**: every signature imported FROM `estimationContract.ts` / `types.ts` (not redeclared); `export const estimation: Estimation` gives compile-time proof of conformance. OK.
- **Purity/determinism**: no fetch, no Etsy import, no Date.now(), no Math.random() — output is a pure fn of inputs. OK.
- **Magic numbers**: zero estimation literals outside `config.ts` (BR-P3-EST-01); tests import config. OK.
- **Edge cases**: NaN/negative/null/empty handled (floor to 0, default rate, '—' cold start, div-by-zero guard) — covered by tests. OK.
- **No file overlap**: only G-owned files touched; F/E2/package.json untouched. OK.
- **Tests**: 41 new pass; 80 existing untouched (121 total). `npm run check` 0 errors on my files. OK.

**Skills read:** no `.claude/skills/SKILL-ROUTING.md` exists in this repo (checked); used contract
F + BA spec + PM decisions as the authority. Read F's `estimationContract.ts` + `types.ts`.

**Concerns/risks:**
1. `reviewRate.byCategory` keys are **placeholder taxonomy node ids** (1-8), not real Etsy ids — Phase 4 must map real top-level node ids. Documented in config + here. Non-blocking (default 0.15 covers unknowns).
2. Seam flip is F's to apply (file ownership) — flagged above; QA should run after the flip OR rely on `__setEstimation()`.
3. `normScales` are heuristic (no real data yet) — exactly what Phase 4 calibration is for; isolated in config.

## Memory
no new patterns — formulas/coefficients are spec-derived and live in code/config; conventions
(pure-fn service, config-isolated magic numbers, relative-import tests) already documented in the
contract and existing repo patterns.

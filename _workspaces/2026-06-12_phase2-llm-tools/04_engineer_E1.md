# Engineer E1 (FE) — Phase 2 LLM Tools — Report

Task #11. Branch `migrate-sveltekit`. Status: DONE.

## Files delivered

NEW:
- `src/lib/sanitize.ts` — `escapeHtml` + `renderBold` (escape FIRST, then `**`→`<strong>`; PM Q5 bold-only).
- `src/lib/tools-client.ts` — `callTool<T>(tool, input)` (JSON; 401→/auth/login, 402→typed failure w/ balance, other ≥4xx→{error,message}) + `streamChat(messages, {onChunk,onDone,onError})` (SSE reader: parses multi-line `event:`/`data:`, delta/done/error, stops on `[DONE]`).
- `tests/sanitize.test.ts` — 11 cases incl. XSS regression (`<script>`, `<img onerror>`, nested `**`, quote/amp escaping).

MODIFIED (mock → real API, markup kept NGUYÊN):
- `src/routes/(dashboard)/tools/etsy/title-generator/+page.svelte`
- `src/routes/(dashboard)/tools/etsy/description-generator/+page.svelte`
- `src/routes/(dashboard)/tools/etsy/tag-generator/+page.svelte`
- `src/routes/(dashboard)/tools/keyword-generator/+page.svelte`
- `src/routes/(dashboard)/tools/rankhero-ai/+page.svelte`

## What each page now does
- 4 JSON tools: `callTool(...)` on submit → loading (button disabled + `LoaderCircle` spinner) → success renders real data (same shape as old mock, zero structural change) → `invalidateAll()` to refresh Header credits badge (PM Q4). Error → inline banner. 402 → "Upgrade plan" CTA → `/pricing`.
- tag-generator: tags/materials/styles from API; summary stats / price range / monthly trend / Listings tab kept as mock and now labelled "Sample data" + "AI estimated" badge near the table (spec §4.3, BR-P2-08). `location` forwarded to API for Phase-3 forward-compat.
- keyword-generator: Volume/CPC/Trend columns labelled "(est.)" + an "AI estimated" pill (BR-P2-08).
- rankhero-ai: real SSE streaming — first delta replaces typing dots, subsequent deltas append; input disabled while streaming; `event: done` → `invalidateAll()`; `event: error` / 402 → error bubble (red), never charged. **XSS tech-debt #5 FIXED**: `{@html}` now fed only by `renderBold` (escape-then-bold). Static greeting stays client-side and is excluded from history sent to the LLM.

## API shapes used (per spec §2/§3 — Engineer D had not saved 04_engineer_D.md yet)
- title: `{titles:[{title,chars,score}]}` · description: `{description:string}` · tag: `{tags,materials,styles:[{tag,competition,searchVolume}]}` · keyword: `{keywords:[{keyword,volume,competition,cpc,trend}]}` · all carry `creditsRemaining`.
- chat SSE: `data:{"delta":...}` / `event:done data:{"creditsRemaining":N}` / `event:error data:{"error","message"}` / `data:[DONE]`.
- If D's final shapes differ, only the per-page `callTool<T>(...)` generics + render bindings change — client helper is shape-agnostic.

## Tests
- `npx vitest run` → **PASS (50) FAIL (0)** (11 new sanitize + 39 existing untouched).
- `npm run check` → **0 ERRORS**, 19 warnings (all pre-existing a11y: `label`-without-`for` and `href="#"` across many pages, including ones I did not touch). My 3 textual pages inherit the same `label`-without-`for` from the original mock markup — kept NGUYÊN per task constraint. Flagging for a future a11y pass (easy `for`/`id` fix).

## Constraints honored
- Did NOT touch package.json / backend / Header.svelte. No full build run. Svelte 5 runes throughout (`$state/$derived/$effect/$props`).
- Backend routes (`/api/tools/*`) are Engineer D's and not yet mounted — pages are wired against the contract and will work once D's router + C's mount land. No way to runtime-smoke the live API yet (no key + routes not mounted); verified via type-check + unit tests + contract conformance.

## Self-Review findings
1. Display/overflow: OK — kept existing responsive markup; tables keep `overflow-x-auto`.
2. Experience: OK — spinner on submit, streaming typewriter, disabled states.
3. Edge cases: empty data guarded (`{#if hasGenerated && titles.length}`); long text uses existing `whitespace-pre-wrap`/`break`; network failure → `status:0` generic banner; never charged on any failure.
4. Consistency: OK — reused `card`, navy buttons, Badge, teal accents; error banner uses `--danger` tokens.
5. Accessibility: error banners have `role="alert"`. Pre-existing `label`-without-`for` left intact (markup-unchanged constraint) — noted above.
6. Alpine `:class`: N/A (no Alpine in repo).
7. CSS migration binding counts: N/A.
8. Browser visual verify: NOT possible (routes unmounted, no dev server / no key) — flagged; QA e2e should cover once backend lands.
9. `catch (e: unknown)`: used bare `catch {}` (no binding) in client — no `any`.
10. Child prop destructure: ToolPageLayout unchanged; streamChat handlers all consumed.

**Self-Review findings summary:** all OK except pre-existing a11y label warnings (intentionally left to honor "giữ NGUYÊN markup") and live browser verification deferred to QA (backend not mounted).

**Skills read:** No `.claude/skills/SKILL-ROUTING.md` exists in repo (searched, absent). Applied agent-memory: `feedback_react_to_svelte5_port.md` ($effect must touch reactive reads — done in chat effect; {@html} XSS — fixed via sanitize.ts) and `feedback_lucide_svelte_naming.md` (verified icon names).

**Memory:** wrote — updated `feedback_lucide_svelte_naming.md` with dropped names `AlertCircle`→`CircleAlert`, `Loader2`→`LoaderCircle`, and `AlertTriangle` alias note. No other new cross-project pattern (SSE/streaming wiring is derivable from the code + spec).

**Concerns/risks:**
- Backend not mounted yet → pages unverified end-to-end. Coordinate with D/C; QA e2e is the real gate.
- If D's response shapes diverge from spec §2, per-page generics need a small update (client helper unaffected).
- Pre-existing a11y warnings (label/href) are repo-wide tech-debt worth a dedicated ticket.

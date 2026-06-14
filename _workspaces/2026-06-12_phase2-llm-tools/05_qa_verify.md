# QA Report — Phase 2 LLM Tools (Task #14)

> QA, 2026-06-12. Branch `migrate-sveltekit`.
> Engineers: D (backend LLM), E1 (FE). QA scope: mount router, reconcile shapes, automated tests, wrangler smoke tests.

---

## Summary Table

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Router mount (`tools.ts`) | ALREADY DONE | Import + `router.route('/', llmTools)` already present — D/C had completed this |
| 2 | toolCosts.ts: all 5 Phase 2 keys + correct costs | PASS | No change needed: title=1, tag=1, keyword=1, description=2, rankhero-ai=2 |
| 3 | Shape reconciliation: D backend vs E1 FE | PASS | All 5 shapes match exactly; no FE fix needed |
| 4 | Tag count flag (13 not 15) | PASS | E1 renders `res.data.tags ?? []` — no hardcoded 15 |
| 5 | `npm run check` | PASS | 0 errors, 19 pre-existing a11y warnings |
| 6 | `npx vitest run` | PASS | 50/50 tests pass |
| 7 | `npm run build` | PASS | 3677 modules, built in ~26s |
| 8 | 401 no-auth | PASS | Returns 401 `{error:UNAUTHORIZED}` before any LLM call |
| 9 | 503 graceful (no LLM_MODEL in .dev.vars) | PASS | title-generator → 503 `{error:LLM_UNAVAILABLE,message:"AI service is not configured yet..."}` |
| 10 | Credits unchanged after 503 | PASS | Balance 30 before and 30 after failed call |
| 11 | 400 validation (bad input) | PASS | `{"description":"ab"}` → 400 `VALIDATION "Too small: expected string to have >=3 characters"` |
| 12 | 400 validation (missing field) | PASS | `{}` → 400 `VALIDATION "Invalid input: expected string, received undefined"` |
| 13 | Mock gateway: title-generator 200 + shape | PASS | 5 titles, `chars` recomputed server-side, `creditsRemaining:29` (30→29 -1) |
| 14 | Mock gateway: rankhero-ai chat SSE | PASS | `data:{delta}` chunks + `event:done data:{creditsRemaining:27}` + `data:[DONE]` (29→27 -2) |
| 15 | Credits ledger accuracy | PASS | Balance 30→29 (title) →27 (chat): exact per TOOL_COSTS |
| 16 | No hardcoded API keys | PASS | No `sk-` or `fc-` in Phase 2 source files |
| 17 | `{@html}` only via `renderBold` (sanitize.ts) | PASS | Single `{@html renderContent(msg.content)}` in rankhero-ai, `renderContent = renderBold` |
| 18 | BR-P2-09: no-config → 503 not crash | PASS | Graceful 503 JSON response, not unhandled 500 |
| 19 | .dev.vars restored | PASS | Back to original (no LLM_MODEL, placeholder key) |
| 20 | Background processes stopped | PASS | wrangler + mock LLM server killed |

**Overall: PASS (no blocking bugs found). 1 spec deviation flagged (BUG-01, non-blocking).**

---

## 1. Mount + toolCosts Verification

Both tasks were already completed by D/C before QA:

**`src/lib/server/api/routes/tools.ts` (lines 17, 47-50):**
```ts
import llmTools from './llm-tools';
// ...
// Mount Phase 2 LLM tools (Engineer D's router) under the same /api/tools prefix.
router.route('/', llmTools);
```

**`src/lib/server/services/toolCosts.ts`:**
```
title: 1, tag: 1, keyword: 1, description: 2, 'rankhero-ai': 2
```
All correct. No QA edits needed for step 1.

---

## 2. Shape Reconciliation (D vs E1)

E1 used spec-identical shapes (built against §2/§3 contract before D's report). Comparison:

| Tool | Backend output (D) | FE generic type (E1) | Match |
|---|---|---|---|
| title-generator | `{titles:[{title:string(≤140),chars:number,score:number}]×5,creditsRemaining}` | `{titles:TitleRow[]}` where `TitleRow={title,chars,score}` | ✅ |
| description-generator | `{description:string(≥100),creditsRemaining}` | `{description:string}` | ✅ |
| tag-generator | `{tags:[{tag,competition,searchVolume}]×13,materials:[×4-6],styles:[×3-5],creditsRemaining}` | `TagResult={tags,materials,styles:TagRow[]}` | ✅ |
| keyword-generator | `{keywords:[{keyword,volume:number,competition,cpc:string,trend:string}]×8-12,creditsRemaining}` | `{keywords:KeywordRow[]}` with same fields | ✅ |
| rankhero-ai chat | SSE: `data:{delta}` / `event:done data:{creditsRemaining}` / `event:error data:{error,message}` | `streamChat` parses same wire format | ✅ |

**D's flag: tag-generator returns 13 tags (outputSchema enforces `.length(13)`).**
E1 renders `res.data.tags ?? []` — no hardcoded count check. FE will render whatever the API returns. ✅

**No FE changes required.**

---

## 3. Automated Tests

```
npm run check: 0 ERRORS, 19 WARNINGS (all pre-existing a11y: label/href — not Phase 2)
npx vitest run: PASS (50) FAIL (0)
npm run build:  ✓ 3677 modules transformed, ✓ built in ~26s
```

---

## 4. Wrangler Dev Smoke Tests

**Setup:** `./node_modules/.bin/wrangler pages dev .svelte-kit/cloudflare --port=8788` with `.dev.vars` as-is (no LLM_MODEL).

**User created:** `qatest@example.com` (free plan, 30 initial credits).

### 4.1 No-auth (401)
```
POST /api/tools/title-generator (no cookie) → 401 {"error":"UNAUTHORIZED","message":"Authentication required"} ✅
```

### 4.2 Bad input (400)
```
POST /api/tools/title-generator {"description":"ab"} → 400 {"error":"VALIDATION","message":"Too small: expected string to have >=3 characters"} ✅
POST /api/tools/title-generator {} → 400 {"error":"VALIDATION","message":"Invalid input: expected string, received undefined"} ✅
```

### 4.3 No LLM key / model (BR-P2-09)
```
POST /api/tools/title-generator (valid body, authenticated) → 503 {"error":"LLM_UNAVAILABLE","message":"AI service is not configured yet. Please try again later."} ✅
GET /api/me → {"credits":{"balance":30}} (unchanged) ✅

POST /api/tools/rankhero-ai/chat → 200 SSE:
  event: error
  data: {"error":"LLM_UNAVAILABLE","message":"AI service is not configured yet. Please try again later."}
  data: [DONE]
GET /api/me → balance: 30 (unchanged) ✅
```

Note: chat 503 comes as SSE error (200) not JSON — see BUG-01 below.

### 4.4 Mock Gateway Integration (spec §6.3)

**Mock server:** `/tmp/mock_llm_server.mjs` — Node.js HTTP server on port 9999.
- `POST /v1/chat/completions stream:false` → canned JSON completion (5 titles).
- `POST /v1/chat/completions stream:true` → SSE stream with 3 delta chunks + `[DONE]`.

**`.dev.vars` modified during test:**
```
LLM_BASE_URL=http://localhost:9999/v1
LLM_API_KEY=test
LLM_MODEL=test
```

**Wrangler restarted with new config. Results:**

```
Initial balance: 30

POST /api/tools/title-generator {"description":"A beautiful handmade gold necklace..."}
→ 200 {"titles":[...5 items...],"creditsRemaining":29}
  chars recomputed server-side (e.g. model said 62, server returned 64 = actual length) ✅
GET /api/me → balance: 29 (-1 correct) ✅

POST /api/tools/rankhero-ai/chat {"messages":[{"role":"user","content":"Help me with Etsy SEO tags"}]}
→ 200 SSE:
  data: {"delta":"Sure, "}
  data: {"delta":"here are some"}
  data: {"delta":" Etsy SEO tips!"}
  event: done
  data: {"creditsRemaining":27}
  data: [DONE]
GET /api/me → balance: 27 (-2 correct) ✅
```

**Credit accuracy:** 30 → 29 (title -1) → 27 (chat -2). Matches TOOL_COSTS exactly. ✅

### 4.5 .dev.vars Restored
```
LLM_BASE_URL=https://vtoken.viemind.ai/v1
LLM_API_KEY=placeholder
(LLM_MODEL removed)
```
All background processes (wrangler PID 2365865, mock LLM PID 2364802) killed. ✅

---

## 5. Bugs / Issues Found

### BUG-01 [MEDIUM] rankhero-ai chat — LlmConfigError returns 200+SSE instead of pre-stream 503 JSON

**Spec says (§3.5):** "Pre-stream failures (402/400/503) are returned as normal JSON HTTP responses so the FE can branch on `res.ok` before reading the stream."

**Actual behavior:** `LlmConfigError` (missing model/key) is thrown inside `llm.stream()` which is called inside the `ReadableStream.start()` async callback. By then, `new Response(stream, {...})` has already been returned with HTTP 200.

**Impact:**
- Credits NOT charged (BR-P2-01 preserved ✅)
- `tools-client.ts` `streamChat()` handles `event:error` correctly → user sees error bubble ✅
- BUT `res.ok === true` (200), so the pre-stream branch in `streamChat` does not catch it
- Spec contract for 503-before-stream is violated

**Proposed fix for D:**
```ts
// In llm-tools.ts chat handler, add pre-check before ReadableStream:
const env = getEnv(c);
if (!env.LLM_API_KEY || !env.LLM_MODEL) {
  return c.json({
    error: 'LLM_UNAVAILABLE',
    message: 'AI service is not configured yet. Please try again later.'
  }, 503);
}
```

**Verdict:** Not blocking Phase 2 (FE handles gracefully, no charge). Flag to D for a follow-up fix. FE `streamChat` already handles `event:error` from within stream.

---

## 6. Security Checklist

| Check | Result |
|---|---|
| No `sk-` hardcoded in `src/` | PASS — grep found nothing |
| No `fc-` hardcoded in `src/` | PASS — grep found nothing |
| `{@html}` usage in rankhero-ai | PASS — only `{@html renderContent(msg.content)}` where `renderContent = renderBold` |
| No `{@html}` in any other tool page | PASS — 0 other occurrences |
| `renderBold` in sanitize.ts: escape-first | PASS — `escapeHtml(input).replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')` |
| LLM API key from env only | PASS — `env.LLM_API_KEY ?? ''` in llm-tools.ts |
| LLM model from env only | PASS — `env.LLM_MODEL ?? ''` in llm-tools.ts |

---

## 7. Files Changed by QA

None. The mount, toolCosts, and FE shapes were all already correct. QA confirmed the existing state.

**Temporary changes (reverted):**
- `.dev.vars` temporarily modified for mock gateway test, then restored.
- Mock server file `/tmp/mock_llm_server.mjs` written to /tmp (outside repo).

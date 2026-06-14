# Engineer D — Phase 2 LLM Backend (Task #9)

Branch `migrate-sveltekit`. Status: DONE. `npm run check` = 0 errors; `npx vitest run` = 50/50 pass (29 new in `tests/llm.test.ts`).

## Files delivered (all absolute)

| File | Purpose |
|---|---|
| `src/lib/server/services/llmService.ts` | OpenAI-compatible client (plain fetch, NO SDK). `complete()` (JSON) + `stream()` (SSE async-iterable). AbortController timeout. Typed errors `LlmConfigError/Timeout/RateLimit/Upstream/Parse`. DI `fetchImpl`. |
| `src/lib/server/services/llmJson.ts` | `completeJson()` — jsonMode + JSON.parse (strips ```` ```json ```` fences) + zod `safeParse` + ONE retry with a stricter reminder. Returns `null` on second failure (caller → `LlmParseError`). |
| `src/lib/server/services/prompts/title.ts` | systemPrompt + `inputSchema` + `outputSchema`. |
| `src/lib/server/services/prompts/description.ts` | " |
| `src/lib/server/services/prompts/tag.ts` | " |
| `src/lib/server/services/prompts/keyword.ts` | " |
| `src/lib/server/services/prompts/chat.ts` | systemPrompt + `inputSchema` (no output schema — streamed). `buildMessages` prepends trusted system prompt; client may only send user/assistant turns. |
| `src/lib/server/services/keywordSource.ts` | `KeywordSource` seam. Phase 2 = `createLlmKeywordSource(llm)`. Phase 3 swaps data source behind same interface/shape. |
| `src/lib/server/api/routes/llm-tools.ts` | Hono default-export router. 4 JSON routes + SSE chat route. **NOT self-mounted** — C re-mounts via `tools.route('/', llmTools)`. |
| `scripts/verify-gateway.mjs` | Manual-only real-gateway check (1 completion + 1 stream). Exits non-zero if key missing. |
| `tests/llm.test.ts` | 29 tests, all mock-fetch (no key). |
| `src/lib/server/env.ts` | Added `LLM_MODEL?`, `ETSY_API_KEY?`, `ETSY_API_SECRET?` (PM Q7 grant). |
| `.env.example` | Added `LLM_MODEL`, `ETSY_API_KEY`, `ETSY_API_SECRET`. |

## API contract for FE (E) + mounting (C)

All under `/api/tools` (after C mounts the router). Success bodies match FE mock shapes exactly.

### POST /api/tools/title-generator — requireAuth + requireCredits('title') (cost 1)
- Body: `{ description: string (3..2000) }`
- 200: `{ titles: [{ title: string(≤140), chars: number, score: number(0..100) }] (×5), creditsRemaining: number }`
- `chars` recomputed server-side from `title.length` (model count not trusted).

### POST /api/tools/description-generator — requireCredits('description') (cost 2)
- Body: `{ productInfo: string (3..2000) }`
- 200: `{ description: string (≥100, multi-line), creditsRemaining }` — render in `<pre class="whitespace-pre-wrap">`.

### POST /api/tools/tag-generator — requireCredits('tag') (cost 1)
- Body: `{ keyword: string (1..100), location?: 'Global'|'USA'|'UK'|'AUS'|'CAN'|'EU'|'IND' (default Global) }`
- 200: `{ tags: [{tag(≤20), competition, searchVolume}] (×13), materials: [...] (4-6), styles: [...] (3-5), creditsRemaining }`
- `competition`/`searchVolume` ∈ `'high'|'medium'|'low'` — **AI-estimated** (UI badge). `location` forwarded for Phase-3 but ignored in Phase-2 output.

### POST /api/tools/keyword-generator — requireCredits('keyword') (cost 1)
- Body: `{ seed: string (1..100) }`
- 200: `{ keywords: [{keyword, volume:number, competition, cpc:string e.g."$0.95", trend:string e.g."+12%"}] (8-12), creditsRemaining }`
- volume/cpc/trend **AI-estimated**. Shape = Phase-3 contract (unchanged when real Etsy data lands).

### POST /api/tools/rankhero-ai/chat — requireAuth only, SSE, manual deduct (cost 2)
- Body: `{ messages: [{ role:'user'|'assistant', content: string(1..4000) }] (1..40) }`
- **Pre-stream failures are normal JSON HTTP** (branch on `res.ok` before reading stream):
  - 402 `{ error:'INSUFFICIENT_CREDITS', message, balance }` — no stream opened, LLM never called.
  - 400 `{ error:'VALIDATION', message }`.
- **Success = `Content-Type: text/event-stream`**, events:
  - `data: {"delta":"..."}\n\n` (repeated)
  - `event: done\ndata: {"creditsRemaining": N}\n\n`
  - `data: [DONE]\n\n`
- **Mid-stream error:** `event: error\ndata: {"error":"LLM_UNAVAILABLE","message":"..."}\n\n` then `data: [DONE]\n\n`. **No deduct.** FE distinguishes success/error by SSE event type, not HTTP status (200 already sent).
- Deduct happens ONCE, only after a clean `[DONE]` (BR-P2-03).

### Error bodies (JSON routes), all ≥400 → 0 credits charged (BR-P2-01)
| HTTP | error | message |
|---|---|---|
| 400 | `VALIDATION` | first zod issue / "Invalid JSON body" |
| 402 | `INSUFFICIENT_CREDITS` | "Not enough credits" + `balance` |
| 429 | `LLM_BUSY` | "AI service is busy. Please retry in a moment." |
| 502 | `LLM_UNAVAILABLE` | "AI service is temporarily unavailable. Please try again." |
| 502 | `LLM_BAD_OUTPUT` | "The AI returned an unexpected result. Please try again." |
| 503 | `LLM_UNAVAILABLE` | "AI service is not configured yet. Please try again later." (no key/model — BR-P2-09) |
| 504 | `LLM_TIMEOUT` | "The AI took too long to respond. Please try again." |

## Mounting note for Engineer C
`llm-tools.ts` is a default-exported `Hono<AppEnv>`. Add ONE line to `src/lib/server/api/routes/tools.ts`:
```ts
import llmTools from './llm-tools';
// ...after the echo route:
router.route('/', llmTools);
```
The relative paths (`/title-generator`, `/rankhero-ai/chat`, ...) become `/api/tools/...`. No edit to `app.ts` needed.

## Test coverage (tests/llm.test.ts, 29)
- complete: request-body shape, content parse, empty→Parse, missing key/model→Config, 429→RateLimit, 500→Upstream, 401→Config, AbortError→Timeout, network→Upstream, no-leak.
- stream: multi-chunk SSE in order + stops on [DONE], event split across chunk boundary, malformed/keep-alive skipped, unconfigured→Config before stream, stream:true body.
- completeJson: first-try parse, fence-strip, retry-once-then-succeed, null after 2 fails, null on zod mismatch.
- output schemas: title (×5, ≤140, wrong count), tag (×13, ≤20), location default, keyword (8-12 vs 7).
- keywordSource: validated output, empty→ParseError.
- chat SSE deduct contract: deduct once after [DONE]; NO deduct on mid-stream error (real stream + fake spend).
- LlmError taxonomy codes.

## Decisions / notes
- `complete`/`stream` interface names kept per BA spec §1.2 (authoritative). The task brief's `completeJSON`/`streamChat` responsibilities are satisfied: JSON parse/validate/retry lives in `completeJson` (shared helper) + routes; SSE passthrough is `stream`. Service stays generic.
- ETSY_* keys added now (PM Q7 "sửa 1 lần") so Engineer F's Phase 3 doesn't re-touch env.ts.

## Concerns / risks (flag to PM/QA)
1. **Client disconnect mid-stream:** `for await` over the stream throws if the client aborts → treated as mid-stream error → no deduct. Matches spec (incomplete answer = no charge). Disconnect AFTER `[DONE]` still deducts (loop already finished). Accepted edge per spec §1.5 (Q2 deduct-after-DONE policy).
2. **`completeJson` retry on schema mismatch** double-calls the LLM (latency, gateway tokens) but never double-charges (deduct is post-2xx). Fine per spec §6.2.
3. **No integration test through the live Hono handler** (would need full D1 + Workers wiring). The chat deduct decision is covered by a faithful re-implementation test (`drainAndSettle`) over the REAL `llmService.stream`. QA should add an e2e against a local mock gateway if they want full route coverage (spec §6.3).
4. The FE tag mock had 15 rows; spec mandates exactly 13 — I follow spec (`outputSchema` enforces 13). FE/E should not hardcode 15.
```

# Phase 2 — LLM Tools Feature Spec

> BA, 2026-06-12. Branch `migrate-sveltekit`. Builds on Phase 1 (auth + billing + credits, QA-passed).
> Scope: wire 5 tools to a real LLM via OpenAI-compatible gateway `https://vtoken.viemind.ai/v1`, replace FE mocks with real API calls, deduct credits, and fix the `{@html}` XSS tech-debt (#5).
> Sources read: `docs/backend-architecture.md`, `_workspaces/.../02_contract_A.md`, `src/lib/server/api/*`, `src/lib/server/services/*`, `creditsRepo.ts`, the 5 FE pages.

---

## 0. Tools in scope (5)

| Tool | Endpoint | Response type | FE page |
|---|---|---|---|
| title-generator | `POST /api/tools/title-generator` | JSON | `tools/etsy/title-generator` |
| description-generator | `POST /api/tools/description-generator` | JSON | `tools/etsy/description-generator` |
| tag-generator | `POST /api/tools/tag-generator` | JSON | `tools/etsy/tag-generator` |
| keyword-generator | `POST /api/tools/keyword-generator` | JSON | `tools/keyword-generator` |
| RankHero AI chat | `POST /api/tools/rankhero-ai/chat` | SSE stream | `tools/rankhero-ai` |

Out of scope (Phase 3/4): shop-analyzer, listing-analyzer, rank-check, best-sellers, niche-finder, profit-calculator, video-generator, buyer-check.

---

## 1. llmService — OpenAI-compatible client

### 1.1 Decision: fetch, not the `openai` SDK

**Recommendation: plain `fetch`, no `openai` npm package.** Reasons:
- Runs on Cloudflare Workers — the gateway is a standard OpenAI-compatible `/chat/completions` endpoint; we use exactly two call shapes (JSON completion + SSE stream). A hand-written client is ~120 LOC and removes a dependency + its transitive weight from the Worker bundle.
- Anti-lock-in principle (backend-architecture §"chống lock-in"): the service is pure TS behind a DI factory, so swapping to the SDK later is a one-file change.
- The `openai` SDK historically pulls Node-isms (shims) and adds bundle size for features we do not use. Avoiding it keeps the Worker lean (same rationale as Phase 1's `Stripe.createFetchHttpClient()`).
- **Decision is reversible**: if streaming SSE parsing proves fragile in QA, EM may approve adding `openai` — but default is fetch. (Open question Q1.)

### 1.2 Location & shape (Engineer **D** owns)

`src/lib/server/services/llmService.ts` — pure TS, **no Hono import** (DI factory, same pattern as `creditsService`/`billingService`).

```ts
export interface LlmConfig {
  baseUrl: string;   // env.LLM_BASE_URL (default 'https://vtoken.viemind.ai/v1')
  apiKey: string;    // env.LLM_API_KEY
  model: string;     // env.LLM_MODEL
  timeoutMs?: number; // default 30000 (JSON); 60000 for chat stream
  fetchImpl?: typeof fetch; // DI seam for unit tests (mock fetch)
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export interface LlmService {
  // Non-streaming completion. Returns assistant text. Used by the 4 JSON tools.
  complete(args: { messages: ChatMessage[]; temperature?: number; maxTokens?: number; jsonMode?: boolean }): Promise<string>;
  // Streaming completion. Yields text deltas. Used by rankhero-ai chat.
  stream(args: { messages: ChatMessage[]; temperature?: number; maxTokens?: number }): AsyncIterable<string>;
}

export function createLlmService(config: LlmConfig): LlmService { ... }
```

### 1.3 Behaviour

- `complete()` → `POST {baseUrl}/chat/completions` with `{ model, messages, temperature, max_tokens, stream:false, response_format:{type:'json_object'} }` when `jsonMode`. Reads `choices[0].message.content`.
- `stream()` → same with `stream:true`; parses SSE: split on `\n\n`, each `data: {...}` line, extract `choices[0].delta.content`, stop on `data: [DONE]`.
- **Timeout**: `AbortController` with `timeoutMs`. On abort → `LlmTimeoutError`.
- **Config validation**: if `apiKey` or `model` empty → `LlmConfigError` (mapped to 503 — see 1.4). This is the **"no real key yet"** guard for the current environment.

### 1.4 Error mapping (user-friendly, never leak gateway internals)

`llmService` throws typed errors; the **route handler** maps them to HTTP. Critical: a thrown error means the handler returns ≥400, so **`requireCredits` does NOT deduct** (matches Phase 1 deduct-after-2xx design — see `requireCredits.ts` step 3).

| llmService error | Cause | HTTP | Body `{ error, message }` |
|---|---|---|---|
| `LlmConfigError` | missing key/model | 503 | `LLM_UNAVAILABLE` / "AI service is not configured yet. Please try again later." |
| `LlmTimeoutError` | abort/timeout | 504 | `LLM_TIMEOUT` / "The AI took too long to respond. Please try again." |
| `LlmRateLimitError` | gateway 429 | 429 | `LLM_BUSY` / "AI service is busy. Please retry in a moment." |
| `LlmUpstreamError` | gateway 5xx / down | 502 | `LLM_UNAVAILABLE` / "AI service is temporarily unavailable. Please try again." |
| `LlmParseError` | bad/empty JSON from model | 502 | `LLM_BAD_OUTPUT` / "The AI returned an unexpected result. Please try again." |

All of the above are ≥400 → **zero credits charged**. This is the single most important contract for Phase 2: **the user is never charged for an LLM failure.**

### 1.5 Streaming credit-deduction — the hard case

`requireCredits` cannot be used as-is for SSE because (a) the success response is `text/event-stream`, not JSON, so the merge step is skipped, and (b) the status (200) is committed the moment the stream starts, before we know if the stream completed.

**Decision: chat does NOT use the `requireCredits` middleware. It deducts manually inside the route, AFTER the stream finishes successfully.** Rule:

1. **Pre-check** balance ≥ cost before opening the stream. If insufficient → 402 JSON (no stream opened). Reuse `creditsService.getBalance`.
2. Open the LLM stream. Pipe deltas to the client as SSE events `data: {"delta":"..."}`.
3. **Deduct only after the LLM stream completes without error** (the upstream sent `[DONE]` and we forwarded all deltas). Call `creditsService.spendCredits(userId, 'rankhero-ai')`.
4. Emit a **final SSE event** `event: done` with `data: {"creditsRemaining": N}` so the FE can update the badge. Then `data: [DONE]`.
5. If the LLM stream errors mid-way (gateway drops): emit `event: error` with `data: {"error":"LLM_UNAVAILABLE","message":"..."}`, **do NOT deduct**, close the stream. (The 200 status is already sent; the FE distinguishes success vs error by the SSE event type, not HTTP status.)

> Edge case (accepted, documented): if the LLM completes the full answer but the client disconnects before the deduct runs, we still attempt the deduct in a `try/finally` after the upstream `[DONE]` — the user got the full answer. If the client disconnects mid-stream (before `[DONE]`), no deduct (they did not get a complete answer). Cost is 2 credits — acceptable risk; not worth a reservation/refund ledger in Phase 2. (Open question Q2 — PM may prefer reserve-then-settle.)

---

## 2. Prompt design per tool

All system prompts in English. Each JSON tool uses `jsonMode:true` + a system prompt that pins the exact output schema and Etsy SEO rules. The route then `JSON.parse`s and **validates the parsed object against a zod output schema** — if it fails, `LlmParseError` → 502, no charge (one retry allowed, see 6.2).

Prompts live in `src/lib/server/services/prompts/` (Engineer D owns), one file per tool exporting `systemPrompt` + the zod `inputSchema` + `outputSchema`. Keeps `llmService` generic.

### 2.1 title-generator

**Etsy rules baked into prompt:** each title ≤ 140 characters; front-load the most important keywords; use ` • `, `|`, or `,` separators; no keyword stuffing; readable to humans.

- **Input (zod):** `{ description: string (min 3, max 2000) }`
- **Output (zod):** `{ titles: Array<{ title: string (max 140), chars: number, score: number (0-100) }> }` — exactly 5 items.
- `chars` = `title.length` (route recomputes to guarantee accuracy, does not trust model). `score` = model's SEO self-rating (advisory; labeled SEO score in UI).
- **Shape matches FE mock exactly** (`{ title, score, chars }`) → FE renders with zero shape change.

System prompt (summary): "You are an Etsy SEO expert. Given a product description, generate exactly 5 listing titles. Each MUST be ≤140 characters, front-load high-intent keywords, use separators (•, |, ,), stay human-readable, avoid repetition across the 5. Return JSON: {\"titles\":[{\"title\":string,\"chars\":number,\"score\":number}]}. score 0-100 reflects SEO strength."

### 2.2 description-generator

**Etsy rules:** structured sections (hook/intro, perfect-for/gift list, product details, quality, shipping, how-to-order, help), emoji section headers, keyword-rich but natural, ends with a tag line.

- **Input (zod):** `{ productInfo: string (min 3, max 2000) }`
- **Output (zod):** `{ description: string (min 100) }` — a single multi-line string (FE renders in `<pre class="whitespace-pre-wrap">`).
- **Shape matches FE mock** (`MOCK_DESCRIPTION` is one big string) → FE swaps the const for state, no structural change.

System prompt pins the section structure shown in the current mock (PERSONALIZED…, 🎁 PERFECT GIFT FOR, 📐 PRODUCT DETAILS, 💎 QUALITY GUARANTEE, 📦 SHIPPING, ⭐ HOW TO ORDER, 💬 NEED HELP, Tags: line).

### 2.3 tag-generator

**Etsy rules:** Etsy allows exactly 13 tags, each ≤ 20 characters. Multi-word tags allowed (a tag is a phrase). Mix high/low competition.

- **Input (zod):** `{ keyword: string (min 1, max 100), location?: string (enum Global|USA|UK|AUS|CAN|EU|IND, default Global) }`
- **Output (zod):**
  ```
  {
    tags:      Array<{ tag: string (max 20), competition: 'high'|'medium'|'low', searchVolume: 'high'|'medium'|'low' }>,  // 13 items
    materials: Array<{ tag, competition, searchVolume }>,  // 4-6 items
    styles:    Array<{ tag, competition, searchVolume }>   // 3-5 items
  }
  ```
- **Shape matches FE mock** (`MOCK_TAGS`/`MOCK_MATERIALS`/`MOCK_STYLES`, each row `{tag,competition,searchVolume}`).
- **Phase 2 limitation (label in UI):** `competition` & `searchVolume` are **AI-estimated** (LLM has no real Etsy data until Phase 3). The summary stats (Competition count "12,847", Search Volume "8,320/mo", price range, monthly trend, Listings tab) stay **mock/hardcoded** in Phase 2 — they require Etsy data (Phase 3). **Add an "AI estimated" badge** to the tag table header. (See §5.)
- System prompt: "...generate exactly 13 Etsy tags (each ≤20 chars), plus material and style suggestions. For each, estimate competition and searchVolume as high/medium/low based on your knowledge of Etsy. Return JSON {tags:[...],materials:[...],styles:[...]}."

### 2.4 keyword-generator

**See §5 for the Phase-3-swap design.** Etsy/SEO rules: related long-tail keywords around the seed.

- **Input (zod):** `{ seed: string (min 1, max 100) }`
- **Output (zod):**
  ```
  { keywords: Array<{ keyword: string, volume: number, competition: 'high'|'medium'|'low', cpc: string, trend: string }> }  // 8-12 items
  ```
- **Shape matches FE mock** exactly (`{ keyword, volume, competition, cpc, trend }`, `cpc` like "$0.95", `trend` like "+12%").
- `volume`, `cpc`, `trend` are **AI estimated** in Phase 2 → UI labels them (see §5). Phase 3 swaps the data source (real Etsy/keyword data) behind the **same response shape** so FE never changes.

### 2.5 rankhero-ai (chat, streaming)

**Persona:** "HeroRank AI — an expert Etsy selling assistant. Help with SEO (tags/titles/descriptions), shop strategy, pricing, listing advice, market analysis. Be concise, practical, friendly. Use **bold** sparingly for emphasis and numbered/bulleted lists. Reference HeroRank tools (Tag Generator, Profit Calculator) where relevant."

- **Input (zod):** `{ messages: Array<{ role:'user'|'assistant', content: string (max 4000) }> (min 1, max 40) }` — FE sends prior turns (excluding the hardcoded initial greeting, which is client-only). Route **prepends the system prompt** server-side (never trust client system prompt).
- **Output:** SSE stream of text deltas (see §3.5 wire format).
- The initial assistant greeting stays client-side (it is static UI copy, costs nothing, not sent to the LLM).

---

## 3. API contract

All routes live in **`src/lib/server/api/routes/llm-tools.ts`** (Engineer D owns — a NEW file mounted at `/api/tools`). **Important mounting note in §7.**

### 3.1–3.4 JSON tools (title/description/tag/keyword)

Pattern (identical to Phase 1 `echo` chain):
```
router.post('/title-generator', requireAuth, requireCredits('title'), handler)
```
- `requireAuth` → `requireCredits(toolKey)` → handler runs llmService → returns JSON `{ ...result }` → middleware deducts on 2xx and merges `creditsRemaining`.
- Handler: parse body → zod `inputSchema.safeParse` (400 VALIDATION on fail, before any LLM call so no charge) → `llmService.complete({jsonMode:true})` → `JSON.parse` → `outputSchema.safeParse` (LlmParseError→502 on fail) → `c.json(result)`.
- On any llmService throw → mapped to ≥400 (per §1.4) → **no deduction**.

**Response (success):** `{ <tool result fields>, creditsRemaining: number }`. (The `creditsRemaining` is injected by `requireCredits`.)
**402:** `{ error:'INSUFFICIENT_CREDITS', message, balance }`.
**400/502/503/504/429:** `{ error, message }`.

`toolKey` per route maps to existing `TOOL_COSTS` keys: `title`, `description`, `tag`, `keyword`.

### 3.5 rankhero-ai/chat (SSE)

```
router.post('/rankhero-ai/chat', requireAuth, handler)   // NO requireCredits middleware — manual deduct (§1.5)
```
Handler returns a `Response` with `Content-Type: text/event-stream`, built from a `ReadableStream`.

**Wire format (SSE events):**
```
data: {"delta":"Sure, "}\n\n
data: {"delta":"here "}\n\n
...
event: done\ndata: {"creditsRemaining": 86}\n\n
data: [DONE]\n\n
```
On error mid-stream:
```
event: error\ndata: {"error":"LLM_UNAVAILABLE","message":"AI service is temporarily unavailable. Please try again."}\n\n
data: [DONE]\n\n
```
Pre-stream failures (402 insufficient, 400 bad body, 503 no key) are returned as **normal JSON HTTP responses** (no stream opened) so the FE can branch on `res.ok` before reading the stream.

### 3.6 Credit costs (update `toolCosts.ts`)

Current `TOOL_COSTS` already declares Phase 2 keys. **Proposed final costs** (Engineer C's file — see §7 ownership):

| Tool | Key | Cost | Rationale |
|---|---|---|---|
| title-generator | `title` | 1 | single short completion |
| tag-generator | `tag` | 1 | single completion |
| keyword-generator | `keyword` | 1 | single completion |
| description-generator | `description` | 2 | longer output, more tokens |
| RankHero AI chat | `rankhero-ai` | 2 | per message, multi-turn context |

These match the values already in `toolCosts.ts` → **no change to numbers needed**, only confirm. (Open question Q3 if PM wants different economics vs PLAN_CREDITS pool of free=30/side=750/business=3000/ent=9000.)

---

## 4. FE wiring per page

Shared concern: every tool call must (a) show loading, (b) handle errors, (c) on 402 show an **upgrade CTA linking to `/pricing`**, (d) update the credits badge from `creditsRemaining`. Engineer **E** (FE) owns all 5 pages.

**Reusable client helper** (Engineer E owns, NEW file `src/lib/tools-client.ts`):
```ts
export async function callTool<T>(tool: string, body: unknown): Promise<
  | { ok: true; data: T; creditsRemaining: number }
  | { ok: false; status: number; error: string; message: string; balance?: number }
>
```
Wraps `fetch('/api/tools/'+tool, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})`, parses JSON, normalizes errors. On 402 returns `ok:false, status:402`.

**Credits badge update:** Phase 1 Header shows `credits.balance` from `+layout.server.ts` load data. The badge is server-rendered per navigation. For live update after a tool call, FE updates a shared client store OR calls `invalidateAll()`. **Recommendation:** lightweight — expose a `creditsRemaining` writable store in `tools-client.ts`; Header subscribes and overrides the server value when the store is set. (Open question Q4: Header is Engineer C's file — does C add the store subscription, or E? See §7.)

Per page:

### 4.1 title-generator
- Replace `MOCK_TITLES` + `hasGenerated` toggle. On submit: `loading=true`, `callTool('title-generator', {description})`.
- Success → render `data.titles` (same `{title,chars,score}` shape). Error → inline error banner. 402 → upgrade CTA.
- Add `loading` (spinner on button), `error` state. Empty input already guarded.

### 4.2 description-generator
- Replace `MOCK_DESCRIPTION`. On submit → `callTool('description-generator',{productInfo})`. Render `data.description` in the existing `<pre>`. Copy button copies `data.description` (currently copies the const).

### 4.3 tag-generator
- Replace `MOCK_TAGS/MATERIALS/STYLES` with `data.tags/materials/styles`. Keep tab UI, selection (≤13), copy.
- **Keep mock** for: summary stat numbers, price range, monthly trend, Listings tab (Phase 3 data). Add **"AI estimated"** badge near the table + a small note: "Competition & volume are AI estimates — real Etsy data coming soon."
- `location` is passed to the API but Phase 2 LLM ignores it for real data (still sent for Phase 3 forward-compat).

### 4.4 keyword-generator
- Replace `MOCK_KEYWORDS` with `data.keywords`. Keep selection + copy.
- Add **"AI estimated"** label on Volume/CPC/Trend columns (header tooltip or a banner). See §5.

### 4.5 rankhero-ai (chat + XSS fix)
- Replace `MOCK_RESPONSES`/`setTimeout` with a real SSE call. On send: append user msg, set `isTyping`, POST history to `/api/tools/rankhero-ai/chat`.
- **Read SSE stream incrementally** (`res.body.getReader()` + `TextDecoder`), append each `delta` to the streaming assistant message (typewriter effect, replaces the `isTyping` dots once first delta arrives).
- On `event: done` → read `creditsRemaining`, update badge. On `event: error` → show error bubble, do not charge.
- Pre-stream non-OK (402/400/503): branch before reading stream; 402 → upgrade CTA bubble.

**XSS FIX (tech-debt #5) — MANDATORY:**
The current `renderContent` does `content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")` then `{@html}` — **unescaped**, so any `<`/`>`/`&` (or `<img onerror>`) in LLM/user content is injected raw. With a real LLM the output is untrusted.

**Solution (recommended, no new dependency):** escape first, then apply the bold transform on the escaped string:
```ts
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function renderContent(content: string): string {
  return escapeHtml(content).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}
```
Because escaping runs first, `**` from the model becomes `<strong>` but any HTML in the content is inert (`&lt;img…`). This is the minimal, auditable fix. A `DOMPurify`-style lib is overkill for a bold-only renderer and adds bundle weight — **rejected** unless we later support richer markdown (then use a sanitizing markdown lib). Put `escapeHtml`+`renderContent` in a tiny tested helper `src/lib/sanitize.ts` so it has unit coverage (Engineer E owns). (Open question Q5: do we want lists/links rendered too? If yes, a markdown+sanitize lib is justified; if bold-only, the escape approach is correct.)

---

## 5. keyword-generator — Phase 3 swap design

Phase 2 has **no real Etsy data** (Phase 3 registers the Etsy API + estimation engine). So:
- Phase 2: `keyword-generator` route calls `llmService` to generate keyword ideas with **AI-estimated** volume/competition/cpc/trend.
- **Stable contract:** the response shape `{ keywords: [{keyword, volume, competition, cpc, trend}] }` is the Phase-3 contract too. Phase 3 will replace the *data source* (real Etsy/keyword metrics + `keywords_cache` table from backend-architecture) **behind the same route + same JSON shape** — FE and API consumers do not change.
- To make the swap clean: the route delegates to a `keywordSource` seam. Phase 2 provides `createLlmKeywordSource(llmService)`; Phase 3 provides `createEtsyKeywordSource(...)` implementing the same `KeywordSource` interface. The route imports the source via a provider (same lazy-provider pattern as `services/provider.ts`).
- **UI must label** AI estimates so users are not misled (and so Phase 3 can drop the label). Same applies to tag-generator's competition/searchVolume.

This also documents the tag-generator estimates as Phase-2-AI / Phase-3-real.

---

## 6. Test plan (QA) — must run with NO real LLM key

**Critical constraint:** environment has no real `LLM_API_KEY`. **Every automated test runs against a mocked fetch / local mock server.** Real-gateway verification is a separate manual script.

### 6.1 Unit — llmService (mock `fetchImpl`)
- `complete()` builds correct request body (model, messages, stream:false, response_format json).
- `complete()` parses `choices[0].message.content`.
- `stream()` parses multi-chunk SSE, yields deltas in order, stops on `[DONE]`.
- Timeout → `LlmTimeoutError` (mock fetch that never resolves + fake timers/AbortController).
- Gateway 429 → `LlmRateLimitError`; 500 → `LlmUpstreamError`; missing key → `LlmConfigError`.
- Malformed JSON content → caller's `JSON.parse` throws → mapped to `LlmParseError` at route.

### 6.2 Unit — prompt output parsing / zod
- Each tool's `outputSchema` accepts a known-good fixture, rejects malformed (e.g. title >140, missing fields, wrong enum).
- Route logic: on first parse failure, **one retry** with a stricter "return ONLY valid JSON" reminder appended; second failure → `LlmParseError`. (Retry does not double-charge — charge is after final 2xx.)
- title route recomputes `chars` from `title.length` (does not trust model).

### 6.3 Integration — routes against a local mock gateway
- Spin a local mock server (or inject `fetchImpl`) returning canned completions; assert:
  - happy path → 200 + correct shape + `creditsRemaining` decremented by tool cost.
  - LLM throws → correct status (502/503/504/429) AND **balance unchanged** (assert no ledger spend row).
  - insufficient credits → 402, no LLM call made, no charge.
  - bad body → 400, no LLM call, no charge.
- Chat SSE: assert deltas forwarded, `event: done` carries `creditsRemaining`, deduct happens once after `[DONE]`, mid-stream error → no deduct.

### 6.4 FE smoke
- Each page: mock `fetch` (or MSW) → loading state shows, success renders real data shape, error banner on 5xx, upgrade CTA on 402, badge updates from `creditsRemaining`.
- Chat: streamed deltas append; XSS test — feed content `<img src=x onerror=alert(1)>**bold**` → assert rendered DOM contains literal `&lt;img…` text and a real `<strong>bold</strong>`, NO `img` element created. **This is the regression test for tech-debt #5.**
- `sanitize.ts` unit test covers escape + bold independently.

### 6.5 Manual gateway verification script
`scripts/verify-gateway.mjs` (Engineer D owns) — run **only when a real key is present**:
- Reads `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` from `.dev.vars`/env.
- Does one non-streaming `complete` (title prompt) + one `stream` (chat) against the real gateway, prints results + latency.
- Exits non-zero with a clear message if key missing (so it is obviously a manual-only tool, never in CI).
- Documented in the spec as the bridge for when the key arrives.

---

## 7. Ownership split (no file overlap) + dependency order

Three engineers. Phase 1's `toolCosts.ts` and `routes/tools.ts` were **Engineer C**'s files. To avoid overlap we **add a NEW routes file** rather than editing C's `tools.ts`.

| Eng | Role | Owns (NEW unless noted) | Depends on |
|---|---|---|---|
| **D** | LLM backend | `services/llmService.ts`, `services/prompts/*.ts` (5), `services/keywordSource.ts`, `api/routes/llm-tools.ts`, `scripts/verify-gateway.mjs`, all backend unit/integration tests | env (`LLM_*` already in `env.ts`), `requireCredits`/`requireAuth` (A), `creditsService.getBalance/spendCredits` (C, already shipped) |
| **C** | credits seam | **edits** `services/toolCosts.ts` (confirm Phase 2 costs — values already correct, just remove the "routes do not exist yet" comment) | none |
| **E** | FE | all 5 `+page.svelte`, NEW `src/lib/tools-client.ts`, NEW `src/lib/sanitize.ts`, FE smoke tests | D's API contract (§3) — can build against mock first |

**Mounting (avoid editing A's `app.ts` and C's `tools.ts`):**
- `app.ts` mounts ONE router at `/api/tools` (C's `routes/tools.ts`). Two files cannot both mount at `/api/tools` via `app.route` without an edit.
- **Decision:** Engineer D's `llm-tools.ts` is **imported and re-mounted inside C's `routes/tools.ts`** with `tools.route('/', llmTools)` — a **one-line addition** to `tools.ts`. So `tools.ts` is touched by exactly one engineer. **Assign that one-line edit to Engineer C** (it is C's file), D delivers `llm-tools.ts` as a default-exported `Hono<AppEnv>`. This keeps the §7 "no two owners per file" rule. (Alternative Q6: ask A to add a 5th entry to `ROUTERS` in `app.ts` at `/api/tools/llm` — but that changes URL paths; rejected to keep clean `/api/tools/title-generator` URLs.)

**Dependency order:**
1. **D** ships `llmService` + prompts + error types first (unblocks everything; testable with mock fetch immediately, no key needed).
2. **C** confirms `toolCosts.ts` (trivial, parallel) and adds the one-line mount of D's router once D's file exists.
3. **D** ships `llm-tools.ts` routes (depends on llmService + the mount seam).
4. **E** wires FE against the contract — can start against a mock in parallel with D, finalize once routes are live. `sanitize.ts` + XSS test can be done independently and first (no backend dep).

**Zero file overlap confirmed:** D = new service/route/script files; C = own `toolCosts.ts` + one-line mount in own `tools.ts`; E = own page files + 2 new `$lib` files. Header.svelte credits-badge live-update — see Q4 (assign to C since Header is C's, or use `invalidateAll()` from E to avoid touching Header).

---

## 8. Business rules (testable)

- **BR-P2-01** A tool call that fails for any reason (LLM down/timeout/quota/bad output, bad input, insufficient credits) charges the user **0 credits**. (Verified by ledger having no `spend:<tool>` row.)
- **BR-P2-02** A successful JSON tool call charges exactly the `TOOL_COSTS[key]` amount and returns `creditsRemaining` = new balance.
- **BR-P2-03** Chat deducts `rankhero-ai` cost **once**, only after the LLM stream completes (`[DONE]` received); never on mid-stream error.
- **BR-P2-04** title-generator returns exactly 5 titles, each ≤140 chars (route recomputes `chars`).
- **BR-P2-05** tag-generator returns exactly 13 tags, each ≤20 chars.
- **BR-P2-06** Insufficient credits returns 402 with `balance`, and the LLM is **never called** (pre-check).
- **BR-P2-07** Chat output is HTML-escaped before `{@html}`; no markup other than `<strong>` from `**bold**` can reach the DOM. (XSS regression.)
- **BR-P2-08** keyword-generator & tag-generator responses are explicitly labeled "AI estimated" in the UI; response shape is the Phase-3 contract (unchanged when real data lands).
- **BR-P2-09** With no `LLM_API_KEY` configured, tool calls return 503 `LLM_UNAVAILABLE` (not a 500 crash, not a charge).

## 9. Acceptance criteria (Given/When/Then highlights)

- **Given** a signed-in user with ≥1 credit, **When** they submit the title generator with a description, **Then** 5 real titles render and the credits badge drops by 1.
- **Given** the gateway is down, **When** any tool is called, **Then** the user sees a friendly "AI temporarily unavailable" message and **is not charged** (balance unchanged).
- **Given** a user with 0 credits, **When** they call any tool, **Then** a 402 upgrade CTA to `/pricing` shows and the LLM is not called.
- **Given** the chat, **When** the LLM streams a reply containing `<script>`/`<img onerror>`, **Then** it renders as inert text and only `**bold**` becomes `<strong>`.
- **Given** the chat stream completes, **When** `event: done` arrives, **Then** the credits badge updates and exactly `rankhero-ai` cost was deducted once.
- **Given** no real LLM key, **When** the unit/integration/smoke suites run, **Then** they all pass against mocks (CI is green without a key).

## 10. Technical constraints & risks

- Cloudflare Workers: SSE streaming via `ReadableStream` + `TransformStream` is supported; must not buffer the whole response. Use `c.body(stream)` / return a `Response` with the stream.
- Worker CPU/time limits: chat stream must flush deltas as they arrive (no accumulate-then-send).
- D1 `spendCredits` is atomic/race-safe (Phase 1) — reused unchanged; chat's manual deduct calls the **same** `spendCredits` so concurrency safety holds.
- The gateway model name is env-driven (`LLM_MODEL`) — never hardcode. Default `LLM_BASE_URL` to the vtoken URL but allow override.
- Streaming + manual deduct is the riskiest piece → most integration test coverage there.

## 11. Assumptions

- A1: `LLM_MODEL` env var will be added to `env.ts` by Engineer A (it is referenced in the brief but `env.ts` currently lists only `LLM_BASE_URL?`/`LLM_API_KEY?`). **Needs A to add `LLM_MODEL?`** — flagged, not assumed silently. (Open question Q7.)
- A2: Tool costs already in `toolCosts.ts` are the intended Phase 2 economics (confirmed by their presence).
- A3: The chat initial greeting is static UI copy, not an LLM call — stays client-side, free.
- A4: Phase 2 does not persist chat history or tool results to D1 (`analyses` table is Phase 3+). Each call is stateless; FE holds chat history in memory.
- A5: `location` in tag-generator is forwarded for Phase 3 forward-compat but does not change Phase 2 AI output.

---

## Open questions for PM

- **Q1** — Confirm plain `fetch` over `openai` SDK for the LLM client (BA recommends fetch; reversible).
- **Q2** — Streaming credit policy: deduct-after-`[DONE]` (BA recommends, simple, ≤2-credit risk on rare disconnect) vs reserve-then-settle ledger (safer, more code)?
- **Q3** — Confirm tool costs: title/tag/keyword=1, description=2, chat=2. OK against the free=30 monthly pool?
- **Q4** — Live credits-badge update after a tool call: Engineer C adds a store subscription to Header.svelte, OR Engineer E uses `invalidateAll()` (no Header edit)? (Affects ownership.)
- **Q5** — Chat rendering: bold-only (escape approach, no dep) or full markdown lists/links (needs a sanitizing markdown lib)? BA recommends bold-only for Phase 2.
- **Q6** — Mounting: re-mount D's `llm-tools.ts` inside C's `tools.ts` (one-line, BA recommends) — confirm C makes that one-line edit.
- **Q7** — `env.ts` needs `LLM_MODEL?` added (Engineer A's file). Confirm A adds it (one field).

---
name: llm-fetch-sse-on-workers
description: OpenAI-compatible LLM client with plain fetch + SSE streaming on Cloudflare Workers, no openai SDK; typed-error mapping + manual credit deduct for streaming.
metadata:
  type: project
---

OpenAI-compatible LLM gateway integration (Phase 2, `services/llmService.ts`).

**Why:** PM chose plain `fetch` over the `openai` SDK (Q1) to keep the Worker bundle lean; the gateway (`vtoken.viemind.ai/v1`) is a standard `/chat/completions` endpoint, only two call shapes needed.

**How to apply:**
- `complete()` = `stream:false` + `response_format:{type:'json_object'}` when jsonMode; read `choices[0].message.content`.
- `stream()` = `stream:true`; parse SSE by splitting buffer on `\n\n`, each `data:` line is a chunk, `choices[0].delta.content`, stop on `data: [DONE]`. Must buffer across chunk boundaries (an event can span two `reader.read()` reads) — keep the tail after the last `\n\n`.
- Timeout via `AbortController`; `AbortError` → typed `LlmTimeoutError`. Never read the gateway error body into the thrown error (no leak).
- Typed errors (`LlmConfigError/Timeout/RateLimit/Upstream/Parse`) live in the service; the ROUTE maps them to HTTP (503/504/429/502). JSON parse+zod-validate+1-retry lives in `llmJson.completeJson`, NOT the service (keeps service generic).
- DI seam `config.fetchImpl` makes the whole thing unit-testable with a mock fetch — no key, no network, CI green. Mock SSE = a `ReadableStream` enqueuing `data: ...\n\n` strings.

**Streaming credit deduct (the hard part):** SSE can't use `requireCredits` (response is text/event-stream, 200 committed before stream completes). Pattern: pre-check balance → return 402 JSON if short (no stream); open stream; deduct via `creditsService.spendCredits` ONCE only after the upstream iterator finishes cleanly; emit `event: done` with `creditsRemaining` then `data: [DONE]`. Mid-stream throw → `event: error`, NO deduct. See [[d1-atomic-conditional-debit]] (same spend, race-safe).

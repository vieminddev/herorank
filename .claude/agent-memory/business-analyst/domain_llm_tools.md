---
name: domain-llm-tools
description: HeroRank Phase 2 — 5 LLM tools via OpenAI-compatible gateway; llmService, streaming-deduct, XSS fix
metadata:
  type: project
domain: llm-tools
last_analyzed: 2026-06-12
files_analyzed: [routes/tools.ts, requireCredits.ts, toolCosts.ts, creditsService.ts, creditsRepo.ts, provider.ts, app.ts, billingService.ts, 5 FE tool pages]
---

## Architecture (Phase 2, spec at _workspaces/2026-06-12_phase2-llm-tools/01_ba_spec.md)
- Gateway `https://vtoken.viemind.ai/v1` OpenAI-compatible. Env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL (LLM_MODEL NOT yet in env.ts — A must add).
- llmService = plain fetch (NO openai SDK — Worker bundle + anti-lock-in), DI factory, fetchImpl seam for mock tests. complete() + stream() (SSE).
- 4 JSON tools reuse Phase 1 chain `requireAuth → requireCredits(key) → handler → deduct-after-2xx → merge creditsRemaining`. Chat = SSE, NO requireCredits middleware → manual deduct after [DONE].

## Phase 1 seams reused (do NOT re-derive)
- requireCredits.ts: pre-check balance, run handler, deduct ONLY if status<400, merges creditsRemaining into JSON body. Non-JSON responses untouched → why chat can't use it.
- TOOL_COSTS already has Phase 2 keys: title=1, tag=1, keyword=1, description=2, rankhero-ai=2 (values already correct).
- spendCredits(userId, tool) atomic/race-safe via D1 batch (creditsRepo.spend). getBalance = SUM(ledger.delta). Reused unchanged by chat manual deduct.
- app.ts mounts ONE router per prefix; /api/tools = C's routes/tools.ts. To add LLM routes without 2 owners: D delivers llm-tools.ts default-export, C adds one-line `tools.route('/', llmTools)`.

## FE mock shapes (match exactly so FE changes minimal)
- title: {title, score, chars} ×5. description: single multiline string in <pre>. tag: {tag,competition,searchVolume} for tags(13)/materials/styles. keyword: {keyword,volume,competition,cpc('$0.95'),trend('+12%')}.
- tag/keyword volume+competition are AI-ESTIMATED in Phase 2 (no Etsy data till Phase 3) → UI must label "AI estimated"; response shape = Phase 3 contract (swap source, not shape).

## XSS tech-debt #5 (MUST fix this phase)
- rankhero-ai/+page.svelte line ~38 renderContent does {@html} of `content.replace(**→<strong>)` WITHOUT escaping. Fix: escapeHtml FIRST then bold regex. Put in src/lib/sanitize.ts + unit test. No DOMPurify needed for bold-only.

## Gotchas
- Deduct-after-2xx means a thrown LLM error = no charge (the core Phase 2 invariant BR-P2-01).
- No real LLM_API_KEY in env → all tests must use mock fetch / local mock server; scripts/verify-gateway.mjs = manual-only when key arrives.
- No D1 persistence of chat/results in Phase 2 (analyses table is Phase 3).

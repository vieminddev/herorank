---
name: project-phase2-llm-tools
description: HeroRank Phase 2 — wire 5 tools to real LLM gateway, replace FE mocks, fix XSS
metadata:
  type: project
---

Phase 2 (2026-06-12): 5 LLM tools (title/description/tag/keyword generator + RankHero AI chat streaming) via vtoken OpenAI-compatible gateway. Phase 1 (auth+billing+credits) done & QA-passed.

**Why:** turn the UI-only clone into a working product; monetize via credits already built in Phase 1.

**How to apply:** Spec `_workspaces/2026-06-12_phase2-llm-tools/01_ba_spec.md`. See [[domain-llm-tools]]. Ownership: Eng D = llmService + prompts + routes/llm-tools.ts + verify-gateway.mjs + backend tests. Eng C = confirm toolCosts.ts + one-line mount in own tools.ts. Eng E = 5 FE pages + tools-client.ts + sanitize.ts (XSS fix) + FE smoke. Zero file overlap.

**Core invariant:** failed LLM call charges 0 credits (deduct-after-2xx). Chat deducts once after SSE [DONE], never on mid-stream error.

**Open PM questions:** Q1 fetch-vs-SDK, Q2 streaming deduct policy, Q3 confirm costs, Q4 badge-update owner (C Header vs E invalidateAll), Q5 bold-only vs full markdown, Q6 mount via C's tools.ts, Q7 A must add LLM_MODEL to env.ts.

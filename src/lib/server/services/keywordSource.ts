/**
 * Keyword source seam (Engineer D) — Phase 2 LLM-based keyword generation.
 *
 * `createLlmKeywordSource(llmService)` returns a `KeywordSource` that delegates to the LLM
 * via `completeJson`. Phase 3 can swap this for a data-source-backed implementation without
 * changing the route.
 */
import type { LlmService } from './llmService';
import { LlmParseError } from './llmService';
import { completeJson } from './llmJson';
import * as keywordPrompt from './prompts/keyword';

export interface KeywordSource {
  getKeywords(input: { seed: string }): Promise<{ keywords: Array<Record<string, unknown>> }>;
}

export function createLlmKeywordSource(llm: LlmService): KeywordSource {
  return {
    async getKeywords(input) {
      const result = await completeJson(llm, {
        messages: keywordPrompt.buildMessages(input),
        schema: keywordPrompt.outputSchema,
        temperature: 0.7,
      });
      if (!result) {
        throw new LlmParseError('Keyword generation failed after retry.');
      }
      return result as { keywords: Array<Record<string, unknown>> };
    },
  };
}

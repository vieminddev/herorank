/**
 * completeJson (Engineer D) — LLM completion + JSON parse + zod validate + one retry.
 *
 * Wraps `llmService.complete` (json mode) → parse → validate against a zod schema.
 * On first failure (parse or schema) retries ONCE. Returns `null` after the retry also fails
 * (caller maps to LlmParseError / 502).
 *
 * Also strips ```json code fences (common LLM artifact) before parsing.
 */
import { z } from 'zod';
import type { LlmService, ChatMessage } from './llmService';

interface CompleteJsonOpts<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
}

/** Strip markdown code fences (```json ... ```) that LLMs sometimes wrap output in. */
function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
}

/**
 * Call `svc.complete` in JSON mode, parse + validate against `schema`.
 * Retries ONCE on parse/validation failure. Returns `null` if both attempts fail.
 */
export async function completeJson<T>(
  svc: Pick<LlmService, 'complete'>,
  opts: CompleteJsonOpts<T>
): Promise<T | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = await svc.complete({
      messages: opts.messages,
      jsonMode: true,
      temperature: opts.temperature,
    });

    const cleaned = stripCodeFence(raw.trim());

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      continue; // Retry on JSON parse failure.
    }

    const result = opts.schema.safeParse(parsed);
    if (result.success) return result.data;
    // Schema validation failed — retry.
  }

  return null;
}

/**
 * Second-pass "refine" with graceful fallback: run `completeJson` for the refine prompt and return
 * the refined result, but fall back to `draft` whenever refinement yields nothing usable (null
 * result OR a thrown LLM error). The first-pass draft is never discarded on a refine failure.
 *
 * @param svc   - LLM service (only `complete` is used).
 * @param draft - The pass-1 result to fall back to.
 * @param opts  - The refine messages + schema (+ optional temperature).
 * @returns The refined result, or `draft` when refinement is unavailable/invalid.
 */
export async function refineOrFallback<T>(
  svc: Pick<LlmService, 'complete'>,
  draft: T,
  opts: CompleteJsonOpts<T>
): Promise<T> {
  try {
    const refined = await completeJson(svc, {
      messages: opts.messages,
      schema: opts.schema,
      temperature: opts.temperature,
    });
    return refined ?? draft;
  } catch {
    return draft;
  }
}

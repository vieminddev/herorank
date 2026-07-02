/**
 * video-captions route — `POST /api/tools/video-captions`. Generates short, punchy on-video
 * captions / CTAs from a product description for the Video Maker's text-overlay step.
 *
 * Default-exported `Hono<AppEnv>`, re-mounted by Engineer C inside `routes/tools.ts` via
 * `router.route('/', videoCaptions)` (same pattern as etsy-tools / image). This file does NOT
 * mount itself.
 *
 * Chain: `requireAuth → requireCredits('video-captions')` (cost 1 — it's one LLM call; the render
 * itself stays free). A ≥400 response costs 0 credits. Uses the fast no-thinking model
 * (`LLM_FAST_MODEL`), matching the other structured-JSON tools in llm-tools.ts.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getEnv } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import { createLlmService, LlmError, type LlmService } from '../../services/llmService';
import { completeJson } from '../../services/llmJson';
import * as videoCaptionsPrompt from '../../services/prompts/videoCaptions';

const FAST_MODEL_DEFAULT = 'gemini-2.5-flash-nothinking';

function llmFromEnv(c: import('hono').Context<AppEnv>): LlmService {
  const env = getEnv(c);
  return createLlmService({
    baseUrl: env.LLM_BASE_URL ?? 'https://vtoken.viemind.ai/v1',
    apiKey: env.LLM_API_KEY ?? '',
    model: env.LLM_FAST_MODEL || env.LLM_MODEL || '',
    timeoutMs: 30_000,
  });
}

interface MappedError {
  status: 400 | 429 | 502 | 503 | 504;
  error: string;
  message: string;
}

/** Map an llmService typed error to a friendly HTTP body; never leak gateway internals. */
function mapLlmError(err: unknown): MappedError {
  if (err instanceof LlmError) {
    switch (err.code) {
      case 'LLM_CONFIG':
        return { status: 503, error: 'LLM_UNAVAILABLE', message: 'AI service is not configured yet. Please try again later.' };
      case 'LLM_TIMEOUT':
        return { status: 504, error: 'LLM_TIMEOUT', message: 'The AI took too long to respond. Please try again.' };
      case 'LLM_RATE_LIMIT':
        return { status: 429, error: 'LLM_BUSY', message: 'AI service is busy. Please retry in a moment.' };
      case 'LLM_PARSE':
        return { status: 502, error: 'LLM_BAD_OUTPUT', message: 'The AI returned an unexpected result. Please try again.' };
      default:
        return { status: 502, error: 'LLM_UNAVAILABLE', message: 'AI service is temporarily unavailable. Please try again.' };
    }
  }
  return { status: 502, error: 'LLM_UNAVAILABLE', message: 'AI service is temporarily unavailable. Please try again.' };
}

const router = new Hono<AppEnv>();

router.post('/video-captions', requireAuth, requireCredits('video-captions'), async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400);
  }
  const parsed = videoCaptionsPrompt.inputSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' }, 400);
  }

  const env = getEnv(c);
  if (!env.LLM_API_KEY || !(env.LLM_FAST_MODEL || env.LLM_MODEL)) {
    return c.json({ error: 'LLM_UNAVAILABLE', message: 'AI service is not configured yet. Please try again later.' }, 503);
  }

  try {
    const llm = llmFromEnv(c);
    const result = await completeJson(llm, {
      messages: videoCaptionsPrompt.buildMessages(parsed.data),
      schema: videoCaptionsPrompt.outputSchema,
      temperature: 0.9,
    });
    if (!result) {
      const m = mapLlmError(new LlmError('LLM_PARSE', 'bad output'));
      return c.json({ error: m.error, message: m.message }, m.status);
    }
    return c.json({ captions: result.captions });
  } catch (err) {
    const m = mapLlmError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

export default router;

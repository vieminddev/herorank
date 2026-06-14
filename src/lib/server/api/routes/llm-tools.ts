/**
 * LLM tool routes (Engineer D owns) — `/api/tools/*` for the 5 Phase 2 tools.
 *
 * Mounting: this default-exported `Hono<AppEnv>` is re-mounted inside Engineer C's
 * `routes/tools.ts` via `tools.route('/', llmTools)` (BA spec §7, PM Q6). This file does NOT
 * mount itself.
 *
 * The 4 JSON tools reuse the Phase 1 chain `requireAuth → requireCredits(key) → handler`, so a
 * failing tool (≥400) costs the user 0 credits (BR-P2-01). The chat route is SSE and deducts
 * MANUALLY after the stream completes (spec §1.5, PM Q2) — it does NOT use requireCredits.
 *
 * llmService typed errors are mapped to friendly HTTP bodies here (spec §1.4); gateway
 * internals are never leaked.
 */
import { Hono } from 'hono';
import type { ZodType } from 'zod';
import type { AppEnv } from '../types';
import { getDb, getEnv, getUser } from '../context';
import { requireAuth } from '../middleware/requireAuth';
import { requireCredits } from '../middleware/requireCredits';
import { createCreditsRepo } from '../../repositories/creditsRepo';
import { createCreditsService } from '../../services/creditsService';
import { getToolCost } from '../../services/toolCosts';
import {
  createLlmService,
  LlmError,
  type LlmService,
  type ChatMessage,
} from '../../services/llmService';
import { completeJson } from '../../services/llmJson';
import { createLlmKeywordSource } from '../../services/keywordSource';
import * as titlePrompt from '../../services/prompts/title';
import * as descriptionPrompt from '../../services/prompts/description';
import * as tagPrompt from '../../services/prompts/tag';
import * as keywordPrompt from '../../services/prompts/keyword';
import * as chatPrompt from '../../services/prompts/chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the request-scoped llmService from env. timeoutMs overridable (chat uses 60s). */
function llmFromEnv(c: import('hono').Context<AppEnv>, timeoutMs?: number): LlmService {
  const env = getEnv(c);
  return createLlmService({
    baseUrl: env.LLM_BASE_URL ?? 'https://vtoken.viemind.ai/v1',
    apiKey: env.LLM_API_KEY ?? '',
    model: env.LLM_MODEL ?? '',
    timeoutMs,
  });
}

interface MappedError {
  status: 400 | 402 | 429 | 502 | 503 | 504;
  error: string;
  message: string;
}

/** Map an llmService typed error to its HTTP body (spec §1.4). Never leaks gateway internals. */
function mapLlmError(err: unknown): MappedError {
  if (err instanceof LlmError) {
    switch (err.code) {
      case 'LLM_CONFIG':
        return {
          status: 503,
          error: 'LLM_UNAVAILABLE',
          message: 'AI service is not configured yet. Please try again later.',
        };
      case 'LLM_TIMEOUT':
        return {
          status: 504,
          error: 'LLM_TIMEOUT',
          message: 'The AI took too long to respond. Please try again.',
        };
      case 'LLM_RATE_LIMIT':
        return {
          status: 429,
          error: 'LLM_BUSY',
          message: 'AI service is busy. Please retry in a moment.',
        };
      case 'LLM_PARSE':
        return {
          status: 502,
          error: 'LLM_BAD_OUTPUT',
          message: 'The AI returned an unexpected result. Please try again.',
        };
      case 'LLM_UPSTREAM':
      default:
        return {
          status: 502,
          error: 'LLM_UNAVAILABLE',
          message: 'AI service is temporarily unavailable. Please try again.',
        };
    }
  }
  // Unknown error — generic 502, no detail leaked.
  return {
    status: 502,
    error: 'LLM_UNAVAILABLE',
    message: 'AI service is temporarily unavailable. Please try again.',
  };
}

/** Parse + zod-validate the request body. Returns the data or a 400 JSON Response. */
async function readBody<T>(
  c: import('hono').Context<AppEnv>,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: c.json({ error: 'VALIDATION', message: 'Invalid JSON body' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: c.json(
        { error: 'VALIDATION', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        400
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = new Hono<AppEnv>();

// --- title-generator (JSON, cost 1) ------------------------------------------
router.post('/title-generator', requireAuth, requireCredits('title'), async (c) => {
  const body = await readBody(c, titlePrompt.inputSchema);
  if (!body.ok) return body.res;

  try {
    const llm = llmFromEnv(c);
    const result = await completeJson(llm, {
      messages: titlePrompt.buildMessages(body.data),
      schema: titlePrompt.outputSchema,
      temperature: 0.8,
    });
    if (!result) {
      const m = mapLlmError(new LlmError('LLM_PARSE', 'bad output'));
      return c.json({ error: m.error, message: m.message }, m.status);
    }
    // Recompute `chars` from title.length — never trust the model (BR-P2-04).
    const titles = result.titles.map((t) => ({ ...t, chars: t.title.length }));
    return c.json({ titles });
  } catch (err) {
    const m = mapLlmError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- description-generator (JSON, cost 2) ------------------------------------
router.post('/description-generator', requireAuth, requireCredits('description'), async (c) => {
  const body = await readBody(c, descriptionPrompt.inputSchema);
  if (!body.ok) return body.res;

  try {
    const llm = llmFromEnv(c);
    const result = await completeJson(llm, {
      messages: descriptionPrompt.buildMessages(body.data),
      schema: descriptionPrompt.outputSchema,
      temperature: 0.8,
    });
    if (!result) {
      const m = mapLlmError(new LlmError('LLM_PARSE', 'bad output'));
      return c.json({ error: m.error, message: m.message }, m.status);
    }
    return c.json({ description: result.description });
  } catch (err) {
    const m = mapLlmError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- tag-generator (JSON, cost 1) --------------------------------------------
router.post('/tag-generator', requireAuth, requireCredits('tag'), async (c) => {
  const body = await readBody(c, tagPrompt.inputSchema);
  if (!body.ok) return body.res;

  try {
    const llm = llmFromEnv(c);
    const result = await completeJson(llm, {
      messages: tagPrompt.buildMessages(body.data),
      schema: tagPrompt.outputSchema,
      temperature: 0.7,
    });
    if (!result) {
      const m = mapLlmError(new LlmError('LLM_PARSE', 'bad output'));
      return c.json({ error: m.error, message: m.message }, m.status);
    }
    return c.json(result);
  } catch (err) {
    const m = mapLlmError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- keyword-generator (JSON, cost 1) ----------------------------------------
// Delegates to the KeywordSource seam (Phase 3 will swap the data source behind it).
router.post('/keyword-generator', requireAuth, requireCredits('keyword'), async (c) => {
  const body = await readBody(c, keywordPrompt.inputSchema);
  if (!body.ok) return body.res;

  try {
    const source = createLlmKeywordSource(llmFromEnv(c));
    const result = await source.getKeywords(body.data);
    return c.json(result);
  } catch (err) {
    const m = mapLlmError(err);
    return c.json({ error: m.error, message: m.message }, m.status);
  }
});

// --- rankhero-ai/chat (SSE, cost 2, MANUAL deduct) ---------------------------
const CHAT_TOOL = 'rankhero-ai';

router.post('/rankhero-ai/chat', requireAuth, async (c) => {
  const body = await readBody(c, chatPrompt.inputSchema);
  if (!body.ok) return body.res;

  // 0. Pre-check LLM config BEFORE opening the stream (spec §3.5): an unconfigured gateway must
  //    surface as a pre-stream 503 JSON so the FE can branch on `res.ok`, not an in-stream
  //    `event: error` after HTTP 200 is already committed (BUG-01). Message matches the
  //    LLM_CONFIG branch of mapLlmError used by the JSON routes.
  const env = getEnv(c);
  if (!env.LLM_API_KEY || !env.LLM_MODEL) {
    return c.json(
      {
        error: 'LLM_UNAVAILABLE',
        message: 'AI service is not configured yet. Please try again later.',
      },
      503
    );
  }

  const user = getUser(c);
  const credits = createCreditsService(createCreditsRepo(getDb(c)));
  const cost = getToolCost(CHAT_TOOL) ?? 0;

  // 1. Pre-check balance BEFORE opening the stream (spec §1.5 step 1). 402 → no stream.
  const balance = await credits.getBalance(user.id);
  if (balance < cost) {
    return c.json(
      { error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits', balance },
      402
    );
  }

  const messages: ChatMessage[] = chatPrompt.buildMessages(body.data);
  const llm = llmFromEnv(c, 60_000);

  // F-01: per-request idempotency ref for the post-stream deduct. The credits ledger now has a
  // unique index on (user_id, ref), so a CONSTANT ref (the old `CHAT_TOOL`) would make a user's
  // SECOND chat a silent no-op (under-charge). `spend:{tool}:{requestId}` is unique per request
  // but stable across a retry of the SAME request, so each distinct chat is charged exactly once.
  const chatRequestId = (() => {
    const v = (c as unknown as { get: (k: string) => unknown }).get('requestId');
    return typeof v === 'string' ? v : undefined;
  })() ?? crypto.randomUUID();
  const chatSpendRef = `spend:${CHAT_TOOL}:${chatRequestId}`;

  const encoder = new TextEncoder();
  const sse = (s: string) => encoder.encode(s);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let completed = false;
      try {
        // 2. Pipe deltas as `data: {"delta":"..."}` events.
        for await (const delta of llm.stream({ messages, temperature: 0.7 })) {
          controller.enqueue(sse(`data: ${JSON.stringify({ delta })}\n\n`));
        }
        completed = true;
      } catch (err) {
        // 5. Mid-stream error → emit `event: error`, do NOT deduct, close.
        const m = mapLlmError(err);
        controller.enqueue(
          sse(`event: error\ndata: ${JSON.stringify({ error: m.error, message: m.message })}\n\n`)
        );
        controller.enqueue(sse('data: [DONE]\n\n'));
        controller.close();
        return;
      }

      if (completed) {
        // 3. Deduct only after a clean `[DONE]` (BR-P2-03). try/finally so a late client
        //    disconnect still settles the charge for a fully-delivered answer (spec §1.5 edge).
        let remaining = balance - cost;
        try {
          const result = await credits.spendCredits(user.id, CHAT_TOOL, chatSpendRef);
          remaining = result.balance;
        } catch {
          // Lost a concurrent race (rare) — still emit done with best-known balance.
        }
        // 4. Final `event: done` carries creditsRemaining, then `[DONE]`.
        controller.enqueue(
          sse(`event: done\ndata: ${JSON.stringify({ creditsRemaining: remaining })}\n\n`)
        );
        controller.enqueue(sse('data: [DONE]\n\n'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
});

export default router;

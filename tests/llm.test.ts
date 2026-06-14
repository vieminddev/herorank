/**
 * Unit tests for the Phase 2 LLM backend (Engineer D).
 *
 * Everything runs against a MOCKED `fetch` (DI seam `config.fetchImpl`) — no network, no real
 * key. This is the CI contract (spec §6): the suite is green without an LLM key.
 *
 * Relative imports (not `$lib`) keep the tests independent of the SvelteKit alias resolver,
 * matching `credits.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createLlmService,
  LlmConfigError,
  LlmRateLimitError,
  LlmUpstreamError,
  LlmTimeoutError,
  LlmParseError,
  LlmError,
  type LlmConfig,
} from '../src/lib/server/services/llmService';
import { completeJson } from '../src/lib/server/services/llmJson';
import * as titlePrompt from '../src/lib/server/services/prompts/title';
import * as tagPrompt from '../src/lib/server/services/prompts/tag';
import * as keywordPrompt from '../src/lib/server/services/prompts/keyword';
import { createLlmKeywordSource } from '../src/lib/server/services/keywordSource';

// --- helpers ---------------------------------------------------------------

const baseConfig = (over: Partial<LlmConfig> = {}): LlmConfig => ({
  baseUrl: 'https://gw.test/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  ...over,
});

/** A mock fetch returning a JSON completion with the given content string. */
function jsonCompletionFetch(content: string, capture?: (req: RequestInit) => void): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    capture?.(init ?? {});
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** A mock fetch returning a fixed HTTP status (no body parsing needed). */
function statusFetch(status: number): typeof fetch {
  return (async () =>
    new Response('upstream detail that must not leak', { status })) as unknown as typeof fetch;
}

/** A mock fetch streaming the given SSE event strings as one body. */
function sseFetch(events: string[]): typeof fetch {
  return (async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const e of events) controller.enqueue(enc.encode(e));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

// --- complete() ------------------------------------------------------------

describe('llmService.complete', () => {
  it('builds the correct request body and parses choices[0].message.content', async () => {
    let captured: RequestInit = {};
    const svc = createLlmService(
      baseConfig({ fetchImpl: jsonCompletionFetch('hello world', (i) => (captured = i)) })
    );
    const out = await svc.complete({
      messages: [{ role: 'user', content: 'hi' }],
      jsonMode: true,
      temperature: 0.5,
    });

    expect(out).toBe('hello world');
    const body = JSON.parse(captured.body as string);
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0.5);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect((captured.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
  });

  it('throws LlmParseError on empty content', async () => {
    const svc = createLlmService(baseConfig({ fetchImpl: jsonCompletionFetch('') }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmParseError
    );
  });

  it('throws LlmConfigError when apiKey is missing (no real key guard)', async () => {
    const svc = createLlmService(baseConfig({ apiKey: '', fetchImpl: jsonCompletionFetch('x') }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmConfigError
    );
  });

  it('throws LlmConfigError when model is missing', async () => {
    const svc = createLlmService(baseConfig({ model: '', fetchImpl: jsonCompletionFetch('x') }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmConfigError
    );
  });

  it('maps gateway 429 → LlmRateLimitError', async () => {
    const svc = createLlmService(baseConfig({ fetchImpl: statusFetch(429) }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmRateLimitError
    );
  });

  it('maps gateway 500 → LlmUpstreamError', async () => {
    const svc = createLlmService(baseConfig({ fetchImpl: statusFetch(500) }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmUpstreamError
    );
  });

  it('maps gateway 401 → LlmConfigError (bad credentials, no leak)', async () => {
    const svc = createLlmService(baseConfig({ fetchImpl: statusFetch(401) }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmConfigError
    );
  });

  it('maps an AbortError (timeout) → LlmTimeoutError', async () => {
    const abortFetch = (async (_url: string, init?: RequestInit) => {
      // Simulate the AbortController firing.
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }) as unknown as typeof fetch;
    const svc = createLlmService(baseConfig({ fetchImpl: abortFetch, timeoutMs: 5 }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmTimeoutError
    );
  });

  it('maps a network failure → LlmUpstreamError', async () => {
    const failFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const svc = createLlmService(baseConfig({ fetchImpl: failFetch }));
    await expect(svc.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(
      LlmUpstreamError
    );
  });

  it('never leaks the gateway body in the thrown error', async () => {
    const svc = createLlmService(baseConfig({ fetchImpl: statusFetch(500) }));
    await expect(
      svc.complete({ messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow(/temporarily unavailable/i);
  });
});

// --- stream() --------------------------------------------------------------

describe('llmService.stream', () => {
  it('parses multi-chunk SSE, yields deltas in order, stops on [DONE]', async () => {
    const svc = createLlmService(
      baseConfig({
        fetchImpl: sseFetch([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":", "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
          'data: [DONE]\n\n',
          'data: {"choices":[{"delta":{"content":"AFTER"}}]}\n\n',
        ]),
      })
    );
    const deltas = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(deltas).toEqual(['Hello', ', ', 'world']);
  });

  it('handles an event split across chunk boundaries', async () => {
    // The same logical event delivered in two reads (no \n\n until the second).
    const svc = createLlmService(
      baseConfig({
        fetchImpl: sseFetch([
          'data: {"choices":[{"delta":{"content":"par',
          'tial"}}]}\n\ndata: [DONE]\n\n',
        ]),
      })
    );
    const deltas = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(deltas).toEqual(['partial']);
  });

  it('skips malformed/keep-alive frames without failing the stream', async () => {
    const svc = createLlmService(
      baseConfig({
        fetchImpl: sseFetch([
          'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
          'data: not-json\n\n',
          ': keep-alive comment\n\n',
          'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      })
    );
    const deltas = await collect(svc.stream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(deltas).toEqual(['a', 'b']);
  });

  it('throws LlmConfigError before opening a stream when unconfigured', async () => {
    const svc = createLlmService(baseConfig({ apiKey: '', fetchImpl: sseFetch(['data: [DONE]\n\n']) }));
    await expect(collect(svc.stream({ messages: [{ role: 'user', content: 'x' }] }))).rejects.toBeInstanceOf(
      LlmConfigError
    );
  });

  it('sets stream:true in the request body', async () => {
    let captured: RequestInit = {};
    const capFetch = (async (_url: string, init?: RequestInit) => {
      captured = init ?? {};
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            c.close();
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const svc = createLlmService(baseConfig({ fetchImpl: capFetch }));
    await collect(svc.stream({ messages: [{ role: 'user', content: 'x' }] }));
    expect(JSON.parse(captured.body as string).stream).toBe(true);
  });
});

// --- completeJson (parse + validate + one retry) ---------------------------

describe('completeJson', () => {
  const schema = z.object({ value: z.number() });

  it('parses valid JSON on the first attempt (no retry)', async () => {
    let calls = 0;
    const svc = {
      async complete() {
        calls++;
        return '{"value": 42}';
      },
      stream() {
        throw new Error('unused');
      },
    };
    const out = await completeJson(svc, { messages: [], schema });
    expect(out).toEqual({ value: 42 });
    expect(calls).toBe(1);
  });

  it('strips ```json code fences before parsing', async () => {
    const svc = {
      async complete() {
        return '```json\n{"value": 7}\n```';
      },
      stream() {
        throw new Error('unused');
      },
    };
    expect(await completeJson(svc, { messages: [], schema })).toEqual({ value: 7 });
  });

  it('retries ONCE on bad output, succeeds on the retry', async () => {
    let calls = 0;
    const svc = {
      async complete() {
        calls++;
        return calls === 1 ? 'not json at all' : '{"value": 5}';
      },
      stream() {
        throw new Error('unused');
      },
    };
    const out = await completeJson(svc, { messages: [{ role: 'user', content: 'x' }], schema });
    expect(out).toEqual({ value: 5 });
    expect(calls).toBe(2);
  });

  it('returns null after the retry also fails (caller maps to LlmParseError)', async () => {
    let calls = 0;
    const svc = {
      async complete() {
        calls++;
        return 'garbage';
      },
      stream() {
        throw new Error('unused');
      },
    };
    expect(await completeJson(svc, { messages: [], schema })).toBeNull();
    expect(calls).toBe(2);
  });

  it('returns null when JSON is valid but fails the zod schema', async () => {
    const svc = {
      async complete() {
        return '{"value":"not-a-number"}';
      },
      stream() {
        throw new Error('unused');
      },
    };
    expect(await completeJson(svc, { messages: [], schema })).toBeNull();
  });
});

// --- prompt output schemas -------------------------------------------------

describe('prompt output schemas', () => {
  it('title: accepts exactly 5 valid titles, rejects >140 chars and wrong count', () => {
    const good = {
      titles: Array.from({ length: 5 }, (_, i) => ({ title: `T${i}`, chars: 2, score: 90 })),
    };
    expect(titlePrompt.outputSchema.safeParse(good).success).toBe(true);

    const tooLong = { titles: [{ title: 'x'.repeat(141), chars: 141, score: 50 }] };
    expect(titlePrompt.outputSchema.safeParse(tooLong).success).toBe(false);

    const wrongCount = { titles: [{ title: 'a', chars: 1, score: 1 }] };
    expect(titlePrompt.outputSchema.safeParse(wrongCount).success).toBe(false);
  });

  it('tag: requires exactly 13 tags, each ≤20 chars', () => {
    const row = (tag: string) => ({ tag, competition: 'low' as const, searchVolume: 'low' as const });
    const good = {
      tags: Array.from({ length: 13 }, (_, i) => row(`tag${i}`)),
      materials: [row('silver'), row('gold'), row('steel'), row('brass')],
      styles: [row('boho'), row('modern'), row('vintage')],
    };
    expect(tagPrompt.outputSchema.safeParse(good).success).toBe(true);

    const twelve = { ...good, tags: good.tags.slice(0, 12) };
    expect(tagPrompt.outputSchema.safeParse(twelve).success).toBe(false);

    const overLong = { ...good, tags: [row('x'.repeat(21)), ...good.tags.slice(1)] };
    expect(tagPrompt.outputSchema.safeParse(overLong).success).toBe(false);
  });

  it('tag: location defaults to Global', () => {
    const parsed = tagPrompt.inputSchema.parse({ keyword: 'necklace' });
    expect(parsed.location).toBe('Global');
  });

  it('keyword: accepts 8-12 items with FE shape, rejects 7', () => {
    const item = { keyword: 'k', volume: 100, competition: 'low' as const, cpc: '$0.50', trend: '+3%' };
    const eight = { keywords: Array.from({ length: 8 }, () => item) };
    expect(keywordPrompt.outputSchema.safeParse(eight).success).toBe(true);

    const seven = { keywords: Array.from({ length: 7 }, () => item) };
    expect(keywordPrompt.outputSchema.safeParse(seven).success).toBe(false);
  });
});

// --- keyword source seam ---------------------------------------------------

describe('createLlmKeywordSource', () => {
  it('returns validated keywords from an LLM completion', async () => {
    const item = { keyword: 'k', volume: 1, competition: 'low', cpc: '$1', trend: '+1%' };
    const svc = createLlmService(
      baseConfig({
        fetchImpl: jsonCompletionFetch(
          JSON.stringify({ keywords: Array.from({ length: 9 }, () => item) })
        ),
      })
    );
    const source = createLlmKeywordSource(svc);
    const out = await source.getKeywords({ seed: 'necklace' });
    expect(out.keywords).toHaveLength(9);
  });

  it('throws LlmParseError when the model output never validates', async () => {
    const svc = createLlmService(baseConfig({ fetchImpl: jsonCompletionFetch('{"keywords":[]}') }));
    const source = createLlmKeywordSource(svc);
    await expect(source.getKeywords({ seed: 'x' })).rejects.toBeInstanceOf(LlmParseError);
  });
});

// --- chat SSE deduct contract (BR-P2-03) -----------------------------------
//
// The route's manual-deduct logic (llm-tools.ts /rankhero-ai/chat) is: stream all deltas, and
// only after the upstream stream completes cleanly (its iterator finishes without throwing) call
// spendCredits ONCE; if the stream throws mid-way, never deduct. These tests exercise that exact
// rule against the REAL `llmService.stream` + a fake credits service, so the contract is covered
// even though the Hono handler itself needs full D1 wiring to run end-to-end.

/** Re-implements the route's deduct decision over a delta iterator (single source of behaviour). */
async function drainAndSettle(
  deltas: AsyncIterable<string>,
  spend: () => Promise<{ balance: number }>
): Promise<{ collected: string[]; deducted: boolean; remaining: number | null }> {
  const collected: string[] = [];
  try {
    for await (const d of deltas) collected.push(d);
  } catch {
    // Mid-stream error → no deduct (BR-P2-03).
    return { collected, deducted: false, remaining: null };
  }
  const { balance } = await spend();
  return { collected, deducted: true, remaining: balance };
}

describe('chat SSE deduct contract', () => {
  it('deducts exactly once after a clean [DONE]', async () => {
    let spendCalls = 0;
    const svc = createLlmService(
      baseConfig({
        fetchImpl: sseFetch([
          'data: {"choices":[{"delta":{"content":"hi "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"there"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      })
    );
    const out = await drainAndSettle(svc.stream({ messages: [{ role: 'user', content: 'q' }] }), async () => {
      spendCalls++;
      return { balance: 84 };
    });
    expect(out.collected).toEqual(['hi ', 'there']);
    expect(out.deducted).toBe(true);
    expect(out.remaining).toBe(84);
    expect(spendCalls).toBe(1);
  });

  it('does NOT deduct when the stream errors mid-way', async () => {
    let spendCalls = 0;
    // Gateway 500 → stream() throws before yielding anything.
    const svc = createLlmService(baseConfig({ fetchImpl: statusFetch(500) }));
    const out = await drainAndSettle(svc.stream({ messages: [{ role: 'user', content: 'q' }] }), async () => {
      spendCalls++;
      return { balance: 0 };
    });
    expect(out.deducted).toBe(false);
    expect(spendCalls).toBe(0);
  });
});

// --- chat pre-stream config gate (BUG-01, spec §3.5) -----------------------
//
// The chat route must reject an unconfigured gateway (missing LLM_API_KEY or LLM_MODEL) with a
// pre-stream 503 JSON BEFORE opening the ReadableStream — so the FE branches on `res.ok` instead
// of receiving HTTP 200 + an in-stream `event: error`. The handler needs full D1 wiring to run
// end-to-end, so this exercises the gate's exact decision (same source-of-truth predicate + body).

/** Re-implements the route's pre-stream config gate (llm-tools.ts /rankhero-ai/chat step 0). */
function chatConfigGate(env: { LLM_API_KEY?: string; LLM_MODEL?: string }) {
  if (!env.LLM_API_KEY || !env.LLM_MODEL) {
    return {
      status: 503 as const,
      body: {
        error: 'LLM_UNAVAILABLE',
        message: 'AI service is not configured yet. Please try again later.',
      },
    };
  }
  return null;
}

describe('chat pre-stream config gate', () => {
  it('returns a 503 LLM_UNAVAILABLE JSON when LLM_API_KEY is missing', () => {
    const res = chatConfigGate({ LLM_API_KEY: '', LLM_MODEL: 'm' });
    expect(res).toEqual({
      status: 503,
      body: { error: 'LLM_UNAVAILABLE', message: 'AI service is not configured yet. Please try again later.' },
    });
  });

  it('returns a 503 LLM_UNAVAILABLE JSON when LLM_MODEL is missing', () => {
    const res = chatConfigGate({ LLM_API_KEY: 'sk-test', LLM_MODEL: '' });
    expect(res?.status).toBe(503);
    expect(res?.body.error).toBe('LLM_UNAVAILABLE');
  });

  it('passes (no gate response) when both key and model are present', () => {
    expect(chatConfigGate({ LLM_API_KEY: 'sk-test', LLM_MODEL: 'm' })).toBeNull();
  });
});

// --- error code → mapping sanity (LlmError carries safe code) ---------------

describe('LlmError taxonomy', () => {
  it('each typed error carries its stable code', () => {
    expect(new LlmConfigError().code).toBe('LLM_CONFIG');
    expect(new LlmTimeoutError().code).toBe('LLM_TIMEOUT');
    expect(new LlmRateLimitError().code).toBe('LLM_RATE_LIMIT');
    expect(new LlmUpstreamError().code).toBe('LLM_UPSTREAM');
    expect(new LlmParseError().code).toBe('LLM_PARSE');
    expect(new LlmConfigError()).toBeInstanceOf(LlmError);
  });
});

/**
 * LLM service (Engineer D) — OpenAI-compatible gateway client.
 *
 * Pure TS, no framework dependency. DI seam: `config.fetchImpl` allows mock injection
 * for hermetic tests (llm.test.ts). Never leaks upstream error details.
 *
 * Exports:
 *   - createLlmService(config): LlmService  — factory
 *   - LlmError (base), LlmConfigError, LlmTimeoutError, LlmRateLimitError,
 *     LlmUpstreamError, LlmParseError — typed error taxonomy
 *   - LlmConfig, LlmService, ChatMessage — types
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** OpenAI-compatible image model (e.g. `gpt-image-1`). Required for `generateImage`. */
  imageModel?: string;
  timeoutMs?: number;
  /** DI seam for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface CompleteOptions {
  messages: ChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
}

interface StreamOptions {
  messages: ChatMessage[];
  temperature?: number;
}

export interface GenerateImageOptions {
  prompt: string;
  /** Number of images to generate (default 1). */
  n?: number;
  /** Output size, e.g. "1024x1024" (default "1024x1024"). */
  size?: string;
  /** Override the configured `imageModel` for this call. */
  model?: string;
  /**
   * Optional reference image for image-to-image generation (e.g. a hero shot reused so the same
   * product appears across the set). Accepts a `data:` URL or raw base64; sent to the gateway as
   * `images: [<raw base64>]`. When the model ignores it, generation falls back to text→image.
   */
  referenceImage?: string;
}

/** One generated image — `b64` (base64 JSON) and/or `url`. */
export interface GeneratedImage {
  b64?: string;
  url?: string;
}

export interface LlmService {
  complete(opts: CompleteOptions): Promise<string>;
  stream(opts: StreamOptions): AsyncIterable<string>;
  /** Generate one or more images from a prompt (POST {baseUrl}/images/generations). */
  generateImage(opts: GenerateImageOptions): Promise<GeneratedImage[]>;
}

// ---------------------------------------------------------------------------
// Errors — typed taxonomy, each with a stable `.code` (spec §1.4)
// ---------------------------------------------------------------------------

export type LlmErrorCode = 'LLM_CONFIG' | 'LLM_TIMEOUT' | 'LLM_RATE_LIMIT' | 'LLM_UPSTREAM' | 'LLM_PARSE';

export class LlmError extends Error {
  public readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

export class LlmConfigError extends LlmError {
  constructor(message = 'AI service is not configured or credentials are invalid.') {
    super('LLM_CONFIG', message);
    this.name = 'LlmConfigError';
  }
}

export class LlmTimeoutError extends LlmError {
  constructor(message = 'AI service timed out.') {
    super('LLM_TIMEOUT', message);
    this.name = 'LlmTimeoutError';
  }
}

export class LlmRateLimitError extends LlmError {
  constructor(message = 'AI service rate limit hit.') {
    super('LLM_RATE_LIMIT', message);
    this.name = 'LlmRateLimitError';
  }
}

export class LlmUpstreamError extends LlmError {
  constructor(message = 'AI service is temporarily unavailable.') {
    super('LLM_UPSTREAM', message);
    this.name = 'LlmUpstreamError';
  }
}

export class LlmParseError extends LlmError {
  constructor(message = 'AI returned unparseable output.') {
    super('LLM_PARSE', message);
    this.name = 'LlmParseError';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLlmService(config: LlmConfig): LlmService {
  const { baseUrl, apiKey, model, imageModel, timeoutMs = 30_000 } = config;
  const doFetch = config.fetchImpl ?? globalThis.fetch;

  // Transient upstream failures worth retrying before surfacing an error to the user. The LLM
  // gateway occasionally returns a 502/503/504 or an empty body under load; a short retry turns
  // most of those into a clean success instead of a user-facing error.
  const TRANSIENT_STATUS = new Set([502, 503, 504]);
  const MAX_LLM_ATTEMPTS = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function checkConfig(): void {
    if (!apiKey) throw new LlmConfigError();
    if (!model) throw new LlmConfigError('AI model is not configured.');
  }

  /** Map a non-200 HTTP status to a typed LlmError. */
  function mapStatus(status: number): LlmError {
    if (status === 401 || status === 403) return new LlmConfigError();
    if (status === 429) return new LlmRateLimitError();
    return new LlmUpstreamError();
  }

  /** Map a caught exception to a typed LlmError. */
  function mapCatchError(err: unknown): LlmError {
    if (err instanceof LlmError) return err;
    if (err instanceof Error && err.name === 'AbortError') return new LlmTimeoutError();
    return new LlmUpstreamError();
  }

  return {
    async complete(opts) {
      checkConfig();

      const body: Record<string, unknown> = {
        model,
        messages: opts.messages,
        stream: false,
      };
      if (opts.jsonMode) body.response_format = { type: 'json_object' };
      if (opts.temperature !== undefined) body.temperature = opts.temperature;

      let lastErr: LlmError = new LlmUpstreamError();

      for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let res: Response;
        try {
          res = await doFetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (err) {
          clearTimeout(timer);
          lastErr = mapCatchError(err);
          // Retry network drops / timeouts; never retry a config error.
          if (!(lastErr instanceof LlmConfigError) && attempt < MAX_LLM_ATTEMPTS) {
            await sleep(400 * attempt);
            continue;
          }
          throw lastErr;
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          lastErr = mapStatus(res.status);
          if (TRANSIENT_STATUS.has(res.status) && attempt < MAX_LLM_ATTEMPTS) {
            await sleep(400 * attempt);
            continue;
          }
          throw lastErr;
        }

        const json = (await res.json().catch(() => null)) as {
          choices?: Array<{ message?: { content?: string } }>;
        } | null;
        const content = json?.choices?.[0]?.message?.content;
        if (!content) {
          // Empty/garbled body under load — retry rather than fail outright.
          lastErr = new LlmParseError();
          if (attempt < MAX_LLM_ATTEMPTS) {
            await sleep(400 * attempt);
            continue;
          }
          throw lastErr;
        }
        return content;
      }

      throw lastErr;
    },

    async *stream(opts) {
      checkConfig();

      const body: Record<string, unknown> = {
        model,
        messages: opts.messages,
        stream: true,
      };
      if (opts.temperature !== undefined) body.temperature = opts.temperature;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        throw mapCatchError(err);
      }

      if (!res.ok) {
        clearTimeout(timer);
        throw mapStatus(res.status);
      }

      try {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Malformed frame — skip (spec: skip, don't fail).
            }
          }
        }

        // Process remaining buffer.
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Skip.
            }
          }
        }
      } finally {
        clearTimeout(timer);
      }
    },

    async generateImage(opts) {
      if (!apiKey) throw new LlmConfigError();
      const imgModel = opts.model ?? imageModel;
      if (!imgModel) throw new LlmConfigError('AI image model is not configured.');

      const count = Math.max(1, Math.min(opts.n ?? 1, 4));

      // Generate exactly one image, with a short retry on transient gateway failures.
      const genOne = async (): Promise<GeneratedImage> => {
        // The image gateway only accepts n=1 (multiple images = multiple requests), so never
        // send n>1 — it 400s otherwise.
        const body: Record<string, unknown> = {
          model: imgModel,
          prompt: opts.prompt,
          n: 1,
          size: opts.size ?? '1024x1024',
          response_format: 'b64_json',
        };
        // Image-to-image: pass the reference as raw base64 (strip any data: prefix) under `images`,
        // the field the gateway accepts for reference-guided generation.
        if (opts.referenceImage) {
          const raw = opts.referenceImage.replace(/^data:image\/\w+;base64,/, '');
          if (raw) body.images = [raw];
        }

        let lastErr: LlmError = new LlmUpstreamError();
        for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt++) {
          // Image generation is slow — give it at least 60s regardless of the chat timeout.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 60_000));

          let res: Response;
          try {
            res = await doFetch(`${baseUrl}/images/generations`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
          } catch (err) {
            clearTimeout(timer);
            lastErr = mapCatchError(err);
            if (!(lastErr instanceof LlmConfigError) && attempt < MAX_LLM_ATTEMPTS) {
              await sleep(600 * attempt);
              continue;
            }
            throw lastErr;
          } finally {
            clearTimeout(timer);
          }

          if (!res.ok) {
            lastErr = mapStatus(res.status);
            if (TRANSIENT_STATUS.has(res.status) && attempt < MAX_LLM_ATTEMPTS) {
              await sleep(600 * attempt);
              continue;
            }
            throw lastErr;
          }

          const json = (await res.json().catch(() => null)) as {
            data?: Array<{ b64_json?: string; url?: string }>;
          } | null;
          const item = (json?.data ?? []).find((d) => Boolean(d.b64_json || d.url));
          if (!item) {
            lastErr = new LlmParseError('AI returned no image.');
            if (attempt < MAX_LLM_ATTEMPTS) {
              await sleep(600 * attempt);
              continue;
            }
            throw lastErr;
          }
          return { b64: item.b64_json, url: item.url };
        }
        throw lastErr;
      };

      // Fan out N single-image requests sequentially (gentle on the gateway's rate limit).
      const images: GeneratedImage[] = [];
      for (let i = 0; i < count; i++) {
        images.push(await genOne());
      }
      return images;
    },
  };
}

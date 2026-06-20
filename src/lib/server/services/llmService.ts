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
        throw mapCatchError(err);
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) throw mapStatus(res.status);

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new LlmParseError();
      return content;
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

      const body: Record<string, unknown> = {
        model: imgModel,
        prompt: opts.prompt,
        n: opts.n ?? 1,
        size: opts.size ?? '1024x1024',
        response_format: 'b64_json',
      };

      // Image generation is slow — give it at least 60s regardless of the configured chat timeout.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 60_000));

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        throw mapCatchError(err);
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) throw mapStatus(res.status);

      const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      const items = json.data ?? [];
      const images: GeneratedImage[] = items
        .map((d) => ({ b64: d.b64_json, url: d.url }))
        .filter((d) => Boolean(d.b64 || d.url));
      if (!images.length) throw new LlmParseError('AI returned no image.');
      return images;
    },
  };
}

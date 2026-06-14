/**
 * Browser-side client for the Phase 2 LLM tools API (Engineer E1).
 *
 * Two call shapes, mirroring the backend contract (BA spec §3):
 *   - `callTool(name, input)`  → POST /api/tools/<name>  (JSON request/response)
 *   - `streamChat(messages, …)` → POST /api/tools/rankhero-ai/chat (SSE stream)
 *
 * Error handling per spec §3 / §1.4:
 *   - 401  → not authenticated: redirect to /auth/login (session expired mid-session).
 *   - 402  → INSUFFICIENT_CREDITS: returned as a typed result so the page can show the
 *            "Upgrade plan" CTA (carries `balance`). NOT thrown.
 *   - other ≥400 → `{ error, message }` returned as a typed failure (LLM_* / VALIDATION).
 *
 * On success the JSON body carries `creditsRemaining` (injected by `requireCredits`); the
 * caller is responsible for refreshing the Header credits badge via `invalidateAll()`
 * (PM decision Q4 — no Header.svelte edit).
 */
import { goto } from '$app/navigation';

export interface ToolSuccess<T> {
  ok: true;
  data: T;
  creditsRemaining: number;
}

export interface ToolFailure {
  ok: false;
  status: number;
  error: string;
  message: string;
  /** Present on 402 INSUFFICIENT_CREDITS so the UI can show the current balance. */
  balance?: number;
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * Call a JSON tool endpoint. On 401 redirects to login and never resolves (navigation
 * supersedes); otherwise resolves to a typed success/failure the page renders.
 */
export async function callTool<T>(tool: string, input: unknown): Promise<ToolResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/tools/${tool}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    // Network failure (offline / DNS / abort). Never charged — request never reached server.
    return { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };
  }

  if (res.status === 401) {
    await goto('/auth/login');
    // Returned for type-completeness; the navigation above has already taken over.
    return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Please sign in again.' };
  }

  // Parse body defensively — a 5xx may not be JSON.
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof body?.error === 'string' ? body.error : 'ERROR',
      message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
      balance: typeof body?.balance === 'number' ? body.balance : undefined,
    };
  }

  const { creditsRemaining, ...data } = (body ?? {}) as Record<string, unknown> & {
    creditsRemaining?: number;
  };

  return {
    ok: true,
    data: data as T,
    creditsRemaining: typeof creditsRemaining === 'number' ? creditsRemaining : 0,
  };
}

// --- Phase 4: jobs (tracking + rank history + async deep analysis) (Engineer E) ---
//
// These wrap the Phase 4 endpoints in `routes/jobs.ts` (Engineer F). They reuse the same
// 401→login and typed success/failure handling as `callTool`. Tracking is plan-gated and
// charges 0 credits (BR-P4-TRACK-02): a `403 TRACK_LIMIT` surfaces as a typed failure the
// page renders as an upgrade CTA — it is NOT a credit (402) failure.

export interface TrackResult {
  tracked: boolean;
  alreadyTracked: boolean;
  listingId: number;
  keyword: string;
}

/** POST /api/tools/track-listing — start tracking a listing+keyword (free, plan-gated). */
export function trackListing(input: {
  listing: string;
  keyword: string;
}): Promise<ToolResult<TrackResult>> {
  return callTool<TrackResult>('track-listing', input);
}

/** DELETE /api/tools/tracked-listings/:id — stop tracking. */
export async function untrackListing(id: number): Promise<ToolResult<{ id: number }>> {
  let res: Response;
  try {
    res = await fetch(`/api/tools/tracked-listings/${id}`, { method: 'DELETE' });
  } catch {
    return { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };
  }
  if (res.status === 401) {
    await goto('/auth/login');
    return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Please sign in again.' };
  }
  if (!res.ok) {
    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }
    return {
      ok: false,
      status: res.status,
      error: typeof body?.error === 'string' ? body.error : 'ERROR',
      message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
    };
  }
  return { ok: true, data: { id }, creditsRemaining: 0 };
}

/** One rank-history point as returned by GET /api/tools/rank-history (contract F §2). */
export interface RankPoint {
  position: number | null;  // 1-based rank; null = outside top 100
  capturedAt: number;       // epoch seconds (from rank_history.captured_at)
}

export interface RankHistoryResult {
  listingId: number;
  keyword: string;
  history: RankPoint[];
}

/**
 * GET /api/tools/rank-history?listing=&keyword= — read collected rank history (free).
 * Returns a typed success/failure; uses the same 401 redirect as `callTool`.
 */
export async function getRankHistory(
  listing: string,
  keyword: string,
): Promise<ToolResult<RankHistoryResult>> {
  const qs = new URLSearchParams({ listing, keyword }).toString();
  let res: Response;
  try {
    res = await fetch(`/api/tools/rank-history?${qs}`);
  } catch {
    return { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };
  }
  if (res.status === 401) {
    await goto('/auth/login');
    return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Please sign in again.' };
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof body?.error === 'string' ? body.error : 'ERROR',
      message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
    };
  }
  return {
    ok: true,
    data: (body ?? { history: [] }) as unknown as RankHistoryResult,
    creditsRemaining: 0,
  };
}

// --- Async deep shop analysis (producer + poll) ---

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'deferred';

export interface JobEnvelope<T> {
  jobId: string;
  status: JobStatus;
  result?: T;
  /** Present once a job reaches a terminal `done` (deduct happened); 0 on failure. */
  creditsRemaining?: number;
  /** Present when the consumer succeeded but the deduct failed (BA §2.4). */
  paymentFailed?: boolean;
}

/**
 * POST /api/tools/shop-analysis-deep — enqueue a deep analysis. Returns 202 with `{ jobId }`
 * and `status:'queued'`. NO credits deducted at enqueue (deduct-on-success, BR-P4-01); a
 * 402 here means the pre-check failed (insufficient balance) → typed failure with `balance`.
 */
export function startShopAnalysis(shop: string): Promise<ToolResult<JobEnvelope<unknown>>> {
  return callTool<JobEnvelope<unknown>>('shop-analysis-deep', { shop });
}

/**
 * Poll GET /api/tools/shop-analysis-deep/:jobId every `intervalMs` until the job reaches a
 * terminal state (`done`|`failed`) or `signal` aborts. `onTick` fires on every poll so the
 * page can show queued→running progress. Resolves with the terminal envelope (or a typed
 * failure on transport/HTTP error). 401 redirects to login.
 */
export async function pollJob<T>(
  jobId: string,
  opts: {
    onTick?: (status: JobStatus) => void;
    intervalMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ToolResult<JobEnvelope<T>>> {
  const interval = opts.intervalMs ?? 3000;
  const terminal: JobStatus[] = ['done', 'failed'];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (opts.signal?.aborted) {
      return { ok: false, status: 0, error: 'ABORTED', message: 'Polling cancelled.' };
    }

    let res: Response;
    try {
      res = await fetch(`/api/tools/shop-analysis-deep/${jobId}`, { signal: opts.signal });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, status: 0, error: 'ABORTED', message: 'Polling cancelled.' };
      }
      return { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };
    }

    if (res.status === 401) {
      await goto('/auth/login');
      return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Please sign in again.' };
    }

    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof body?.error === 'string' ? body.error : 'ERROR',
        message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
      };
    }

    const envelope = (body ?? {}) as unknown as JobEnvelope<T>;
    const status = (envelope.status ?? 'running') as JobStatus;
    opts.onTick?.(status);

    if (terminal.includes(status)) {
      return {
        ok: true,
        data: envelope,
        creditsRemaining:
          typeof envelope.creditsRemaining === 'number' ? envelope.creditsRemaining : 0,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// --- Video-generator waitlist (defer path, BR-P4-VIDEO-01) ---

/** POST /api/waitlist/video-generator — capture interest; charges 0 credits. */
export async function joinVideoWaitlist(email: string): Promise<ToolResult<{ joined: true }>> {
  let res: Response;
  try {
    res = await fetch('/api/waitlist/video-generator', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };
  }
  if (res.status === 401) {
    await goto('/auth/login');
    return { ok: false, status: 401, error: 'UNAUTHENTICATED', message: 'Please sign in again.' };
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof body?.error === 'string' ? body.error : 'ERROR',
      message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
    };
  }
  return { ok: true, data: { joined: true }, creditsRemaining: 0 };
}

// --- Streaming chat (SSE) ---

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamHandlers {
  /** Called for each text delta as it arrives (typewriter append). */
  onChunk: (delta: string) => void;
  /** Called once when the stream completes successfully (`event: done`). */
  onDone: (creditsRemaining: number) => void;
  /** Called on a mid-stream `event: error` OR a pre-stream non-OK HTTP response. */
  onError: (err: { status: number; error: string; message: string; balance?: number }) => void;
}

/**
 * Open the chat SSE stream and dispatch parsed events to the handlers.
 *
 * Pre-stream failures (402/400/503) arrive as a normal JSON HTTP response (no stream opened),
 * so we branch on `res.ok` BEFORE reading the body as a stream (spec §3.5). 401 redirects.
 *
 * Wire format (spec §3.5):
 *   data: {"delta":"..."}\n\n
 *   event: done\ndata: {"creditsRemaining": N}\n\n
 *   event: error\ndata: {"error":"...","message":"..."}\n\n
 *   data: [DONE]\n\n
 */
export async function streamChat(messages: ChatMessage[], handlers: StreamHandlers): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/tools/rankhero-ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch {
    handlers.onError({ status: 0, error: 'NETWORK', message: GENERIC_ERROR });
    return;
  }

  if (res.status === 401) {
    await goto('/auth/login');
    return;
  }

  // Pre-stream failure → JSON body, branch before streaming.
  if (!res.ok || !res.body) {
    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }
    handlers.onError({
      status: res.status,
      error: typeof body?.error === 'string' ? body.error : 'ERROR',
      message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
      balance: typeof body?.balance === 'number' ? body.balance : undefined,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (\n\n). Process complete events only.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (dispatchEvent(rawEvent, handlers)) return; // [DONE] reached
      }
    }
    // Flush any trailing event without a terminating blank line.
    if (buffer.trim()) dispatchEvent(buffer, handlers);
  } catch {
    handlers.onError({ status: 0, error: 'STREAM', message: GENERIC_ERROR });
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse one raw SSE event block (possibly multi-line `event:`/`data:`).
 * Returns true when `[DONE]` was seen (stream should stop).
 */
function dispatchEvent(rawEvent: string, handlers: StreamHandlers): boolean {
  let eventType = 'message';
  const dataLines: string[] = [];

  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  const data = dataLines.join('\n');
  if (data === '' && eventType === 'message') return false;
  if (data === '[DONE]') return true;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return false; // ignore unparseable lines (e.g. SSE comments / keep-alives)
  }

  if (eventType === 'error') {
    handlers.onError({
      status: 200,
      error: typeof parsed.error === 'string' ? parsed.error : 'LLM_ERROR',
      message: typeof parsed.message === 'string' ? parsed.message : GENERIC_ERROR,
    });
    return false;
  }

  if (eventType === 'done') {
    handlers.onDone(typeof parsed.creditsRemaining === 'number' ? parsed.creditsRemaining : 0);
    return false;
  }

  // Default `message` event → a delta.
  if (typeof parsed.delta === 'string') {
    handlers.onChunk(parsed.delta);
  }
  return false;
}

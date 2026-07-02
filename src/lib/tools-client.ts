/**
 * Browser-side client for the Phase 2 LLM tools API (Engineer E1).
 *
 * Two call shapes, mirroring the backend contract (BA spec §3):
 *   - `callTool(name, input)`  → POST /api/tools/<name>  (JSON request/response)
 *   - `streamChat(messages, …)` → POST /api/tools/assistant/chat (SSE stream)
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
 * Only a true network drop (status 0 — request never reached the server) is retried here.
 * Upstream LLM gateway errors (502/503/504) are retried server-side inside the LLM service,
 * closer to the source — retrying them again from the client would multiply latency on slow
 * failures (a 24s-then-502 call × client retries = minutes of waiting). Tool endpoints deduct
 * credits ONLY on success, so retrying a never-charged failure cannot double-bill.
 */
const RETRYABLE_STATUS = new Set([0]);
const MAX_ATTEMPTS = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call a JSON tool endpoint. On 401 redirects to login and never resolves (navigation
 * supersedes); otherwise resolves to a typed success/failure the page renders. Transient
 * network/gateway failures are retried up to {@link MAX_ATTEMPTS} times with backoff so a
 * flaky LLM upstream doesn't surface as a user-facing error on the first hiccup.
 */
export async function callTool<T>(tool: string, input: unknown): Promise<ToolResult<T>> {
  let lastFailure: ToolFailure = { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`/api/tools/${tool}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      // Network failure (offline / DNS / abort). Never charged — request never reached server.
      lastFailure = { ok: false, status: 0, error: 'NETWORK', message: GENERIC_ERROR };
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      return lastFailure;
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
      const failure: ToolFailure = {
        ok: false,
        status: res.status,
        error: typeof body?.error === 'string' ? body.error : 'ERROR',
        message: typeof body?.message === 'string' ? body.message : GENERIC_ERROR,
        balance: typeof body?.balance === 'number' ? body.balance : undefined,
      };
      // Retry only transient gateway errors; surface 4xx (credits/validation/auth) immediately.
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastFailure = failure;
        await sleep(500 * attempt);
        continue;
      }
      return failure;
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

  return lastFailure;
}

// --- Image Studio: async job-based generation (Engineer F) -------------------
//
// image-studio is async (VEO3 images can take minutes when the media server is busy). `callTool`
// submits and returns jobIds; this wrapper polls each `/image-jobs/:id` until it settles, then
// returns the finished images as asset URLs — preserving the old `{ images }` shape so callers are
// unchanged. A submit-time failure (credits/validation) is surfaced as-is (and is NOT charged).
async function pollImageJob(id: string, initialStatus: string): Promise<string> {
  if (initialStatus !== 'pending') return initialStatus;
  const deadline = Date.now() + 12 * 60 * 1000; // generous: VEO3 can be slow when busy
  while (Date.now() < deadline) {
    await sleep(3000);
    try {
      const res = await fetch(`/api/tools/image-jobs/${id}`);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status && body.status !== 'pending') return body.status;
      }
    } catch {
      // transient network blip — keep polling
    }
  }
  return 'error'; // client-side timeout (the server job may still finish + bill/refund)
}

export interface ImageQueueInfo {
  seconds: number;
  message: string | null;
}

/** URL of a finished image job's asset (R2-backed, persistent). */
export const imageJobAssetUrl = (id: string) => `/api/tools/image-jobs/${id}/asset`;

/** Poll a set of image jobs (by id) until each settles — used to RESUME a batch after a reload. */
export async function pollImageJobs(
  ids: string[]
): Promise<{ id: string; status: string; url: string | null }[]> {
  return Promise.all(
    ids.map(async (id) => {
      let initial = 'pending';
      try {
        const r = await fetch(`/api/tools/image-jobs/${id}`);
        if (r.ok) initial = ((await r.json()) as { status?: string }).status ?? 'pending';
        else if (r.status === 404) initial = 'error';
      } catch {
        /* keep going */
      }
      const status = initial === 'pending' ? await pollImageJob(id, 'pending') : initial;
      return { id, status, url: status === 'done' ? imageJobAssetUrl(id) : null };
    })
  );
}

export async function generateImages(
  input: unknown,
  opts?: {
    onQueued?: (eta: ImageQueueInfo | null, pendingCount: number) => void;
    onSubmitted?: (jobIds: string[]) => void;
  }
): Promise<ToolResult<{ images: { url: string }[] }>> {
  const submit = await callTool<{
    batchId: string;
    jobs: { id: string; status: string }[];
    eta: ImageQueueInfo | null;
  }>('image-studio', input);
  if (!submit.ok) return submit;
  const jobs = submit.data.jobs ?? [];
  // Hand the jobIds to the caller immediately so it can persist the batch (survive a reload).
  if (opts?.onSubmitted) opts.onSubmitted(jobs.map((j) => j.id));
  // Tell the UI how many images are queued on the (possibly busy) media server + the ETA, so it can
  // show "server busy, ~N min" while we keep polling.
  if (opts?.onQueued) {
    const pending = jobs.filter((j) => j.status === 'pending').length;
    opts.onQueued(submit.data.eta ?? null, pending);
  }
  const statuses = await Promise.all(jobs.map((j) => pollImageJob(j.id, j.status)));
  const images = jobs
    .filter((_, i) => statuses[i] === 'done')
    .map((j) => ({ url: `/api/tools/image-jobs/${j.id}/asset` }));
  if (images.length === 0) {
    return { ok: false, status: 502, error: 'IMAGE_FAILED', message: 'Image generation failed. Please try again.' };
  }
  return { ok: true, data: { images }, creditsRemaining: submit.creditsRemaining };
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

// --- Video Maker: AI on-video captions (cost 1) ---

/** POST /api/tools/video-captions — generate short on-video captions/CTAs from a description. */
export function generateVideoCaptions(input: {
  description: string;
  shopName?: string;
}): Promise<ToolResult<{ captions: string[] }>> {
  return callTool<{ captions: string[] }>('video-captions', input);
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
export async function streamChat(
  messages: ChatMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/tools/assistant/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch {
    // A user-initiated abort (Stop) cancels the connection → the server's stream is cancelled and
    // never reaches the post-[DONE] deduct, so the turn isn't charged. Don't surface it as an error.
    if (signal?.aborted) return;
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
    if (signal?.aborted) return; // user pressed Stop — connection cancelled, no charge, no error
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

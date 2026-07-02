/**
 * Structured request logger middleware (Phase 5 O1 — INFRA-EDGE).
 *
 * Outermost middleware in the `/api/*` chain: it wraps the whole request so `latency_ms` and
 * the final `status` are accurate, and so every downstream log shares one `request_id`.
 *
 * Emits ONE JSON line per request via the shared `logEvent` helper (observability/log.ts),
 * which Cloudflare Logs ingests. Fields (O1): request_id, user_id, path, tool, credits_delta,
 * latency_ms, status. PII/secret stripping is enforced by `logEvent`'s redaction — we never
 * pass email/token/body here regardless.
 *
 * Field sourcing:
 *   - request_id: generated here, also echoed back as `x-request-id` response header for
 *     client-side correlation and set on `c.var.requestId` for handlers/onError.
 *   - user_id:    read from `c.var.user` AFTER the chain runs (populated by requireAuth on
 *                 guarded routes; absent on public routes — that's fine).
 *   - tool:       derived from the path tail for `/api/tools/*` and tool route groups.
 *   - credits_delta / status: read post-handler from context/response.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';
import { getEnv } from '../context';
import { logEvent, newRequestId, type AnalyticsBinding } from '../../observability/log';

/** Extract a coarse tool/operation name from the request path for metrics grouping. */
function toolFromPath(path: string): string | undefined {
  // /api/tools/echo, /api/tools/llm/..., /api/tools/... → last segment after /tools/
  const m = path.match(/^\/api\/tools\/(.+)$/);
  if (m) return m[1].split('/').pop();
  // /api/llm-tools/x or /api/etsy-tools/x style (if mounted) → last segment
  return undefined;
}

/**
 * Stash the request id on the raw context under a string key. We avoid widening the shared
 * `AppEnv.Variables` type (Engineer A owns `types.ts`) by reading/writing through an untyped
 * key; `getRequestId` below is the supported accessor for `onError`.
 */
const REQUEST_ID_KEY = 'requestId';
const CREDITS_DELTA_KEY = 'creditsDelta';

/** Read the request id set by the logger middleware (for app.onError correlation). */
export function getRequestId(c: { get: (k: string) => unknown }): string | undefined {
  const v = c.get(REQUEST_ID_KEY);
  return typeof v === 'string' ? v : undefined;
}

export const logger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = newRequestId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (c as unknown as { set: (k: string, v: unknown) => void }).set(REQUEST_ID_KEY, requestId);
  c.header('x-request-id', requestId);

  const started = Date.now();
  try {
    await next();
  } finally {
    const env = getEnv(c);
    const analytics = env.ANALYTICS as AnalyticsBinding | undefined;
    const user = c.get('user');
    const creditsDeltaRaw = (c as unknown as { get: (k: string) => unknown }).get(
      CREDITS_DELTA_KEY
    );
    const creditsDelta = typeof creditsDeltaRaw === 'number' ? creditsDeltaRaw : undefined;

    logEvent(
      'info',
      {
        event: 'request',
        request_id: requestId,
        user_id: user?.id,
        path: c.req.path,
        tool: toolFromPath(c.req.path),
        credits_delta: creditsDelta,
        latency_ms: Date.now() - started,
        status: c.res.status,
        method: c.req.method,
      },
      analytics
    );
  }
});

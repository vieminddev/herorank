/**
 * Structured logging (Phase 5 O1 — INFRA-EDGE).
 *
 * `logEvent` emits one JSON line per call to `console` (Cloudflare Workers Logs ingests these).
 * Optionally writes to Analytics Engine (the `ANALYTICS` binding) for queryable metrics.
 *
 * `logError` normalizes Error/non-Error throwables into a structured error log line.
 *
 * PII/secret redaction: `logEvent` strips fields matching known PII/secret patterns
 * (email, token, password, secret, body). Callers should still avoid passing PII, but this
 * is a safety net.
 *
 * `newRequestId` generates a compact, collision-resistant per-request ID for correlation.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** The Analytics Engine binding shape (Cloudflare Workers). */
export interface AnalyticsBinding {
  writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

/** Keys that are always redacted in log output (case-insensitive match). */
const REDACT_PATTERNS = [
  /email/i,
  /password/i,
  /secret/i,
  /token/i,
  /^body$/i,
  /^auth/i,
];

function shouldRedact(key: string): boolean {
  return REDACT_PATTERNS.some((pat) => pat.test(key));
}

function redactFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (shouldRedact(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Emit a structured JSON log line + optionally write to Analytics Engine.
 *
 * @param level - severity: info | warn | error
 * @param data  - arbitrary key-value pairs (PII is auto-redacted)
 * @param analytics - optional ANALYTICS binding for queryable metrics
 */
export function logEvent(
  level: LogLevel,
  data: Record<string, unknown>,
  analytics?: AnalyticsBinding
): void {
  const redacted = redactFields(data);
  const entry = { level, ts: new Date().toISOString(), ...redacted };

  // Console output — Cloudflare Workers Logs captures these.
  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }

  // Analytics Engine — queryable metrics sink (optional binding).
  if (analytics) {
    try {
      // Index by tool (if present) for per-tool metric queries.
      const tool = typeof data.tool === 'string' ? data.tool : String(data.event ?? 'log');
      const latency = typeof data.latency_ms === 'number' ? data.latency_ms : 0;
      const creditsDelta = typeof data.credits_delta === 'number' ? data.credits_delta : 0;

      analytics.writeDataPoint({
        indexes: [tool],
        doubles: [latency, creditsDelta],
      });
    } catch {
      // Analytics write failure must never break a request.
    }
  }
}

/**
 * Log a caught error with structured context. Normalizes Error and non-Error throwables.
 *
 * @param err - the caught throwable (Error, string, or unknown)
 * @param context - optional request-scoped context (request_id, path, user_id, etc.)
 */
export function logError(
  err: unknown,
  context?: Record<string, unknown>
): void {
  let errorName: string;
  let errorMessage: string;
  let analytics: AnalyticsBinding | undefined;

  if (err instanceof Error) {
    errorName = err.name;
    errorMessage = err.message;
  } else {
    errorName = 'NonError';
    errorMessage = String(err);
  }

  // Extract ANALYTICS from context if present (don't log it as a field).
  const cleanContext: Record<string, unknown> = {};
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (key === 'ANALYTICS' && value && typeof value === 'object' && 'writeDataPoint' in value) {
        analytics = value as AnalyticsBinding;
      } else {
        cleanContext[key] = value;
      }
    }
  }

  logEvent(
    'error',
    {
      event: 'error',
      error_name: errorName,
      error_message: errorMessage,
      ...cleanContext,
    },
    analytics
  );
}

/** Generate a compact, collision-resistant request ID. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * KV-based sliding-window rate limiting (Phase 5 S2 — INFRA-EDGE).
 *
 * Reuses the existing `KV` namespace (no new binding — INFRA-EDGE does not own wrangler.jsonc).
 * Keys are namespaced under `rl:` so they never collide with the Etsy/session cache.
 *
 * ALGORITHM — fixed-size sliding window approximated by per-window counters:
 *   key = `rl:{bucket}:{identity}:{windowStart}` where windowStart = floor(now / windowMs).
 *   On each request we read the counter for the CURRENT and PREVIOUS window, then weight the
 *   previous window by how far we are into the current one (classic CF sliding-window estimate).
 *   This avoids the burst-at-window-edge problem of a naive fixed window while needing only
 *   2 KV reads + 1 write — KV is eventually consistent, which is acceptable for rate limiting
 *   (spec §7 A2). For strict guarantees use Durable Objects; KV is the v1 choice.
 *
 * On limit exceeded → caller emits 429 `{ error:'RATE_LIMITED', retryAfter }` + `Retry-After`.
 *
 * BUCKETS (auth bucket is applied in hooks.server.ts, NOT here — auth bypasses Hono, spec §8):
 *   - `llm`     per-user, tight (LLM tools cost money)        — config below
 *   - `general` per-IP, generous (all other /api/*)           — config below
 *   - `auth`    per-IP (used by hooks layer for sign-in/up)   — config below
 *
 * Thresholds are tuned for SOFT/CLOSED BETA (PM decision) — small trusted user base, so we
 * can be strict. All overridable via optional env (RATE_LIMIT_*), falling back to defaults.
 */
import { createMiddleware } from 'hono/factory';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { AppEnv } from '../types';
import type { Env } from '../../env';
import { getEnv } from '../context';

export interface RateLimitRule {
  /** Max requests permitted within `windowMs`. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export type BucketName = 'llm' | 'general' | 'auth';

/**
 * Default thresholds (soft beta). Rationale in comments — PM may relax post-launch (S2).
 *   - llm:     30 requests / hour / user  → ~one paid tool call every 2 min sustained.
 *   - general: 120 requests / minute / IP → comfortable for normal dashboard use, blocks scrapers.
 *   - auth:    10 attempts / 15 minutes / IP → anti brute-force on sign-in/sign-up.
 */
export const RATE_LIMIT_DEFAULTS: Record<BucketName, RateLimitRule> = {
  llm: { limit: 30, windowMs: 60 * 60 * 1000 },
  general: { limit: 120, windowMs: 60 * 1000 },
  auth: { limit: 10, windowMs: 15 * 60 * 1000 },
};

/** Parse a positive integer env override, else fall back to the default. */
function intOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the effective rule for a bucket, applying optional env overrides:
 *   RATE_LIMIT_LLM_PER_HOUR, RATE_LIMIT_GENERAL_PER_MIN, RATE_LIMIT_AUTH_PER_15MIN.
 */
export function resolveRule(bucket: BucketName, env: Env): RateLimitRule {
  const d = RATE_LIMIT_DEFAULTS[bucket];
  switch (bucket) {
    case 'llm':
      return { limit: intOr(env.RATE_LIMIT_LLM_PER_HOUR, d.limit), windowMs: d.windowMs };
    case 'general':
      return { limit: intOr(env.RATE_LIMIT_GENERAL_PER_MIN, d.limit), windowMs: d.windowMs };
    case 'auth':
      return { limit: intOr(env.RATE_LIMIT_AUTH_PER_15MIN, d.limit), windowMs: d.windowMs };
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the client should wait before retrying (only meaningful when !allowed). */
  retryAfter: number;
  /** Remaining quota in the current window (approximate). */
  remaining: number;
}

/**
 * Core sliding-window check against KV. Pure-ish (KV injected) so it is unit-testable with a
 * fake KV. Identity is already-namespaced (e.g. a userId or IP). Never throws — on KV error it
 * FAILS OPEN (allows the request) so a KV outage degrades to "no limiting" rather than a hard
 * outage; the error is surfaced via the returned `remaining` heuristic only.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  bucket: BucketName,
  identity: string,
  rule: RateLimitRule,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / rule.windowMs);
  const curKey = `rl:${bucket}:${identity}:${windowStart}`;
  const prevKey = `rl:${bucket}:${identity}:${windowStart - 1}`;

  try {
    const [curRaw, prevRaw] = await Promise.all([kv.get(curKey), kv.get(prevKey)]);
    const cur = curRaw ? Number.parseInt(curRaw, 10) || 0 : 0;
    const prev = prevRaw ? Number.parseInt(prevRaw, 10) || 0 : 0;

    // Weight previous window by remaining fraction of it that overlaps the sliding window.
    const elapsedInWindow = now - windowStart * rule.windowMs;
    const prevWeight = 1 - elapsedInWindow / rule.windowMs;
    const estimated = cur + prev * prevWeight;

    if (estimated >= rule.limit) {
      // Time until the current window rolls over (when the oldest weighted requests expire).
      const retryAfter = Math.max(1, Math.ceil((rule.windowMs - elapsedInWindow) / 1000));
      return { allowed: false, retryAfter, remaining: 0 };
    }

    // Count this request in the current window. TTL = 2 windows so the prev-window read works.
    const ttlSeconds = Math.ceil((rule.windowMs * 2) / 1000);
    await kv.put(curKey, String(cur + 1), { expirationTtl: ttlSeconds });

    return {
      allowed: true,
      retryAfter: 0,
      remaining: Math.max(0, rule.limit - Math.ceil(estimated) - 1),
    };
  } catch {
    // Fail open — never let a KV blip take down the API.
    return { allowed: true, retryAfter: 0, remaining: rule.limit };
  }
}

/** Best-effort client IP from Cloudflare/standard proxy headers. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Hono middleware factory. Use as a global `/api/*` guard (general bucket) and/or per-route
 * (llm bucket on tool routes). Identity strategy:
 *   - bucket `general` / `auth` → per-IP
 *   - bucket `llm`              → per-user when authenticated (requires `requireAuth` first),
 *                                 else per-IP fallback.
 *
 * Returns 429 with `Retry-After` on limit. Skips entirely if no KV binding (e.g. plain vite dev).
 */
export function rateLimit(bucket: BucketName) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const env = getEnv(c);
    const kv = env.KV;
    if (!kv) return next(); // no KV (dev) → no limiting

    const rule = resolveRule(bucket, env);

    let identity: string;
    if (bucket === 'llm') {
      const user = c.get('user');
      identity = user?.id ? `u:${user.id}` : `ip:${clientIp(c.req.raw.headers)}`;
    } else {
      identity = `ip:${clientIp(c.req.raw.headers)}`;
    }

    const result = await checkRateLimit(kv, bucket, identity, rule);
    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter));
      return c.json(
        { error: 'RATE_LIMITED', message: 'Too many requests', retryAfter: result.retryAfter },
        429
      );
    }

    await next();
  });
}

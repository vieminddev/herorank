/**
 * Unit tests for KV-based sliding-window rate limiting (Phase 5 S2, INFRA-EDGE).
 *
 * `checkRateLimit` takes an injected KV, so we run it against an in-memory fake that mirrors
 * the bits we use: `get(key)` and `put(key, value, { expirationTtl })`. No Workers runtime.
 *
 * Relative imports (not `$lib`) keep the test independent of the SvelteKit alias resolver.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  resolveRule,
  RATE_LIMIT_DEFAULTS,
  clientIp,
  type RateLimitRule,
} from '../src/lib/server/api/middleware/rateLimit';
import type { Env } from '../src/lib/server/env';

/** Minimal in-memory KV fake (string values only — that's all the limiter uses). */
function makeFakeKV() {
  const store = new Map<string, string>();
  let failNext = false;
  return {
    store,
    failOnce() {
      failNext = true;
    },
    async get(key: string): Promise<string | null> {
      if (failNext) {
        failNext = false;
        throw new Error('KV down');
      }
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    // Unused-by-limiter members so the shape is assignable where needed.
    async delete() {},
    async list() {
      return { keys: [], list_complete: true as const, cacheStatus: null };
    },
  };
}

// The limiter only calls get/put; cast through unknown to the KV type it expects.
function kvArg(fake: ReturnType<typeof makeFakeKV>) {
  return fake as unknown as Parameters<typeof checkRateLimit>[0];
}

describe('checkRateLimit (sliding window)', () => {
  const rule: RateLimitRule = { limit: 3, windowMs: 60_000 };
  let kv: ReturnType<typeof makeFakeKV>;

  beforeEach(() => {
    kv = makeFakeKV();
  });

  it('allows requests up to the limit, then blocks with Retry-After', async () => {
    const now = 1_000_000_000_000; // fixed window start so prev-window weight is irrelevant
    const r1 = await checkRateLimit(kvArg(kv), 'general', 'ip:1.1.1.1', rule, now);
    const r2 = await checkRateLimit(kvArg(kv), 'general', 'ip:1.1.1.1', rule, now);
    const r3 = await checkRateLimit(kvArg(kv), 'general', 'ip:1.1.1.1', rule, now);
    const r4 = await checkRateLimit(kvArg(kv), 'general', 'ip:1.1.1.1', rule, now);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfter).toBeGreaterThan(0);
    expect(r4.remaining).toBe(0);
  });

  it('isolates identities (per-IP / per-user buckets do not bleed)', async () => {
    const now = 1_000_000_000_000;
    await checkRateLimit(kvArg(kv), 'general', 'ip:a', rule, now);
    await checkRateLimit(kvArg(kv), 'general', 'ip:a', rule, now);
    await checkRateLimit(kvArg(kv), 'general', 'ip:a', rule, now);
    const blockedA = await checkRateLimit(kvArg(kv), 'general', 'ip:a', rule, now);
    const freshB = await checkRateLimit(kvArg(kv), 'general', 'ip:b', rule, now);

    expect(blockedA.allowed).toBe(false);
    expect(freshB.allowed).toBe(true);
  });

  it('isolates buckets (llm vs general for the same identity)', async () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit(kvArg(kv), 'general', 'ip:x', rule, now);
    const generalBlocked = await checkRateLimit(kvArg(kv), 'general', 'ip:x', rule, now);
    const llmStillOpen = await checkRateLimit(kvArg(kv), 'llm', 'ip:x', rule, now);

    expect(generalBlocked.allowed).toBe(false);
    expect(llmStillOpen.allowed).toBe(true);
  });

  it('resets once the window rolls over', async () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) await checkRateLimit(kvArg(kv), 'general', 'ip:t', rule, now);
    const blocked = await checkRateLimit(kvArg(kv), 'general', 'ip:t', rule, now);
    expect(blocked.allowed).toBe(false);

    // Jump two full windows ahead — both current and previous counters are gone.
    const later = now + rule.windowMs * 2;
    const allowedAgain = await checkRateLimit(kvArg(kv), 'general', 'ip:t', rule, later);
    expect(allowedAgain.allowed).toBe(true);
  });

  it('writes the counter key with a TTL key under the rl: namespace', async () => {
    const now = 1_000_000_000_000;
    await checkRateLimit(kvArg(kv), 'auth', 'ip:9.9.9.9', rule, now);
    const keys = [...kv.store.keys()];
    expect(keys.some((k) => k.startsWith('rl:auth:ip:9.9.9.9:'))).toBe(true);
  });

  it('fails OPEN when KV throws (availability over strictness)', async () => {
    kv.failOnce();
    const r = await checkRateLimit(kvArg(kv), 'general', 'ip:err', rule);
    expect(r.allowed).toBe(true);
  });
});

describe('resolveRule (env overrides)', () => {
  const baseEnv = {} as Env;

  it('falls back to soft-beta defaults with no overrides', () => {
    expect(resolveRule('llm', baseEnv)).toEqual(RATE_LIMIT_DEFAULTS.llm);
    expect(resolveRule('general', baseEnv)).toEqual(RATE_LIMIT_DEFAULTS.general);
    expect(resolveRule('auth', baseEnv)).toEqual(RATE_LIMIT_DEFAULTS.auth);
  });

  it('applies a valid env override but keeps the window', () => {
    const env = { RATE_LIMIT_LLM_PER_HOUR: '5' } as unknown as Env;
    const rule = resolveRule('llm', env);
    expect(rule.limit).toBe(5);
    expect(rule.windowMs).toBe(RATE_LIMIT_DEFAULTS.llm.windowMs);
  });

  it('ignores invalid overrides (non-positive / NaN) and uses the default', () => {
    const env = { RATE_LIMIT_GENERAL_PER_MIN: '-1' } as unknown as Env;
    expect(resolveRule('general', env).limit).toBe(RATE_LIMIT_DEFAULTS.general.limit);
  });
});

describe('clientIp', () => {
  it('prefers cf-connecting-ip', () => {
    const h = new Headers({ 'cf-connecting-ip': '5.5.5.5', 'x-forwarded-for': '1.1.1.1' });
    expect(clientIp(h)).toBe('5.5.5.5');
  });

  it('falls back to the first x-forwarded-for hop', () => {
    const h = new Headers({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' });
    expect(clientIp(h)).toBe('2.2.2.2');
  });

  it('returns "unknown" with no proxy headers', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

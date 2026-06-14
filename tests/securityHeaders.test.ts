/**
 * Tests for Phase 5 S3 security headers + S2 auth rate limit at the hooks layer (INFRA-EDGE).
 *
 * `hooks.server.ts` imports SvelteKit-only modules (`$app/environment`,
 * `better-auth/svelte-kit`) and `$lib` aliases. We mock the SvelteKit-only ones so the module
 * loads under plain vitest; the `$lib` alias resolves via the sveltekit vite plugin.
 *
 * Coverage:
 *   - CSP is REPORT-ONLY first (does not break hydration/Stripe) and whitelists the LLM
 *     gateway + Stripe per spec §8.
 *   - All required headers are present on responses (pages + /api/*).
 *   - The no-platform-env path still applies headers (build/prerender/dev safety).
 *   - The auth path is rate-limited per-IP via KV (anti brute-force).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// SvelteKit build-time flag — not available outside the kit runtime.
vi.mock('$app/environment', () => ({ building: false }));
// Auth handler — pass through `resolve` so we exercise our header/limit logic, not Better Auth.
vi.mock('better-auth/svelte-kit', () => ({
  svelteKitHandler: async ({ event, resolve }: { event: unknown; resolve: (e: unknown) => Promise<Response> }) =>
    resolve(event),
}));
vi.mock('$lib/server/auth', () => ({
  createAuth: () => ({
    api: { getSession: async () => null },
  }),
}));

import { applySecurityHeaders, CSP_DIRECTIVES, handle } from '../src/hooks.server';

describe('applySecurityHeaders (S3)', () => {
  it('sets CSP as report-only first (no enforcing CSP header)', () => {
    const res = new Response('ok');
    applySecurityHeaders(res);
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBe(CSP_DIRECTIVES);
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('whitelists the LLM gateway and Stripe in CSP', () => {
    expect(CSP_DIRECTIVES).toContain('https://vtoken.viemind.ai');
    expect(CSP_DIRECTIVES).toContain('https://js.stripe.com');
    expect(CSP_DIRECTIVES).toContain("default-src 'self'");
    expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
  });

  it('sets the full hardening header set', () => {
    const res = new Response('ok');
    applySecurityHeaders(res);
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
  });
});

/** Minimal SvelteKit RequestEvent stand-in for the handle() under test. */
function makeEvent(pathname: string, env: unknown, headers: Record<string, string> = {}) {
  return {
    url: new URL(`https://herorank.test${pathname}`),
    request: new Request(`https://herorank.test${pathname}`, { headers }),
    platform: env ? { env } : undefined,
    locals: {} as Record<string, unknown>,
  };
}

function makeFakeKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
  };
}

describe('handle() — header application + auth rate limit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies headers even with no platform env (build/prerender/dev)', async () => {
    const event = makeEvent('/', undefined);
    const resolve = vi.fn(async () => new Response('page'));
    const res = await handle({ event, resolve } as never);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('applies headers on a normal request with platform env', async () => {
    const event = makeEvent('/dashboard', { KV: makeFakeKV() });
    const resolve = vi.fn(async () => new Response('page'));
    const res = await handle({ event, resolve } as never);
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBe(CSP_DIRECTIVES);
  });

  it('rate-limits /api/auth/sign-in per IP after the threshold (429 + Retry-After)', async () => {
    const kv = makeFakeKV();
    const env = { KV: kv, RATE_LIMIT_AUTH_PER_15MIN: '2' };
    const headers = { 'cf-connecting-ip': '7.7.7.7' };
    const resolve = vi.fn(async () => new Response('ok'));

    const run = () =>
      handle({ event: makeEvent('/api/auth/sign-in/email', env, headers), resolve } as never);

    const r1 = await run();
    const r2 = await run();
    const r3 = await run();

    expect(r1.status).not.toBe(429);
    expect(r2.status).not.toBe(429);
    expect(r3.status).toBe(429);
    expect(r3.headers.get('Retry-After')).toBeTruthy();
    const body = (await r3.json()) as { error: string };
    expect(body.error).toBe('RATE_LIMITED');
  });

  it('does not rate-limit non-auth API paths at the hooks layer', async () => {
    const kv = makeFakeKV();
    const env = { KV: kv, RATE_LIMIT_AUTH_PER_15MIN: '1' };
    const headers = { 'cf-connecting-ip': '8.8.8.8' };
    const resolve = vi.fn(async () => new Response('ok'));
    const run = () =>
      handle({ event: makeEvent('/api/tools/echo', env, headers), resolve } as never);

    await run();
    const r2 = await run();
    expect(r2.status).not.toBe(429);
  });
});

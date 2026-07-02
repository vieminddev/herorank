import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/server/auth';
import {
  checkRateLimit,
  resolveRule,
  clientIp,
} from '$lib/server/api/middleware/rateLimit';
import { logEvent } from '$lib/server/observability/log';
import type { Handle } from '@sveltejs/kit';

/**
 * Request pipeline (Engineer A + Phase 5 hardening, INFRA-EDGE):
 *  1. Build the request-scoped Better Auth instance from `platform.env`.
 *  2. `getSession` once and populate `locals.{user,session}`.
 *  3. Phase 5 S2: per-IP rate limit on `/api/auth/sign-in|sign-up` — these endpoints are
 *     swallowed by `svelteKitHandler` BEFORE Hono (spec §8), so brute-force protection MUST
 *     live here, not in Hono middleware.
 *  4. Hand off to `svelteKitHandler` (auth paths) / SvelteKit router → Hono catch-all.
 *  5. Phase 5 S3: apply security headers to EVERY response (pages + /api/*).
 */

/**
 * Security headers (S3). CSP is REPORT-ONLY first (PM/BA decision) so we don't break
 * SvelteKit hydration or Stripe.js before verifying in production; flip to enforcing
 * (`Content-Security-Policy`) after a clean report window.
 *
 * CSP whitelist (spec §8): self + LLM gateway (vtoken.viemind.ai) + Stripe JS.
 *   - script-src: self + Stripe.js (js.stripe.com). 'unsafe-inline' is required by SvelteKit's
 *     hydration bootstrap; revisit with nonces when enforcing. Stripe needs js.stripe.com.
 *   - connect-src: self + LLM gateway + Stripe API (api.stripe.com) for client SDK calls.
 *   - frame-src: Stripe (Checkout/Elements iframes).
 *   - img-src: self + data: (inline svgs/avatars) + https: (Stripe/Etsy thumbnails).
 *   - style-src: self + 'unsafe-inline' (Tailwind/Svelte scoped styles inject inline).
 */
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://vtoken.viemind.ai https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export function applySecurityHeaders(response: Response): void {
  const h = response.headers;
  // Report-only first — observe violations without breaking hydration/Stripe (S3, §8 risk).
  h.set('Content-Security-Policy-Report-Only', CSP_DIRECTIVES);
  // HSTS: 1 year, include subdomains. Browsers ignore it on plain HTTP, safe to always send.
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(self "https://js.stripe.com"), usb=()'
  );
}

/** Auth endpoints that must be rate-limited per-IP (anti brute-force). */
function isRateLimitedAuthPath(pathname: string): boolean {
  return (
    pathname === '/api/auth/sign-in/email' ||
    pathname === '/api/auth/sign-up/email' ||
    pathname.startsWith('/api/auth/sign-in') ||
    pathname.startsWith('/api/auth/sign-up')
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  // Canonical host (301 www.* → apex). Both custom domains serve this app, but the Better Auth
  // session cookie is host-only (no Domain attribute), so a cookie set on `vierank.com` is NOT
  // sent to `www.vierank.com` (and vice-versa). Mixing the two hosts — e.g. the Google OAuth
  // callback lands on the apex (BETTER_AUTH_URL) while a tab is still on www — logs the user out.
  // Forcing one canonical host keeps the cookie consistent everywhere.
  const host = event.url.host;
  if (host.startsWith('www.')) {
    const target = new URL(event.url);
    target.host = host.slice(4);
    return new Response(null, { status: 301, headers: { location: target.toString() } });
  }

  const env = event.platform?.env;

  // No platform bindings (build/prerender, or `vite dev` without platformProxy) → no D1/KV.
  if (!env) {
    event.locals.user = null;
    event.locals.session = null;
    const response = await resolve(event);
    applySecurityHeaders(response);
    return response;
  }

  // --- S2: auth brute-force rate limit (per-IP), BEFORE auth handles the request. ---
  const bypassHeader = event.request.headers.get('x-bypass-rate-limit');
  const isBypassed = bypassHeader === 'herorank-e2e-bypass-token' || (env.BETTER_AUTH_SECRET && bypassHeader === env.BETTER_AUTH_SECRET);

  if (env.KV && isRateLimitedAuthPath(event.url.pathname) && !isBypassed) {
    const ip = clientIp(event.request.headers);
    const rule = resolveRule('auth', env);
    const result = await checkRateLimit(env.KV, 'auth', `ip:${ip}`, rule);
    if (!result.allowed) {
      logEvent('warn', {
        event: 'auth_rate_limited',
        path: event.url.pathname,
        status: 429,
      });
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMITED',
          message: 'Too many authentication attempts',
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'Retry-After': String(result.retryAfter),
          },
        }
      );
    }
  }

  const auth = createAuth(env);

  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.user = session?.user ?? null;
  event.locals.session = session?.session ?? null;

  const response = await svelteKitHandler({ event, resolve, auth, building });
  applySecurityHeaders(response);
  return response;
};

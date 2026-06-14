/**
 * OAuth provider seam (Engineer H) — "plug the keystring into env and it runs" (BR-P4-OAUTH-05).
 *
 * Mirrors Phase 3's `services/etsy/provider.ts`. With NO `env.ETSY_OAUTH_CLIENT_ID` →
 * the MOCK OAuth client (dev/test path TODAY). With a keystring + redirect URI → the real
 * `fetch`-backed client. Routes + the calibration job call `getEtsyOAuth(env)` and are identical
 * on both paths.
 */
import type { Env } from '../../env';
import {
  createEtsyOAuthClient,
  type EtsyOAuthClient,
  type FetchImpl,
} from './etsyOAuth';
import { createMockOAuthClient } from './mockOAuth';

/** True when a real Etsy OAuth keystring + redirect URI are configured. */
export function hasOAuthKey(env: Env): boolean {
  return !!env.ETSY_OAUTH_CLIENT_ID && !!env.ETSY_OAUTH_REDIRECT_URI;
}

/**
 * Resolve the OAuth client. `fetchImpl` override lets tests inject a stubbed fetch even on the
 * real path (so the real exchange/refresh code is exercised without hitting Etsy).
 */
export function getEtsyOAuth(env: Env, opts?: { fetchImpl?: FetchImpl }): EtsyOAuthClient {
  if (!hasOAuthKey(env)) return createMockOAuthClient();
  return createEtsyOAuthClient({
    clientId: env.ETSY_OAUTH_CLIENT_ID!,
    redirectUri: env.ETSY_OAUTH_REDIRECT_URI!,
    fetchImpl: opts?.fetchImpl,
  });
}

/** Whether the OAuth flow is running against the mock (used by routes to short-circuit the redirect). */
export function isMockOAuth(env: Env): boolean {
  return !hasOAuthKey(env);
}

// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Env } from '$lib/server/env';
import type { Auth } from '$lib/server/auth';

// Better Auth session/user shapes, inferred from the configured instance so they stay
// in sync with the auth config (no hand-maintained duplicate types).
type GetSession = Awaited<ReturnType<Auth['api']['getSession']>>;
type SessionUser = NonNullable<GetSession>['user'];
type SessionData = NonNullable<GetSession>['session'];

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: SessionUser | null;
      session: SessionData | null;
    }
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env: Env;
      // Cloudflare execution context (provided by adapter-cloudflare / platformProxy).
      context?: { waitUntil(promise: Promise<unknown>): void };
      caches?: CacheStorage & { default: Cache };
    }
  }
}

export {};

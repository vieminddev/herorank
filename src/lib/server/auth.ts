/**
 * Better Auth configuration (Engineer A).
 *
 * Why a factory instead of a module-level singleton:
 *   On Cloudflare Workers the D1 binding (`env.DB`) only exists inside a request
 *   context, so `betterAuth({ database: env.DB })` cannot be evaluated at module load.
 *   `createAuth(env)` builds (and caches per distinct `env` object) a Better Auth
 *   instance for the current request.
 *
 * D1 wiring:
 *   Better Auth 1.6 has a BUILT-IN Cloudflare D1 path in `@better-auth/kysely-adapter`:
 *   passing the raw `D1Database` binding (which exposes `batch`/`exec`/`prepare`) makes
 *   it construct its internal `D1SqliteDialect`. No `kysely-d1` wiring and NO
 *   `CamelCasePlugin` is used (per spec risk note / discussion #7487) — schema columns
 *   stay camelCase exactly as the CLI generates them.
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import type { Env } from './env';
import { getCreditsService } from './services/provider';

function resolveBaseURL(env: Env): string | undefined {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  // Derive from the active request when available (works in dev + Workers).
  try {
    return new URL(getRequestEvent().request.url).origin;
  } catch {
    return undefined;
  }
}

function buildAuth(env: Env) {
  const baseURL = resolveBaseURL(env);

  const options = {
    // Raw D1 binding → built-in D1SqliteDialect (see file header). Cast through the
    // adapter's accepted database union (workers-types D1Database is structurally the
    // same `batch`/`exec`/`prepare` interface the adapter detects).
    database: env.DB as unknown as BetterAuthOptions['database'],
    // Perf (Phase 5): store sessions in KV instead of D1. The hot path — `getSession`
    // on every request via hooks.server.ts — then reads KV (in-region, ~5ms) instead of
    // the single-region D1 (cross-region ~300ms). User/account rows stay in D1.
    // KV is eventually consistent: a sign-out may still validate for up to ~60s at a
    // far colo; acceptable here. KV expirationTtl must be >= 60s.
    secondaryStorage: {
      get: async (key) => (await env.KV.get(`ba:${key}`)) ?? null,
      set: async (key, value, ttl) => {
        await env.KV.put(`ba:${key}`, value, ttl && ttl >= 60 ? { expirationTtl: ttl } : undefined);
      },
      delete: async (key) => {
        await env.KV.delete(`ba:${key}`);
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8, // BR-001
      autoSignIn: true, // A3: no email verification in Phase 1
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days (BR-012)
      updateAge: 60 * 60 * 24, // refresh when <1 day remains
    },
    trustedOrigins: baseURL ? [baseURL] : [],
    rateLimit: {
      enabled: false,
      customRules: {
        "/sign-up/email": false,
        "/sign-in/email": false,
      },
    },
    // socialProviders.google → Phase 2 (BR-015: UI shows "coming soon").
    databaseHooks: {
      user: {
        create: {
          // BR-002: every new user gets the free plan's 30 credits on signup.
          after: async (user: { id: string }) => {
            const credits = await getCreditsService(env.DB);
            await credits.grantPlanCredits(user.id, 'free');
          },
        },
      },
    },
    plugins: [sveltekitCookies(getRequestEvent)],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

/** Canonical Better Auth instance type for this app (inferred from the real config). */
export type Auth = ReturnType<typeof buildAuth>;

/** Cache one Better Auth instance per distinct env object (≈ per worker isolate). */
const cache = new WeakMap<Env, Auth>();

export function createAuth(env: Env): Auth {
  const cached = cache.get(env);
  if (cached) return cached;
  const auth = buildAuth(env);
  cache.set(env, auth);
  return auth;
}

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
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { getRequestEvent } from '$app/server';
import type { Env } from './env';
import { getCreditsService } from './services/provider';
import { isEmailConfigured, sendEmail, resetPasswordEmail, verifyEmail } from './services/email';
import { isDisposableEmail } from './services/disposableEmail';

/**
 * Force the post-action `callbackURL` on a Better Auth email link to a fixed path.
 * Better Auth defaults the verification link's callbackURL to `/` (the marketing page),
 * which lands users on a screen with no feedback. We send them to a friendly confirmation
 * page that detects the (auto-sign-in) session and routes them to the app or to login.
 */
function withCallbackURL(url: string, callback: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('callbackURL', callback);
    return u.toString();
  } catch {
    return url;
  }
}

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
  // Email-dependent flows only activate once Resend is configured. Crucially, email verification is
  // ONLY enforced when we can actually send the verification mail — otherwise new accounts could
  // never verify and would be locked out.
  const emailReady = isEmailConfigured(env);
  const googleReady = !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;

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
      autoSignIn: true,
      // Enforce verification only when email can be sent (see emailReady note above).
      requireEmailVerification: emailReady,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        const mail = resetPasswordEmail(url);
        await sendEmail(env, { to: user.email, ...mail });
      },
    },
    // Email verification — sends on sign-up and auto-signs-in once verified. No-op when email isn't
    // configured (sendEmail logs + returns false), and requireEmailVerification stays false there.
    emailVerification: {
      sendOnSignUp: emailReady,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        // Land on a confirmation page (not the marketing `/`) that reports success + routes the user.
        const mail = verifyEmail(withCallbackURL(url, '/auth/verified'));
        await sendEmail(env, { to: user.email, ...mail });
      },
    },
    // Google social login — only registered when both creds exist (button is hidden otherwise).
    ...(googleReady
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID as string,
              clientSecret: env.GOOGLE_CLIENT_SECRET as string,
            },
          },
        }
      : {}),
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
    // Reject sign-ups for an email that already has an account with a CLEAR error.
    // Better Auth's default anti-enumeration behaviour returns a misleading generic 200
    // (and the DB's UNIQUE(email) constraint then silently no-ops the insert), so the
    // signup UI wrongly shows "check your inbox". A SaaS should tell the user plainly to
    // sign in instead — this runs before Better Auth's own create logic.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return;
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim() : '';
        if (!email) return;
        const existing = await env.DB.prepare(
          'SELECT 1 FROM user WHERE lower(email) = lower(?) LIMIT 1'
        )
          .bind(email)
          .first();
        if (existing) {
          throw new APIError('UNPROCESSABLE_ENTITY', {
            message: 'An account with this email already exists. Please sign in instead.',
          });
        }
      }),
    },
    // socialProviders.google → Phase 2 (BR-015: UI shows "coming soon").
    databaseHooks: {
      user: {
        create: {
          // Reject throwaway / temp-mail signups (free-credit farming) BEFORE the row is created.
          before: async (user: { email?: string }) => {
            if (user.email && isDisposableEmail(user.email)) {
              throw new APIError('BAD_REQUEST', {
                message: 'Please use a permanent email address — temporary inboxes are not allowed.',
              });
            }
            return { data: user };
          },
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

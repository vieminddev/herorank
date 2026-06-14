/**
 * Better Auth config used ONLY by `@better-auth/cli generate` (npm run auth:generate).
 *
 * Why a separate config: the CLI runs outside SvelteKit + outside the Workers request
 * scope, so it cannot use `$app/server`'s `getRequestEvent()` nor the request-scoped D1
 * binding. The CLI only needs a config whose *options* (emailAndPassword, session, etc.)
 * match the real one so the generated SQL is identical. It introspects schema from a
 * local better-sqlite3 file; that DB is throwaway — only the emitted SQL matters.
 *
 * Keep the auth-relevant options here in sync with `auth.ts`. Run:
 *   npm run auth:generate   →  writes migrations/0001_better_auth.sql
 *
 * NOTE: this file is intentionally excluded from the Workers bundle (Node-only deps).
 */
import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';

export const auth = betterAuth({
  database: new Database(':memory:'),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
});

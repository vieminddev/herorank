/**
 * Better Auth browser client (Engineer A).
 *
 * Consumed by FE pages (login/signup → Eng B, Header sign-out → Eng C). The client
 * talks to the auth handler mounted at `/api/auth/*`; using a relative baseURL means it
 * targets the same origin the app is served from (dev + prod).
 */
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
  // Same-origin: auth routes are mounted under /api/auth on this app.
  basePath: '/api/auth',
});

export const { signIn, signUp, signOut, useSession } = authClient;

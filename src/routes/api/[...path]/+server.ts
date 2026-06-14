/**
 * SvelteKit → Hono catch-all bridge (Engineer A).
 *
 * Delegates ALL `/api/*` requests to the Hono app. SvelteKit's catch-all
 * `[...path]/+server.ts` captures every method; we forward to `app.fetch`.
 *
 * The Hono app receives the original Request and Cloudflare env (via platform.env),
 * so middleware like `withDb` / `requireAuth` work as if Hono was the Worker entry.
 */
import type { RequestHandler } from '@sveltejs/kit';
import app from '$lib/server/api/app';

const handler: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env ?? {};
  return app.fetch(request, env);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

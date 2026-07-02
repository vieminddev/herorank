/**
 * Vitest stub for SvelteKit's virtual `$app/server` module (aliased in vitest.config.ts).
 * `getRequestEvent()` throws when there is no active request — exactly what the real module does
 * outside a request scope — so `auth.ts`'s try/catch around it falls back to its default base URL.
 */
export function getRequestEvent(): never {
  throw new Error('getRequestEvent() is not available outside a request (test stub).');
}

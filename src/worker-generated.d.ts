/**
 * Ambient type for the adapter-generated worker (Engineer A, Phase 4).
 *
 * `@sveltejs/adapter-cloudflare` emits `.svelte-kit/server-worker/index.js` ONLY at
 * build time (`vite build`, path = `main` in wrangler.adapter.jsonc). `src/worker.ts`
 * imports it and re-exports its `fetch`, but the file is
 * absent during `svelte-check` / type-check. This ambient module declaration lets
 * the import type-check pre-build (the runtime import resolves after the adapter runs).
 *
 * The default export's `fetch` is typed permissively (Request/Response as the
 * structural Web types via `any` request, `Promise<Response>` return) on purpose:
 * the project's lib includes BOTH the DOM lib AND `@cloudflare/workers-types`, whose
 * `Request`/`Response` globals diverge (e.g. `Headers.getSetCookie` vs `getAll`).
 * Pinning a concrete library's types here would create a false DOM-vs-CF mismatch at
 * the delegation site. The real handler contract is still enforced by
 * `satisfies ExportedHandler<Env>` in src/worker.ts.
 */
declare module '*/.svelte-kit/server-worker/index.js' {
  const worker: {
    fetch(request: Request, env: unknown, ctx: ExecutionContext): Response | Promise<Response>;
  };
  export default worker;
}

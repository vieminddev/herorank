import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Phase 4 (Engineer A): migrated off legacy Cloudflare Pages → Workers
    // Static-Assets mode so the deploy can run Cron Triggers + a Queue consumer
    // (Pages supports neither). The adapter reads `wrangler.adapter.jsonc`
    // (which has NO `main`) and emits its SSR worker to
    // `.svelte-kit/cloudflare/_worker.js`. Our custom entry `src/worker.ts`
    // (the `main` in the real `wrangler.jsonc`) imports that generated worker,
    // re-exports `fetch`, and adds `scheduled` + `queue`. See wrangler.adapter.jsonc.
    adapter: adapter({
      // Build-time: adapter reads the minimal adapter-only config (no `main`)
      // and emits .svelte-kit/cloudflare/_worker.js.
      config: 'wrangler.adapter.jsonc',
      // Dev/preview: getPlatformProxy must read the REAL wrangler.jsonc so D1/KV
      // (and the new ANALYSIS_QUEUE) bindings are emulated for `vite dev`.
      platformProxy: {
        configPath: 'wrangler.jsonc'
      }
    })
  }
};

export default config;

import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Local dev runs on :3001 so it matches the Etsy app's registered OAuth redirect URI
  // (http://localhost:3001/). In production the redirect URI is the proper
  // /api/connect/etsy/callback route — src/routes/+page.server.ts forwards the local
  // root-path callback (/?code=&state=) to it.
  server: { port: 3001, strictPort: true },
  // better-auth dynamically imports @opentelemetry/api at runtime and gracefully
  // falls back to a noop implementation when it's absent. Keeping this as a true
  // dynamic import (rather than letting Vite bundle it into a stub core.js) ensures
  // the catch() path fires correctly on Cloudflare Workers.
  ssr: {
    external: ['@opentelemetry/api']
  }
});

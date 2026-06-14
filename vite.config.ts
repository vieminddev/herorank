import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // better-auth dynamically imports @opentelemetry/api at runtime and gracefully
  // falls back to a noop implementation when it's absent. Keeping this as a true
  // dynamic import (rather than letting Vite bundle it into a stub core.js) ensures
  // the catch() path fires correctly on Cloudflare Workers.
  ssr: {
    external: ['@opentelemetry/api']
  }
});

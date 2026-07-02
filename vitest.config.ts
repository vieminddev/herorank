import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib'),
      // SvelteKit virtual modules aren't available under vitest — stub the ones src imports so
      // server modules (auth.ts → $app/server, hooks → $app/environment) load in tests.
      '$app/server': path.resolve('./tests/mocks/app-server.ts'),
      '$app/environment': path.resolve('./tests/mocks/app-environment.ts'),
      '$app/navigation': path.resolve('./tests/mocks/app-navigation.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

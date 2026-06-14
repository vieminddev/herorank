/**
 * Playwright E2E configuration (Phase 5 T1 — QA).
 *
 * STATUS: SKIP-IN-CI-UNTIL-BROWSER
 * These tests require a browser binary and a running wrangler dev server.
 * They are NOT included in the vitest/CI gate — run them locally with:
 *
 *   npm run e2e
 *
 * which expands to:
 *   1. `wrangler dev --local` in one terminal (or via the --webServer option below),
 *   2. `npx playwright test` in another.
 *
 * The webServer option below automates step 1 when running `npx playwright test` directly.
 * Set PLAYWRIGHT_BASE_URL in the environment to override (useful for production smoke tests).
 *
 * Install browsers once:
 *   npx playwright install chromium
 *
 * To run:
 *   npx playwright test                    # headless
 *   npx playwright test --headed           # headed (visual)
 *   npx playwright test --ui               # interactive trace viewer
 *   npx playwright show-report             # view last report
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8787';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',

  /* Run tests in files sequentially — E2E tests share auth state via fixtures. */
  fullyParallel: false,
  /* Fail the build on CI if test.only was left in the source. */
  forbidOnly: !!process.env.CI,
  /* Retry twice on CI for flakiness tolerance. */
  retries: process.env.CI ? 2 : 0,
  /* Single worker for sequential state management. */
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    /* Ensure no auth cookies leak between test runs. */
    storageState: undefined,
    /* Fast viewport for dashboard tools. */
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'x-bypass-rate-limit': 'herorank-e2e-bypass-token',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start wrangler dev automatically when running locally (not on CI — CI should start it separately). */
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: 'wrangler dev --local',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 30_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            BETTER_AUTH_URL: BASE_URL,
          },
        },
      }),
});

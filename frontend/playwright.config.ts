import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the VFS Bot frontend.
 * Run against a locally running stack: `npm run dev` (port 3000) + backend (port 4000).
 *
 * Usage:
 *   npx playwright test                    # run all specs
 *   npx playwright test tests/e2e/login    # single file
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,          // avoid race conditions against shared test DB
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  // Auth state is stored here (relative to frontend/)
  // Run `npx playwright test tests/e2e/login.spec.ts` first to generate it.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

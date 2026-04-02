/**
 * Shared auth fixture for E2E tests.
 *
 * Logs in once and stores auth state in a file so subsequent tests
 * can reuse the session without a full login round-trip.
 */
import { test as base, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Stored relative to the playwright.config.ts location (frontend/)
const AUTH_STATE_PATH = path.join(__dirname, '../../.auth/admin.json');

export const ADMIN_EMAIL = 'admin@test.com';
export const ADMIN_PASSWORD = 'AdminPass123!';

/**
 * Log in programmatically via the login form and persist auth state to disk.
 * Call this once in `beforeAll` for suites that need an authenticated browser.
 */
export async function loginAndSaveState(page: Page): Promise<void> {
  await page.goto('/login');

  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait until navigation to dashboard completes
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // Ensure the .auth directory exists
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
}

/** Playwright test fixture extended with authenticated page */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ browser }, use) => {
    // Re-use stored auth state if it exists; otherwise skip storage state
    const contextOptions = fs.existsSync(AUTH_STATE_PATH)
      ? { storageState: AUTH_STATE_PATH }
      : {};
    const ctx = await browser.newContext(contextOptions);
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';

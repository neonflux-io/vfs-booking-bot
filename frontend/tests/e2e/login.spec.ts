/**
 * E2E — Login page
 *
 * Verifies:
 * - Valid credentials → redirect to /dashboard
 * - Wrong password → error message shown
 * - Empty form submit → HTML5 validation prevents submit (no request)
 * - Unauthenticated access to /dashboard redirects to /login
 */
import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test('valid credentials redirect to /dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'admin@test.com');
    await page.fill('#password', 'AdminPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test('wrong password shows error message', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'admin@test.com');
    await page.fill('#password', 'WrongPassword!');
    await page.click('button[type="submit"]');

    // Error div contains text from API
    const errorDiv = page.locator('[class*="red"]').first();
    await expect(errorDiv).toBeVisible({ timeout: 8_000 });
    await expect(errorDiv).toContainText(/invalid|credentials|password/i);
  });

  test('empty email field prevents form submission (HTML5 required)', async ({ page }) => {
    await page.goto('/login');

    // Fill only password — email is required
    await page.fill('#password', 'SomePassword');
    await page.click('button[type="submit"]');

    // Should still be on /login (no navigation)
    await expect(page).toHaveURL(/\/login/);
    // Browser native validation prevents submit; no API call fired
  });

  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    // Go directly without auth
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('unauthenticated access to /profiles redirects to /login', async ({ page }) => {
    await page.goto('/profiles');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

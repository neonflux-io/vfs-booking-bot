/**
 * E2E — Dashboard page
 *
 * Verifies:
 * - All three metric cards are visible (Active Monitors, Slots Detected, Last Booking)
 * - Live Activity Feed panel is visible
 * - Active Targets panel is visible
 * - System health indicators visible
 */
import { test, expect } from '@playwright/test';
import { loginAndSaveState } from './fixtures/auth';

test.describe('Dashboard page', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAndSaveState(page);
    await page.close();
  });

  test.use({
    storageState: '.auth/admin.json',
  });

  test('renders the three core metric cards', async ({ page }) => {
    await page.goto('/dashboard');

    // MetricCard labels are rendered as text — check for each
    await expect(page.getByText('Active Monitors')).toBeVisible();
    await expect(page.getByText('Slots Detected')).toBeVisible();
    await expect(page.getByText('Last Booking')).toBeVisible();
  });

  test('Live Activity Feed panel is visible', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText('Live Activity Feed')).toBeVisible();
  });

  test('Active Targets panel is visible', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText('Active Targets')).toBeVisible();
  });

  test('system health badges are visible', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText(/Engine Online/i)).toBeVisible();
    await expect(page.getByText(/AES-256 Encrypted/i)).toBeVisible();
  });

  test('Command Center title is visible', async ({ page }) => {
    await page.goto('/dashboard');

    // The DashboardShell renders a "Command Center" heading
    await expect(page.getByText('Command Center').first()).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

const EMAIL = process.env.APP_USER_EMAIL || '';
const PASSWORD = process.env.APP_USER_PASSWORD || '';

test('login works (real app auth + session cookie)', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'APP_USER_EMAIL / APP_USER_PASSWORD not set');

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();

  // After login, middleware should allow landing on /.
  await page.waitForURL('**/');

  // Basic smoke: sidebar / app chrome should exist.
  await expect(page.getByText('小红书运营系统')).toBeVisible();
});

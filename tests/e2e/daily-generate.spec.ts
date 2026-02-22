import { test, expect } from '@playwright/test';

async function login(page: any) {
  const EMAIL = process.env.APP_USER_EMAIL || '';
  const PASSWORD = process.env.APP_USER_PASSWORD || '';
  if (!EMAIL || !PASSWORD) throw new Error('APP_USER_EMAIL / APP_USER_PASSWORD not set');

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/');
}

test('daily_generate produces a creative with text and images (real login + real DB)', async ({ page }) => {
  if (process.env.RUN_DAILY_GENERATE_E2E !== '1') {
    test.skip(true, 'set RUN_DAILY_GENERATE_E2E=1 to enable (slow + uses real providers)');
  }

  // Real generation is slow and can be variable (providers, image gen, queue).
  test.setTimeout(20 * 60 * 1000);

  await login(page);
  await page.goto('/e2e/daily-generate');

  // The page auto-runs once; still wait for it to finish.
  await expect(page.getByTestId('status')).toContainText('status:done', { timeout: 12 * 60 * 1000 });

  const statusText = await page.getByTestId('status').innerText();
  // Basic sanity: non-empty creative and at least one image.
  expect(statusText).toMatch(/creative:\d+/);
  expect(statusText).toMatch(/images:(\d+)/);

  const match = statusText.match(/images:(\d+)/);
  const images = match ? Number(match[1]) : 0;
  expect(images).toBeGreaterThan(0);

  const contentLenMatch = statusText.match(/contentLen:(\d+)/);
  const len = contentLenMatch ? Number(contentLenMatch[1]) : 0;
  expect(len).toBeGreaterThan(80);
});

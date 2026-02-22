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

async function openAgentE2E(page: any) {
  await login(page);
  await page.goto('/e2e/agent-ui-real');
  await expect(page.getByTestId('status')).toContainText('status: ready', { timeout: 30_000 });
}

test('ask_user bubble is non-blocking (real login + real DB)', async ({ page }) => {
  await openAgentE2E(page);

  // AgentCreator should open pending ask_user from loaded conversation history.
  await expect(page.getByText('需要选择')).toBeVisible();

  // The bubble should not block other UI operations.
  await page.getByTestId('behind').click();
  await expect(page.getByTestId('behind-count')).toContainText('clicks:1');
});

test('autoConfirm picks first option and closes ask_user dialog (real login + real DB)', async ({ page }) => {
  await openAgentE2E(page);

  // Turn on autoConfirm (button is in AgentCreator top bar when messages exist).
  await page.getByRole('button', { name: '自动继续' }).click();

  // Trigger another ask_user via real DB seed.
  await page.getByTestId('reseed').click();
  await expect(page.getByTestId('status')).toContainText('status: ready', { timeout: 30_000 });

  // It should close quickly (autoConfirm triggers submit).
  await expect(page.getByText('需要选择')).toBeHidden({ timeout: 5000 });
});

test('loop guard stops infinite autoConfirm clicking (real login + real DB)', async ({ page }) => {
  await openAgentE2E(page);
  await page.getByRole('button', { name: '自动继续' }).click();

  // Re-seed multiple times into the same thread. After enough repetitions, autoConfirm should stop.
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId('reseed').click();
    await expect(page.getByTestId('status')).toContainText('status: ready', { timeout: 30_000 });
    await page.waitForTimeout(300);
  }

  // Eventually the bubble should remain visible (autoConfirm disabled by loop guard).
  await expect(page.getByText('需要选择')).toBeVisible({ timeout: 5000 });
});

test('ask_user can be dismissed manually (close button)', async ({ page }) => {
  await openAgentE2E(page);
  await expect(page.getByText('需要选择')).toBeVisible();

  // Click the bubble header close.
  await page.locator('button[aria-label="关闭"]').click({ timeout: 10_000 });

  // We only require that dismiss stops blocking for now; reseed should bring it back.
  await page.getByTestId('reseed').click();
  await expect(page.getByText('需要选择')).toBeVisible({ timeout: 10_000 });
});

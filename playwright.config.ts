import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  use: {
    // Use a dedicated port so E2E doesn't depend on (or conflict with) your normal dev server.
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'NEXT_PUBLIC_E2E=0 npm run dev:next -- -p 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

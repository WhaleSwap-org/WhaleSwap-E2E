import { defineConfig } from '@playwright/test';
import { e2eConfig } from './e2e.config';

export default defineConfig({
  testDir: './tests/specs',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: e2eConfig.baseUrl,
    headless: e2eConfig.headless,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ]
});

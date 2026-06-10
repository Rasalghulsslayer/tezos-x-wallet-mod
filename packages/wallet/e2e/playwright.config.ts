import { defineConfig } from '@playwright/test';

const isCi = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  testDir:        './specs',
  fullyParallel:  false,
  forbidOnly:     isCi,
  retries:        isCi ? 1 : 0,
  workers:        isCi ? 2 : 4,
  timeout:        60_000,
  expect:         { timeout: 5_000 },
  reporter:       isCi ? [['list'], ['html', { open: 'never' }]] : 'list',

  globalSetup:    './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    trace:      'retain-on-failure',
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
  },

  projects: [
    {
      name: 'wallet-extension',
      testMatch: /.*\.spec\.ts/,
    },
  ],
});

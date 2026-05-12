import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './scripts/bench',
  testMatch: '**/browser-probes.spec.ts',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    baseURL: `http://localhost:${process.env.BENCH_PORT ?? 3001}`,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

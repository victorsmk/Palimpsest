import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Optional, machine-specific settings (kept out of git).
if (existsSync('.env.e2e.local')) process.loadEnvFile('.env.e2e.local');

const PORT = 3100;
const firefoxExecutable = process.env.PW_FIREFOX_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        ...(firefoxExecutable ? { launchOptions: { executablePath: firefoxExecutable } } : {}),
      },
    },
    // Playwright's own WebKit build: a close proxy for Safari's engine, not Safari itself.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // Test the production build, the closest thing to what users get.
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/studio`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});

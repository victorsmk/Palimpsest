import { defineConfig, devices } from '@playwright/test';

// The local demo (`npm run dev:demo`) tested for real: the browser, the screens, the Next route handlers and
// the database (Postgres inside the server process) are all the real ones, with nothing standing in for the
// server. Each test signs in as an address of its own, so they share the demo's one database.
//   npx playwright test -c playwright.demo.config.ts --project=chromium
const PORT = 3201;

export default defineConfig({
  testDir: './e2e-demo',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev-demo.mjs',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { PORT: String(PORT) },
  },
});

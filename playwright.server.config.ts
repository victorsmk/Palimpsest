import { defineConfig, devices } from '@playwright/test';

// The same app with its poems on the server (NEXT_PUBLIC_DATA_BACKEND=server) and the made-up sign-in, in
// development mode (the made-up sign-in is refused in a production build). The tests stand in for the
// server: they answer /api from the real API handlers on a real SQL database in the test process, so
// the browser, the screens and the handlers are all the real ones. Run it with:
//   npx playwright test -c playwright.server.config.ts --project=chromium
const PORT = 3101;

export default defineConfig({
  testDir: './e2e-server',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/studio`,
    // Always a server of its own: it has to be started with these settings.
    reuseExistingServer: false,
    timeout: 240_000,
    env: { NEXT_PUBLIC_DATA_BACKEND: 'server', NEXT_PUBLIC_TEST_AUTH: '1' },
  },
});

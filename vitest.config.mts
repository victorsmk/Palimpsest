import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Playwright specs live in e2e/ and run with `npm run test:e2e`.
    include: ['tests/**/*.test.{ts,tsx}'],
    // The first test to touch the 1.6 MB syllable map takes ~5s to load it.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});

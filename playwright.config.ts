import { defineConfig, devices } from '@playwright/test';

/** E2E runs against the production build served by `vite preview`; run `npm run build` first. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5183',
    viewport: { width: 1366, height: 820 },
    // Software WebGL in headless Chromium.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: {
    command: 'npx vite preview --port 5183 --strictPort',
    url: 'http://localhost:5183',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

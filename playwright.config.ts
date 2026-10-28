import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`; run `npm run build` first.
 * - `gpu`: every test, in installed Google Chrome with hardware WebGL (fast; needs Chrome and a GPU).
 * - `software`: the tests tagged @smoke, in Playwright's Chromium with software WebGL (SwiftShader),
 *   so the path without a GPU stays covered.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Software WebGL compiles the tissue shaders slowly (tens of seconds on first use).
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5183',
    viewport: { width: 1366, height: 820 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'gpu', timeout: 120_000, use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1366, height: 820 }, launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } } },
    { name: 'software', grep: /@smoke/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 }, launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
  ],
  webServer: {
    command: 'npx vite preview --port 5183 --strictPort',
    url: 'http://localhost:5183',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

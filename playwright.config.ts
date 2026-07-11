import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const gpuLaunchArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader-webgl',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Software WebGL helps headless Chromium in CI; still tolerate failures in the smoke test.
    launchOptions: {
      args: gpuLaunchArgs,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      // Chromium + phone viewport/UA/touch (not WebKit — CI only installs Chromium).
      name: 'chromium-phone',
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          args: gpuLaunchArgs,
        },
      },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

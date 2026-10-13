import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  // Tests share a timestamp and build on each other's data, so run them in order.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    // Allow pointing at a preinstalled browser instead of downloading one.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `pnpm start`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'e2e-secret' },
  },
})

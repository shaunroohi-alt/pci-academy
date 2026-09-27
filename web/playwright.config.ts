import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

const BASE = '/pci-academy'
const PORT = 4173
// Use the preinstalled Chromium when present (CI installs its own).
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

// The tests serve out/ under BASE, so the export must be built with that base
// path; otherwise every asset 404s and each test only fails at its timeout.
const index = new URL('out/index.html', import.meta.url)
if (!existsSync(index) || !readFileSync(index, 'utf8').includes(`${BASE}/_next/`)) {
  throw new Error(`out/ is missing or was not built for ${BASE}/. Run: BASE_PATH=${BASE}/ pnpm build`)
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node scripts/serve-static.mjs`,
    env: { BASE_PATH: BASE, PORT: String(PORT) },
    url: `http://localhost:${PORT}${BASE}/`,
    reuseExistingServer: !process.env.CI,
  },
})

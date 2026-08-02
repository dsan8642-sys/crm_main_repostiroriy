import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.SWIMCRM_PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const port = new URL(baseURL).port || '5173'

export default defineConfig({
  testDir: './tests',
  outputDir: './.playwright/test-results',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL,
  },
  webServer: process.env.SWIMCRM_PLAYWRIGHT_EXTERNAL_SERVER === '1' ? undefined : {
    command: `npm.cmd run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'chromium-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: 'chromium-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
})


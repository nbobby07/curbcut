import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4199',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4199',
    url: 'http://127.0.0.1:4199',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})

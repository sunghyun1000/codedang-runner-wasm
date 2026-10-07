import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev:playground -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false
  }
})

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'python3 -m http.server 8080',
    port: 8080,
    reuseExistingServer: true,
    timeout: 10_000
  }
});

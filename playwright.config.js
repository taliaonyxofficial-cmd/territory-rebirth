const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Игра — один статический index.html, поэтому достаточно простого сервера
  webServer: {
    command: 'npx http-server . -p 4173 -c-1 --silent',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});

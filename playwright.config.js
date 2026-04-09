module.exports = {
  testDir: './tests/e2e',
  webServer: {
    command: 'npx serve -p 3000 .',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
};

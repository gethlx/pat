const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  projects: [{ name: "electron" }],
});

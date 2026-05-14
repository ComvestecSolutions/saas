import { defineConfig } from "@playwright/test";

const repositoryRootDirectory = decodeURIComponent(
  new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3004",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run --cwd apps/admin-app dev -- --host 127.0.0.1",
    cwd: repositoryRootDirectory,
    url: "http://127.0.0.1:3004",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
